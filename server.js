// passeur-server — serveur arbitre du jeu « Le Passeur ».
//
// Même forme que les autres serveurs du portfolio (morpion, demicercle,
// imitation, ban, precision) : un seul WebSocket, du JSON, des rooms à code de
// 4 lettres, et une règle d'or — LE CLIENT N'A AUCUNE AUTORITÉ.
//
// Concrètement, ici, cela veut dire trois choses :
//   1. `situations.js` (les barèmes et les explications) ne quitte JAMAIS ce
//      dépôt. Le client reçoit le contexte d'une manche, jamais les notes.
//   2. Le temps de réponse est recoupé à l'horloge SERVEUR. Un client qui
//      annonce « j'ai répondu en 40 ms » ne sera pas cru : c'est l'écart entre
//      l'envoi de la manche et la réception de la réponse qui compte.
//   3. Les points sont calculés par engine.js, ici, et poussés aux clients.
//
// Progression pilotée par le MJ (l'hôte), comme les versions récentes des
// autres jeux : pas de timer de gameplay côté client.
const http = require('node:http');
const { WebSocketServer } = require('ws');
const { SITUATIONS, PASSES } = require('./situations.js');
const E = require('./engine.js');

const PORT = process.env.PORT || 8090;
const MS_LIMIT = 5000;          // temps de décision, en ms
const DEFAULT_ROUNDS = 6;
const MAX_PLAYERS = 8;
const GRACE_MS = 1200;          // tolérance réseau sur le temps de réponse

const rooms = new Map();

const code = () => {
  let c;
  do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join(''); }
  while (rooms.has(c));
  return c;
};

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const broadcast = (room, obj) => room.players.forEach((p) => send(p.ws, obj));

function publicPlayers(room) {
  return room.players.map((p) => ({
    id: p.id, name: p.name, avatar: p.avatar, score: p.score, host: p.id === room.hostId,
    answered: room.phase === 'play' ? !!p.answer : undefined,
  }));
}

function lobbyState(room) {
  return { type: 'lobby', code: room.code, players: publicPlayers(room), rounds: room.rounds };
}

// ---------------------------------------------------------------- manches
function startGame(room, rounds) {
  room.rounds = Math.max(3, Math.min(12, rounds || DEFAULT_ROUNDS));
  room.deck = E.deal(SITUATIONS, room.rounds, Math.random);
  room.roundIndex = -1;
  room.players.forEach((p) => { p.score = 0; });
  nextRound(room);
}

function nextRound(room) {
  room.roundIndex += 1;
  if (room.roundIndex >= room.deck.length) return endGame(room);
  const s = room.deck[room.roundIndex];
  room.phase = 'play';
  room.sentAt = Date.now();
  room.players.forEach((p) => { p.answer = null; });

  // Ce que le client a le droit de voir. Pas `scores`, pas `why`, pas `best`.
  broadcast(room, {
    type: 'round',
    index: room.roundIndex,
    of: room.deck.length,
    ctx: s.ctx, ctx_en: s.ctx_en,
    detail: s.detail, detail_en: s.detail_en,
    msLimit: MS_LIMIT,
    players: publicPlayers(room),
  });

  // Filet anti-blocage : si un joueur ne répond jamais, la manche se résout
  // quand même. Le serveur ne dépend jamais d'un client pour avancer.
  clearTimeout(room.timer);
  room.timer = setTimeout(() => resolveRound(room), MS_LIMIT + GRACE_MS);
}

function resolveRound(room) {
  if (room.phase !== 'play') return;
  clearTimeout(room.timer);
  room.phase = 'results';
  const s = room.deck[room.roundIndex];
  const best = E.bestOf(s);

  const results = room.players.map((p) => {
    const a = p.answer;
    // Temps recoupé à l'horloge serveur : on ignore ce que le client raconte.
    const elapsed = a ? Math.max(0, a.at - room.sentAt) : MS_LIMIT;
    const left = Math.max(0, MS_LIMIT - elapsed);
    const r = E.scoreFor(s, a ? a.passId : null, left, MS_LIMIT);
    p.score += r.points;
    return {
      id: p.id, name: p.name, avatar: p.avatar,
      passId: a ? a.passId : null,
      points: r.points, relevance: r.relevance, timedOut: r.timedOut,
      wasBest: a ? a.passId === best : false,
      why: a ? s.why[a.passId] : null,
      why_en: a ? s.why_en[a.passId] : null,
      score: p.score,
    };
  });

  broadcast(room, {
    type: 'results',
    index: room.roundIndex,
    of: room.deck.length,
    best,
    bestLabel: (PASSES.find((x) => x.id === best) || {}).label,
    bestLabel_en: (PASSES.find((x) => x.id === best) || {}).label_en,
    bestWhy: s.why[best],
    bestWhy_en: s.why_en[best],
    results,
    last: room.roundIndex >= room.deck.length - 1,
  });
}

