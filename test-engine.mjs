// Tests du moteur du Passeur. Node ≥ 18, aucune dépendance :
//
//   node games/passeur/test-engine.mjs
//
// Le moteur est pur, donc il se teste sans navigateur — c'est tout l'intérêt de
// l'avoir séparé. On vérifie surtout deux choses : le barème (pertinence ×
// vitesse) et le fait qu'une manche ne divulgue JAMAIS la réponse avant que le
// joueur ait répondu.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { PASSES, SITUATIONS } = require(path.join(here, 'situations.js'));
const E = require(path.join(here, 'engine.js'));

let ok = 0, ko = 0;
const t = (name, cond) => {
  if (cond) { ok++; console.log('OK   ' + name); }
  else { ko++; console.log('KO   ' + name); }
};

// ------------------------------------------------------------- les données
t(`${SITUATIONS.length} situations chargées`, SITUATIONS.length >= 10);
const ids = new Set(PASSES.map((p) => p.id));
t('5 passes distinctes', ids.size === 5 && PASSES.length === 5);

t('chaque situation note les 5 passes, de 0 à 100',
  SITUATIONS.every((s) => PASSES.every((p) =>
    typeof s.scores[p.id] === 'number' && s.scores[p.id] >= 0 && s.scores[p.id] <= 100)));
t('chaque situation explique les 5 passes (FR et EN)',
  SITUATIONS.every((s) => PASSES.every((p) =>
    (s.why[p.id] || '').length > 10 && (s.why_en[p.id] || '').length > 10)));
t('chaque situation a un contexte FR et EN',
  SITUATIONS.every((s) => s.ctx && s.ctx_en && s.detail && s.detail_en));
t('identifiants de situation uniques',
  new Set(SITUATIONS.map((s) => s.id)).size === SITUATIONS.length);
// --- la scène : ce que le client dessine ---------------------------------
// Le client ne connaît aucune situation en particulier, il sait seulement
// dessiner une scène. Une valeur non prévue ici sortirait donc un terrain muet
// chez le joueur, sans la moindre erreur JS pour le signaler.
//
// Les règles de volley elles-mêmes (rotation, avant/arrière, ce qui est
// autorisé) sont testées à part, dans test-rules.mjs.
const RECEPTIONS = ['perfect', 'ok', 'short', 'deep', 'high', 'scramble'];
const FROMS = ['left', 'center', 'right'];
const FOCUS = ['spread', 'middle', 'left', 'right', 'setter'];
const STATES = ['ready', 'running', 'free', 'marked', 'tired', 'hot', 'down'];

t('chaque situation décrit sa scène',
  SITUATIONS.every((s) => s.scene && s.scene.block && s.scene.options && s.scene.lineup));
t('réception et service sont des valeurs connues',
  SITUATIONS.every((s) => RECEPTIONS.includes(s.scene.reception.quality)
    && FROMS.includes(s.scene.serve)));
t('le bloc est décrit par un nombre de contreurs, un départ, une cible et un retard',
  SITUATIONS.every((s) => s.scene.block.count >= 0 && s.scene.block.count <= 3
    && FOCUS.includes(s.scene.block.start) && FOCUS.includes(s.scene.block.target)
    && typeof s.scene.block.late === 'boolean'));
t('chaque option porte un état d attaquant connu',
  SITUATIONS.every((s) => ['gauche', 'courte', 'droite', 'arriere']
    .every((k) => STATES.includes(s.scene.options[k].state))));

// LA règle de ce champ : il décrit le terrain, il ne souffle pas la réponse.
// `why` y existe, mais uniquement pour expliquer un REFUS de règle (« passeur
// arrière »), jamais pour commenter la qualité d'un choix — on le vérifie.
t('LA SCÈNE NE CONTIENT AUCUNE TRACE DU BARÈME',
  SITUATIONS.every((s) => {
    const sansRefus = JSON.stringify(s.scene).replace(/"why":"[^"]*"/g, '""');
    if (/score|best|points|relevance/i.test(sansRefus)) return false;
    // On compare des NOMBRES, pas des sous-chaînes : la scène contient
    // maintenant des chiffres parfaitement légitimes (numéro de position,
    // durée de la mise en situation), et « 2600 » contient « 0 ».
    const dans = new Set((sansRefus.match(/-?\d+(?:\.\d+)?/g) || []));
    return !PASSES.some((p) => s.scores[p.id] >= 10 && dans.has(String(s.scores[p.id])));
  }));
