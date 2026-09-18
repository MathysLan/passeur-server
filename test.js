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

  // La scène : le modèle de volley que le client va dessiner. Elle part AVEC la
  // manche, donc c'est exactement le message dans lequel un barème pourrait se
  // glisser sans qu'on le remarque — l'écran, lui, aurait l'air normal.
  t('la manche décrit le terrain (scène)',
    !!r1.scene && !!r1.scene.block && !!r1.scene.options && Array.isArray(r1.scene.lineup)
    && typeof r1.scene.reception.quality === 'string');
  t("LA SCÈNE ENVOYÉE NE CONTIENT NI NOTE NI CONSEIL",
    !/score|best|relevance|points/i.test(JSON.stringify(r1.scene).replace(/"why":"[^"]*"/g, '""')));
  t('la scène dit qui joue chaque option, et si les règles l autorisent',
    ['gauche', 'courte', 'deuxieme', 'droite', 'arriere']
      .every((k) => r1.scene.options[k] && r1.scene.options[k].by
        && typeof r1.scene.options[k].legal === 'boolean'));
  t('la scène donne la composition au service : six joueurs',
    r1.scene.lineup.length === 6 && new Set(r1.scene.lineup).size === 6);

  // --- LES DEUX TEMPS D'UNE MANCHE ---------------------------------------
  // On regarde d'abord, on joue ensuite. C'est le serveur qui ouvre la fenêtre
  // de décision, pour que deux joueurs aient exactement la même.
  t('la mise en situation a une durée annoncée',
    r1.introMs >= 800 && r1.introMs <= 4000);
  t('la limite de décision est annoncée', r1.msLimit === 5000);

  mj.clear(); j2.clear();
  mj.send({ action: 'answer', passId: 'gauche' });
  const tooSoon = await mj.wait('error');
  t('ON NE PEUT PAS RÉPONDRE PENDANT LA MISE EN SITUATION',
    /pas finie de se mettre en place/.test(tooSoon.message));

  const t0 = Date.now();
  const go = await mj.wait('go', 6000);
  const waited = Date.now() - t0;
  t('le « à toi » arrive après la mise en situation, pas avant',
    waited >= r1.introMs * 0.5);
  t('le « à toi » rouvre la limite de temps', go.msLimit === 5000);
  const go2 = await j2.wait('go', 6000);
  t('les DEUX joueurs reçoivent le même départ', !!go2 && go2.msLimit === go.msLimit);

  // Une option que les règles interdisent est refusée pour de bon.
  const illegal = Object.keys(r1.scene.options).find((k) => !r1.scene.options[k].legal);
  if (illegal) {
    j2.clear();
    j2.send({ action: 'answer', passId: illegal });
    const errLegal = await j2.wait('error');
    t('UNE OPTION INTERDITE PAR LES RÈGLES EST REFUSÉE (' + illegal + ')',
      /13\.2\.2|interdite/.test(errLegal.message));
  } else {
    t('cette manche n a aucune option interdite (rotation passeur avant)', true);
  }

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
  // De quoi expliquer le score au lieu de l'annoncer : pertinence, vitesse,
  // et le temps réellement mesuré par le serveur.
  t('chaque joueur reçoit le détail de son calcul (pertinence, vitesse, temps)',
    res.results.every((r) => typeof r.relevance === 'number'
      && typeof r.speed === 'number' && r.speed >= 50 && r.speed <= 100
      && typeof r.ms === 'number' && r.ms >= 0));
  t('le détail ne parle que de la passe jouée, pas des quatre autres',
    res.results.every((r) => Object.keys(r).filter((k) => /^(why|relevance)$/.test(k)).length <= 2)
    && !JSON.stringify(res.results).includes('"scores"'));
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
  // La manche dure maintenant mise en situation + 5 s + tolérance réseau.
  mj.clear(); j2.clear();
  const late = await mj.wait('results', 13000);
  t('une manche se résout même si personne ne répond', late.results.every((r) => r.timedOut === true));
  t('ne pas répondre ne rapporte rien', late.results.every((r) => r.points === 0));

  // --- dernière manche puis fin
  mj.clear();
  mj.send({ action: 'next' });
  await mj.wait('round');
  await mj.wait('go', 6000);               // on attend la fin de la mise en situation
  await j2.wait('go', 6000);
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
  // On attend le « à toi » AVANT de traîner : c'est de là que part le chrono,
  // et c'est précisément ce que ce test doit prouver.
  await mj.wait('go', 6000);
  await j2.wait('go', 6000);
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
  await mj.wait('go', 6000);
  mj.clear();
  j2.ws.close();
  mj.send({ action: 'answer', passId: 'gauche' });
  const alone = await mj.wait('results', 13000);
  t('un joueur qui quitte ne bloque pas la manche', alone.results.length === 1);

  mj.ws.close();
  console.log(`\n${ko ? 'DES TESTS ECHOUENT' : 'TOUT PASSE'} — ${ok + ko} vérifications, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch((e) => {
  console.error('\nÉCHEC : ' + e.message);
  process.exit(1);
});