function endGame(room) {
  room.phase = 'end';
  clearTimeout(room.timer);
  const ranked = room.players.slice().sort((a, b) => b.score - a.score).map((p) => {
    const g = E.grade(p.score, room.deck.length);
    return { id: p.id, name: p.name, avatar: p.avatar, score: p.score, avg: g.avg, title: g.title, title_en: g.title_en };
  });
  broadcast(room, { type: 'end', ranking: ranked });
}

// ------------------------------------------------------------- transport
const server = http.createServer((req, res) => {
  // Render veut une réponse HTTP pour son health check.
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('passeur-server ok\n');
});
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let room = null, me = null;

  const fail = (message) => send(ws, { type: 'error', message });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return fail('message illisible'); }

    if (msg.action === 'join') {
      const name = String(msg.name || '').trim().slice(0, 16) || 'Joueur';
      const avatar = String(msg.avatar || '🏐').slice(0, 4);
      if (msg.code) {
        room = rooms.get(String(msg.code).toUpperCase().trim());
        if (!room) return fail('aucune partie avec ce code');
        if (room.players.length >= MAX_PLAYERS) return fail('partie complète');
        if (room.phase !== 'lobby') return fail('partie déjà commencée');
      } else {
        const c = code();
        room = { code: c, players: [], hostId: null, phase: 'lobby', rounds: DEFAULT_ROUNDS, timer: null };
        rooms.set(c, room);
      }
      me = { id: Math.random().toString(36).slice(2, 9), ws, name, avatar, score: 0, answer: null };
      room.players.push(me);
      if (!room.hostId) room.hostId = me.id;
      send(ws, { type: 'you', id: me.id, code: room.code, host: room.hostId === me.id });
      broadcast(room, lobbyState(room));
      return;
    }

    if (!room || !me) return fail('pas encore dans une partie');

    if (msg.action === 'start') {
      if (me.id !== room.hostId) return fail("seul le MJ lance la partie");
      if (room.players.length < 1) return fail('il faut au moins 1 joueur');
      // Le MJ peut relancer depuis le salon, l'écran de résultats ou la fin
      // (« rejouer »). Le seul moment interdit est pendant une manche : on ne
      // coupe pas la parole à des joueurs en train de décider.
      if (room.phase === 'play') return fail('manche en cours');
      return startGame(room, msg.rounds);
    }

    if (msg.action === 'answer') {
      if (room.phase !== 'play') return;                 // hors phase : on ignore
      if (me.answer) return;                             // une seule réponse
      if (!PASSES.some((p) => p.id === msg.passId)) return fail('passe inconnue');
      // On note l'INSTANT SERVEUR, pas le chrono annoncé par le client.
      me.answer = { passId: msg.passId, at: Date.now() };
      broadcast(room, { type: 'answered', players: publicPlayers(room) });
      if (room.players.every((p) => p.answer)) resolveRound(room);
      return;
    }

    if (msg.action === 'next') {
      if (me.id !== room.hostId) return fail('seul le MJ fait avancer');
      if (room.phase !== 'results') return;
      return nextRound(room);
    }

    if (msg.action === 'lobby') {
      if (me.id !== room.hostId) return fail('seul le MJ peut revenir au salon');
      room.phase = 'lobby';
      clearTimeout(room.timer);
      return broadcast(room, lobbyState(room));
    }
  });

  ws.on('close', () => {
    if (!room || !me) return;
    room.players = room.players.filter((p) => p !== me);
    if (!room.players.length) {
      clearTimeout(room.timer);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === me.id) room.hostId = room.players[0].id;
    // Le départ d'un joueur ne doit pas bloquer une manche en cours.
    if (room.phase === 'play' && room.players.every((p) => p.answer)) resolveRound(room);
    else broadcast(room, room.phase === 'lobby' ? lobbyState(room) : { type: 'answered', players: publicPlayers(room) });
  });
});

server.listen(PORT, () => console.log(`passeur-server à l'écoute sur :${PORT}`));

module.exports = { server, wss, rooms };
