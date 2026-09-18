// Tests des RÈGLES DE VOLLEY (rules.js). Aucune dépendance, aucun réseau :
//     node test-rules.mjs
//
// Référence : FIVB Official Volleyball Rules 2025-2028. Chaque test porte le
// numéro de la règle qu'il protège, pour qu'une modification future sache ce
// qu'elle est en train de casser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('./rules.js');
const { SITUATIONS } = require('./situations.js');

let ok = 0, ko = 0;
const t = (name, cond) => {
  if (cond) { ok++; console.log('OK   ' + name); }
  else { ko++; console.log('KO   ' + name); }
};

// --- 7.4 : positions, ligne avant / ligne arrière -------------------------
t('7.4 — la ligne avant, c est P4 P3 P2', R.FRONT_POS.join(',') === '4,3,2');
t('7.4 — la ligne arriere, c est P5 P6 P1', R.BACK_POS.join(',') === '5,6,1');
t('7.4 — P2, P3, P4 sont avant',
  [2, 3, 4].every(R.isFront) && ![2, 3, 4].some(R.isBack));
t('7.4 — P1, P5, P6 sont arriere',
  [1, 5, 6].every(R.isBack) && ![1, 5, 6].some(R.isFront));

t('7.4 — les six rotations contiennent les six roles, une fois chacun',
  [0, 1, 2, 3, 4, 5].every((i) => R.legalLineup(R.lineup(i))));
t('7.4 — une composition avec un doublon est refusee',
  !R.legalLineup(['setter', 'setter', 'oh1', 'opp', 'mb2', 'oh2']));
t('7.4 — une composition incomplete est refusee', !R.legalLineup(['setter', 'mb1']));

// Tourner six fois ramene a la rotation de depart.
t('7.4 — six rotations ramenent a la composition de depart',
  R.lineup(6).join(',') === R.lineup(0).join(','));
t('7.4 — une rotation fait passer le joueur de P2 en P1',
  R.roleAt(R.lineup(1), 1) === R.roleAt(R.lineup(0), 2));

// Deux roles opposes sont a trois positions d ecart : il y en a donc toujours
// exactement un des deux en ligne avant. C est ce qui garantit qu une rotation
// a toujours un central avant, un receptionneur-attaquant avant, et soit le
// passeur soit le pointu.
[0, 1, 2, 3, 4, 5].forEach((i) => {
  const lu = R.lineup(i);
  const front = R.FRONT_POS.map((p) => R.roleAt(lu, p));
  const one = (a, b) => (front.includes(a) ? 1 : 0) + (front.includes(b) ? 1 : 0) === 1;
  t('7.4 — rotation ' + i + ' : un seul de chaque paire d opposes est avant',
    one('setter', 'opp') && one('mb1', 'mb2') && one('oh1', 'oh2'));
});

// --- qui joue quoi, une fois que tout le monde a bouge (7.6) --------------
t('7.6 — apres le service, le receptionneur-attaquant attaque en poste 4 quelle que soit sa position',
  [0, 1, 2, 3, 4, 5].every((i) => {
    const lu = R.lineup(i);
    const own = R.owners(lu);
    return own.gauche === 'oh1' || own.gauche === 'oh2';
  }));
t('7.6 — le poste 4 est toujours tenu par le receptionneur-attaquant AVANT',
  [0, 1, 2, 3, 4, 5].every((i) => {
    const lu = R.lineup(i);
    return R.isFront(R.posOf(lu, R.owners(lu).gauche));
  }));
t('7.6 — la rapide est toujours tenue par le central AVANT',
  [0, 1, 2, 3, 4, 5].every((i) => {
    const lu = R.lineup(i);
    return R.isFront(R.posOf(lu, R.owners(lu).courte));
  }));
t('7.6 — l attaque arriere est toujours tenue par un joueur ARRIERE',
  [0, 1, 2, 3, 4, 5].every((i) => {
    const lu = R.lineup(i);
    return R.isBack(R.posOf(lu, R.owners(lu).arriere));
  }));

