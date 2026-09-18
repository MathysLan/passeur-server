// Test bout en bout du serveur : de vrais clients WebSocket jouent une partie
// complète et vérifient les règles — surtout celles qui protègent le jeu.
//
//   npm test        (moteur puis ce fichier)
//   node test.js
//
// Le serveur est démarré dans ce même processus sur un port de test.
process.env.PORT = process.env.PORT || '8791';
const WebSocket = require('ws');
require('./server.js');

const URL = `ws://127.0.0.1:${process.env.PORT}`;
let ok = 0, ko = 0;
const t = (name, cond) => {
  if (cond) { ok++; console.log('OK   ' + name); }
  else { ko++; console.log('KO   ' + name); }
};

// Un petit client : il garde tous les messages reçus et sait en attendre un.
function client(name) {
  const ws = new WebSocket(URL);
  const c = { ws, name, msgs: [], waiters: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    c.msgs.push(m);
    c.waiters = c.waiters.filter((w) => {
      if (w.type !== m.type) return true;
      w.resolve(m);
      return false;
    });
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = (type, ms = 4000) => new Promise((resolve, reject) => {
    const found = c.msgs.find((m) => m.type === type);
    if (found) return resolve(found);
    const w = { type, resolve };
    c.waiters.push(w);
    setTimeout(() => { if (c.waiters.includes(w)) reject(new Error(`${name} : pas de « ${type} »`)); }, ms);
  });
  c.clear = () => { c.msgs.length = 0; };
  c.open = () => new Promise((r) => ws.on('open', r));
  return c;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const mj = client('MJ');
  await mj.open();
  mj.send({ action: 'join', name: 'Mathys', avatar: '🏐' });
  const you = await mj.wait('you');
  t('créer une partie renvoie un code à 4 lettres', /^[A-Z]{4}$/.test(you.code));
  t("le premier arrivé est le MJ", you.host === true);

  const j2 = client('J2');
  await j2.open();
  j2.send({ action: 'join', name: 'Camille', avatar: '🦊', code: you.code });
  const you2 = await j2.wait('you');
  t('un second joueur rejoint par code', you2.code === you.code && you2.host === false);

  const lobby = await j2.wait('lobby');
  t('le salon liste les deux joueurs', lobby.players.length === 2);
  t('le salon ne fuite aucune situation', !JSON.stringify(lobby).includes('scores'));

  // Un joueur qui n'est pas MJ ne lance pas la partie.
  j2.clear();
  j2.send({ action: 'start' });
  const err = await j2.wait('error');
  t('seul le MJ peut lancer la partie', /MJ/.test(err.message));

  // --- une partie de 3 manches
  mj.clear(); j2.clear();
  mj.send({ action: 'start', rounds: 3 });
  const r1 = await mj.wait('round');
  t('la manche donne le contexte', !!r1.ctx && !!r1.detail && r1.of === 3);
  t("LA MANCHE NE CONTIENT PAS LE BARÈME",
    r1.scores === undefined && r1.why === undefined && r1.best === undefined
    && !JSON.stringify(r1).includes('Meilleur'));
  t('la limite de temps est annoncée', r1.msLimit === 5000);

  // Réponse rapide du MJ, puis du second joueur.
  mj.clear(); j2.clear();
  mj.send({ action: 'answer', passId: 'courte' });
  const answered = await j2.wait('answered');
  t('les autres voient qui a répondu, sans savoir quoi',
    answered.players.some((p) => p.answered) && !JSON.stringify(answered).includes('courte'));

  // Double réponse : ignorée.
  mj.send({ action: 'answer', passId: 'gauche' });
  // Passe inexistante : refusée.
  j2.clear();
  j2.send({ action: 'answer', passId: 'coup-du-lapin' });
  const errPass = await j2.wait('error');
  t('une passe inconnue est refusée', /passe inconnue/.test(errPass.message));

  j2.clear(); mj.clear();
  j2.send({ action: 'answer', passId: 'gauche' });
  const res = await mj.wait('results');
  t('les résultats arrivent quand tout le monde a répondu', res.results.length === 2);
  t('les résultats donnent enfin le meilleur choix et pourquoi', !!res.best && !!res.bestWhy);
  t('chaque joueur a des points et son total', res.results.every((r) => typeof r.points === 'number' && typeof r.score === 'number'));
  t('la double réponse a été ignorée',
    res.results.find((r) => r.name === 'Mathys').passId === 'courte');

  // Le MJ fait avancer.
  mj.clear(); j2.clear();
  j2.send({ action: 'next' });
  const err2 = await j2.wait('error');
  t('seul le MJ fait avancer', /MJ/.test(err2.message));
  mj.send({ action: 'next' });
  const r2 = await mj.wait('round');
  t('manche suivante', r2.index === 1);

  // --- le filet anti-blocage : personne ne répond
  mj.clear(); j2.clear();
  const late = await mj.wait('results', 9000);
  t('une manche se résout même si personne ne répond', late.results.every((r) => r.timedOut === true));
  t('ne pas répondre ne rapporte rien', late.results.every((r) => r.points === 0));

  // --- dernière manche puis fin
  mj.clear();
  mj.send({ action: 'next' });
  await mj.wait('round');
  mj.send({ action: 'answer', passId: 'droite' });
  j2.send({ action: 'answer', passId: 'arriere' });
  const res3 = await mj.wait('results');
  t('la dernière manche est signalée', res3.last === true);
  mj.clear();
  mj.send({ action: 'next' });
  const end = await mj.wait('end');
  t('le classement final est trié', end.ranking.length === 2
    && end.ranking[0].score >= end.ranking[1].score);
  t('chaque joueur reçoit une note sur 100 et un titre',
    end.ranking.every((r) => typeof r.avg === 'number' && !!r.title));

  // --- anti-triche : le temps vient de l'horloge serveur
  mj.clear(); j2.clear();
  mj.send({ action: 'start', rounds: 1 });
  await mj.wait('round');
  await sleep(2600);                       // on traîne volontairement
  mj.clear();
  mj.send({ action: 'answer', passId: 'courte' });
  j2.send({ action: 'answer', passId: 'courte' });
  const slow = await mj.wait('results');
  const mine = slow.results.find((r) => r.name === 'Mathys');
  t('répondre lentement rapporte moins que la pertinence brute',
    mine.points < mine.relevance);

  // --- le départ d'un joueur ne bloque pas la partie
  mj.clear();
  mj.send({ action: 'start', rounds: 2 });
  await mj.wait('round');
  mj.clear();
  j2.ws.close();
  mj.send({ action: 'answer', passId: 'gauche' });
  const alone = await mj.wait('results', 9000);
  t('un joueur qui quitte ne bloque pas la manche', alone.results.length === 1);

  mj.ws.close();
  console.log(`\n${ko ? 'DES TESTS ECHOUENT' : 'TOUT PASSE'} — ${ok + ko} vérifications, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch((e) => {
  console.error('\nÉCHEC : ' + e.message);
  process.exit(1);
});