t('les seuls `why` de la scène sont des refus de règle, pas des conseils',
  SITUATIONS.every((s) => Object.values(s.scene.options)
    .every((o) => !o.why || /\d+\.\d+/.test(o.why))));
// Et elle doit rester cohérente avec la prose, sinon le terrain raconte une
// histoire et le texte une autre.
t('un attaquant « à terre » n est jamais le meilleur choix',
  SITUATIONS.every((s) => ['gauche', 'courte', 'droite', 'arriere']
    .every((k) => s.scene.options[k].state !== 'down' || E.bestOf(s) !== k)));

// Sans mauvais choix, il n'y a pas de décision à prendre.
t('chaque situation a un choix clairement meilleur et un clairement mauvais',
  SITUATIONS.every((s) => {
    const v = PASSES.map((p) => s.scores[p.id]);
    return Math.max(...v) >= 85 && Math.min(...v) <= 50;
  }));

// ------------------------------------------------------------- le barème
const s0 = SITUATIONS[0];
const best = E.bestOf(s0);
t('bestOf() trouve la passe la mieux notée',
  s0.scores[best] === Math.max(...PASSES.map((p) => s0.scores[p.id])));

const fast = E.scoreFor(s0, best, 5000, 5000);
const slow = E.scoreFor(s0, best, 0, 5000);
t('répondre juste et vite vaut la note pleine', fast.points === s0.scores[best]);
t('répondre juste au dernier moment vaut la moitié',
  slow.points === Math.round(s0.scores[best] * E.SPEED_FLOOR));
t('la vitesse ne peut pas faire monter au-dessus de la pertinence',
  fast.points <= 100 && fast.points === s0.scores[best]);
t('ne pas répondre vaut 0', E.scoreFor(s0, null, 0, 5000).points === 0);
t('ne pas répondre est signalé comme un dépassement', E.scoreFor(s0, null, 0, 5000).timedOut === true);
t('un temps restant aberrant est ramené dans les bornes',
  E.scoreFor(s0, best, 999999, 5000).points === s0.scores[best]
  && E.scoreFor(s0, best, -50, 5000).points === Math.round(s0.scores[best] * E.SPEED_FLOOR));

let threw = false;
try { E.scoreFor(s0, 'smash-retourné', 100, 5000); } catch (_) { threw = true; }
t('une passe inconnue est refusée', threw);

// ------------------------------------------------------ tirage des manches
const deck = E.deal(SITUATIONS, 6, Math.random);
t('un tirage de 6 manches ne répète aucune situation',
  new Set(deck.map((s) => s.id)).size === 6);
t('demander plus de manches que de situations ne boucle pas',
  E.deal(SITUATIONS, 999, Math.random).length === SITUATIONS.length);

// ------------------------------------------------------------- une partie
const g = E.createGame(SITUATIONS, { rounds: 6, msLimit: 5000 });
const r1 = g.newRound();
t('une manche donne le contexte', !!r1.ctx && !!r1.detail && r1.of === 6);
t("une manche NE DONNE PAS le barème (c'est la réponse)",
  r1.scores === undefined && r1.why === undefined && r1.best === undefined);

const a1 = g.answer(E.bestOf(SITUATIONS.find((s) => s.id === r1.id)), 5000);
t('la réponse renvoie les points, la raison et le meilleur choix',
  a1.points > 0 && a1.why && a1.best && a1.wasBest === true);
t('le total suit', g.total === a1.points);

let doubleAnswer = false;
try { g.answer('courte', 1000); } catch (_) { doubleAnswer = true; }
t('on ne peut pas répondre deux fois à la même manche', doubleAnswer);

for (let i = 1; i < 6; i++) { g.newRound(); g.answer('courte', 2500); }
t('la partie se termine après 6 manches', g.isOver() && g.history.length === 6);
t('newRound() après la fin ne casse rien', g.newRound() === null);

// ------------------------------------------------------------- la note
t('note finale = moyenne des manches', E.grade(600, 6).avg === 100);
t('chaque palier a un titre FR et EN',
  [0, 40, 60, 80, 95].every((a) => {
    const gr = E.grade(a * 6, 6);
    return gr.title && gr.title_en;
  }));
t('une partie sans point ne plante pas', E.grade(0, 0).avg === 0);

let noSituations = false;
try { E.createGame([], { rounds: 3 }); } catch (_) { noSituations = true; }
t('créer une partie sans situation est refusé', noSituations);

console.log(`\n${ko ? 'DES TESTS ECHOUENT' : 'TOUT PASSE'} — ${ok + ko} vérifications, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