// --- 13.2.2 : ce qu un joueur arriere a le droit de faire ----------------
// On teste la REGLE sur l action, pas le raccourci « arriere = interdit ».
// 13.2.2 : un arriere peut conclure une attaque ; ce qu il ne peut pas, c est
// conclure AU-DESSUS DU FILET DEPUIS LA ZONE AVANT.
const FRONT_ZONE_DUMP = { ball: 'above-net', takeoff: 'front-zone' };
const BEHIND_LINE = { ball: 'above-net', takeoff: 'behind-line' };
const LOW_TOUCH = { ball: 'below-net', takeoff: 'front-zone' };

t('13.2.2 — un AVANT peut conclure au-dessus du filet depuis la zone avant',
  R.attackFault(FRONT_ZONE_DUMP, true) === null);
t('13.2.2 — un ARRIERE ne peut PAS conclure au-dessus du filet depuis la zone avant',
  /13\.2\.2/.test(R.attackFault(FRONT_ZONE_DUMP, false) || ''));
t('13.2.2 — un ARRIERE peut conclure au-dessus du filet avec appel derriere la ligne',
  R.attackFault(BEHIND_LINE, false) === null);
t('13.2.2 — un ARRIERE peut jouer le ballon SOUS le niveau du filet en zone avant',
  R.attackFault(LOW_TOUCH, false) === null);
// Et l'action que le jeu represente pour la 2e main est bien celle-la : le
// ballon poussé par-dessus le filet depuis la zone avant.
t("l action « deuxieme main » du jeu est une conclusion au-dessus du filet, en zone avant",
  R.ACTION.deuxieme.ball === 'above-net' && R.ACTION.deuxieme.takeoff === 'front-zone');
t("les quatre distributions vers un attaquant partent, elles, derriere la ligne",
  ['gauche', 'courte', 'droite', 'arriere']
    .every((k) => R.ACTION[k].takeoff === 'behind-line'));

t('13.2.2 — la deuxieme main est donc LEGALE quand le passeur est avant',
  [3, 4, 5].every((i) => R.legality(R.lineup(i)).deuxieme.legal === true));
t('13.2.2 — et INTERDITE quand le passeur est arriere',
  [0, 1, 2].every((i) => R.legality(R.lineup(i)).deuxieme.legal === false));
t('chaque option transporte l action sur laquelle elle a ete jugee',
  [0, 3].every((i) => {
    const leg = R.legality(R.lineup(i));
    return Object.keys(leg).every((k) => leg[k].action && leg[k].action.ball);
  }));
t('13.2.2 — et le refus est explique en francais',
  [0, 1, 2].every((i) => /13\.2\.2/.test(R.legality(R.lineup(i)).deuxieme.why || '')));
t('13.2.2 — l attaque arriere reste legale, avec la mention de l appel',
  [0, 1, 2, 3, 4, 5].every((i) => {
    const l = R.legality(R.lineup(i)).arriere;
    return l.legal === true && /3 m/.test(l.note || '');
  }));
t('13.2.2 — un attaquant arriere sur une aile est legal, mais on rappelle l appel',
  [0, 1, 2, 3, 4, 5].every((i) => {
    const l = R.legality(R.lineup(i)).droite;
    return l.legal === true && (l.front || /3 m/.test(l.note || ''));
  }));

// La ligne des 3 m n est pas un mur : rien dans le modele n interdit a un
// arriere d etre devant. Ce test existe pour qu on ne reintroduise pas cette
// erreur en croyant bien faire.
t('7.6 — AUCUNE regle n interdit a un joueur arriere d aller dans la zone avant',
  [0, 1, 2].every((i) => {
    const leg = R.legality(R.lineup(i));
    // Le passeur arriere monte au filet pour distribuer : ses options d aile
    // restent legales, seule sa propre attaque au-dessus du filet ne l est pas.
    return leg.gauche.legal && leg.courte.legal && leg.droite.legal;
  }));

// --- 14.6.2 : le bloc ----------------------------------------------------
t('14.6.2 — au plus trois contreurs, puisque seuls les avants peuvent contrer',
  R.maxBlockers() === 3);
t('14.6.2 — une scene avec quatre contreurs est refusee',
  R.checkScene({ lineup: R.lineup(0), reception: { by: 'oh2' }, block: { count: 4 },
    options: R.legality(R.lineup(0)) }).some((p) => /14\.6\.2/.test(p)));

// --- les scenes construites ----------------------------------------------
const sc0 = R.buildScene({ rotation: 0, block: { count: 2 } });
t('buildScene — la composition est legale', R.legalLineup(sc0.lineup));
t('buildScene — rotation 0 : le passeur est en P1, donc arriere',
  sc0.setter.pos === 1 && sc0.setter.front === false);
t('buildScene — chaque option sait qui la joue, ou, et si c est legal',
  ['gauche', 'courte', 'deuxieme', 'droite', 'arriere'].every((k) => {
    const o = sc0.options[k];
    return o && o.by && o.pos >= 1 && o.pos <= 6 && typeof o.front === 'boolean'
      && typeof o.legal === 'boolean';
  }));
t('buildScene — une scene construite passe son propre controle',
  R.checkScene(sc0).length === 0);
t('LA SCENE NE CONTIENT AUCUNE TRACE DU BAREME',
  !/score|why_|best|relevance|points/i.test(JSON.stringify(sc0).replace(/"why":"[^"]*13\.2\.2[^"]*"/g, '')));

// --- les douze situations du jeu -----------------------------------------
t('les 12 situations decrivent une rotation valide',
  SITUATIONS.every((s) => s.scene && R.legalLineup(s.scene.lineup)));
t('les 12 situations passent le controle des regles',
  SITUATIONS.every((s) => R.checkScene(s.scene).length === 0));
t('le MEILLEUR choix d une situation est toujours une option LEGALE',
  SITUATIONS.every((s) => {
    const best = Object.keys(s.scores).reduce((a, b) => (s.scores[b] > s.scores[a] ? b : a));
    return s.scene.options[best].legal;
  }));
// Sinon le barème dirait « bonne idée » d une action que l arbitre sifflerait.
t('aucune option interdite n est notee 50 ou plus',
  SITUATIONS.every((s) => Object.keys(s.scores)
    .every((k) => s.scene.options[k].legal || s.scores[k] < 50)));
t('les deux cas de figure sont representes : passeur avant ET passeur arriere',
  SITUATIONS.some((s) => s.scene.setter.front) && SITUATIONS.some((s) => !s.scene.setter.front));
t('chaque situation annonce une duree de mise en situation credible',
  SITUATIONS.every((s) => s.scene.introMs >= 1500 && s.scene.introMs <= 3000));
t('chaque situation a un service et une reception',
  SITUATIONS.every((s) => ['left', 'center', 'right'].includes(s.scene.serve)
    && s.scene.reception && s.scene.reception.by && s.scene.reception.quality));
t('le receptionneur est bien un joueur de la composition',
  SITUATIONS.every((s) => s.scene.lineup.includes(s.scene.reception.by)));
// Un passeur ne réceptionne pas sa propre balle : en 5-1 c'est le
// réceptionneur-attaquant arrière qui prend le service.
t('LE PASSEUR NE RECEPTIONNE JAMAIS',
  SITUATIONS.every((s) => s.scene.reception.by !== 'setter'));
t('le receptionneur est un joueur de la ligne ARRIERE',
  SITUATIONS.every((s) => R.isBack(s.scene.reception.pos)));
t('le receptionneur est aussi l attaquant de la pipe (c est le meme joueur)',
  SITUATIONS.every((s) => s.scene.reception.by === s.scene.options.arriere.by));

console.log('\n' + (ko
  ? 'DES TESTS ÉCHOUENT — ' + ko + ' échec(s) sur ' + (ok + ko)
  : 'TOUT PASSE — ' + ok + ' vérifications, 0 échec(s)'));
process.exit(ko ? 1 : 0);
