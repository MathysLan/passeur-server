// Le Passeur — les situations de jeu. C'EST LE FICHIER À ÉDITER pour enrichir
// le jeu : ajouter une situation = ajouter un objet ici, rien d'autre.
//
// Chaque situation note les CINQ passes sur 100. La note, c'est la pertinence
// de la décision, pas le hasard : deux passes peuvent être bonnes, et il y a
// toujours au moins un choix clairement mauvais, sinon il n'y a pas de jeu.
// `why` explique le choix APRÈS coup — c'est là que le jeu est intéressant.
//
// Volontairement : ce n'est pas une simulation. C'est un jeu de lecture rapide
// inspiré du poste de passeur.
//
// ---------------------------------------------------------------------------
// `spec` : la situation de VOLLEY, et rien d'autre à saisir.
//
// On ne décrit plus le dessin, on décrit le jeu. Une situation donne :
//
//   rotation   0 à 5 — la rotation au service (FIVB 7.4). 0, 1, 2 = passeur
//              ARRIÈRE (il pénètre au filet) ; 3, 4, 5 = passeur AVANT.
//   serve      'left' | 'center' | 'right' — d'où vient le service adverse
//   receiver   (optionnel) le rôle qui réceptionne ; par défaut le joueur de P6
//   reception  'perfect' | 'ok' | 'short' | 'deep' | 'high' | 'scramble'
//   block      { count: 0-3, start, target, late }
//              start/target : 'spread' | 'middle' | 'left' | 'right' | 'setter'
//   attackers  l'état de chaque option : 'ready' | 'running' | 'free'
//              | 'marked' | 'tired' | 'hot' | 'down'
//   introMs    durée de la mise en situation, 1500 à 3000 ms
//
// TOUT LE RESTE EST DÉDUIT par rules.js : qui joue quelle distribution, qui est
// avant, qui est arrière, ce qui est légal. On ne peut donc pas écrire une
// situation qui viole les règles sans que `npm test` le dise.
//
// ⚠️ Après le service, les joueurs se déplacent (FIVB 7.6) : le
// réceptionneur-attaquant attaque en poste 4 même s'il a tourné en P3, et le
// passeur arrière monte au filet. La rotation ne sert qu'à savoir QUI EST
// AVANT et QUI EST ARRIÈRE — c'est de là que viennent les vraies contraintes.
// ---------------------------------------------------------------------------

const R = require('./rules.js');

// Les cinq passes possibles. Leur ordre fixe celui des zones du terrain ET les
// raccourcis clavier 1 à 5, de gauche à droite puis l'arrière.
const PASSES = [
  { id: 'gauche', label: 'Aile gauche', label_en: 'Left wing', hint: 'haute, en 4', hint_en: 'high, zone 4' },
  { id: 'courte', label: 'Passe courte', label_en: 'Quick set', hint: 'au central, rapide', hint_en: 'quick middle' },
  { id: 'deuxieme', label: 'Deuxième main', label_en: 'Setter dump', hint: 'tu joues toi-même', hint_en: 'you play it yourself' },
  { id: 'droite', label: 'Aile droite', label_en: 'Right wing', hint: 'haute, en 2', hint_en: 'high, zone 2' },
  { id: 'arriere', label: 'Attaque arrière', label_en: 'Back-row attack', hint: 'appel derrière la ligne', hint_en: 'take-off behind the line' },
];

const SITUATIONS = [
  {
    id: "s01",
    spec: {
      rotation: 0, serve: "center", reception: "perfect",
      block: { count: 2, start: "spread", target: "spread", late: true },
      attackers: { gauche: "ready", courte: "running", droite: "ready", arriere: "ready" },
      introMs: 2200,
    },
    ctx: "Réception parfaite, pile sur toi.",
    ctx_en: "Perfect reception, right on you.",
    detail: "Ton central est lancé.",
    detail_en: "Your middle is already running.",
    scores: { courte: 100, gauche: 55, droite: 50, arriere: 45, deuxieme: 35 },
    why: {
      courte: "Central lancé + bloc en retard : la rapide passe avant même que le contre saute.",
      gauche: "Ça marche, mais tu laisses le temps au bloc de se placer. Dommage de gâcher une réception parfaite.",
      droite: "Jouable, mais c'est la solution la plus lente quand le central était prêt.",
      arriere: "Pas absurde, sauf que le central était la solution évidente.",
      deuxieme: "Avec une réception parfaite et un central lancé, te garder la balle est un caprice.",
    },
    why_en: {
      courte: "Middle running + late block: the quick beats the jump entirely.",
      gauche: "Works, but you give the block time to set. A waste of a perfect pass.",
      droite: "Playable, but the slowest option when the middle was ready.",
      arriere: "Not absurd, but the middle was the obvious answer.",
      deuxieme: "Perfect reception and a running middle — keeping it is showing off.",
    },
  },
  {
    id: "s02",
    spec: {
      rotation: 1, serve: "center", reception: "short",
      block: { count: 2, start: "spread", target: "left", late: false },
      attackers: { gauche: "ready", courte: "ready", droite: "ready", arriere: "ready" },
      introMs: 2600,
    },
    ctx: "Réception courte, tu sors du filet en courant.",
    ctx_en: "Short reception, you are running off the net.",
    detail: "Tu passes en déséquilibre.",
    detail_en: "You are setting off balance.",
    scores: { courte: 15, gauche: 95, droite: 30, arriere: 55, deuxieme: 0 },
    why: {
      courte: "En déséquilibre, la rapide part n'importe où. Le central ne peut rien en faire.",
      gauche: "La haute sur l'aile, c'est la passe de secours : elle laisse à l'attaquant le temps de s'ajuster.",
      droite: "Techniquement la plus dure quand tu sors du filet : gros risque de faute.",
      arriere: "Possible, mais tu demandes de la précision alors que tu n'en as pas.",
      deuxieme: "Tu es en déséquilibre et loin du filet : tu offres le point.",
    },
    why_en: {
      courte: "Off balance, the quick goes anywhere. The middle can do nothing with it.",
      gauche: "The high outside ball is the bail-out: it gives the hitter time to adjust.",
      droite: "Technically the hardest when running off the net: high chance of an error.",
      arriere: "Possible, but you are asking for precision you do not have.",
      deuxieme: "Off balance and far from the net: you are gifting the point.",
    },
  },
  {
    id: "s03",
    spec: {
      rotation: 5, serve: "center", reception: "ok",
      block: { count: 2, start: "spread", target: "middle", late: false },
      attackers: { gauche: "free", courte: "ready", droite: "free", arriere: "ready" },
      introMs: 2400,
    },
    ctx: "Le bloc adverse a mordu sur ton central.",
    ctx_en: "The opposing block bit on your middle.",
    detail: "Les ailes sont seules.",
    detail_en: "The wings are unmarked.",
    scores: { courte: 20, gauche: 95, droite: 90, arriere: 70, deuxieme: 60 },
    why: {
      courte: "Tu envoies ta rapide droit dans le double bloc que tu viens de provoquer.",
      gauche: "Le bloc s'est vendu : ton ailier est en un-contre-un, voire seul.",
      droite: "Aussi valable que la gauche — le côté que le bloc a déserté est ouvert.",
      arriere: "Bonne option de contournement, un peu plus lente à mettre en place.",
      deuxieme: "Le filet est dégarni au centre : la deuxième main peut surprendre.",
    },
    why_en: {
      courte: "You send your quick straight into the double block you just created.",
      gauche: "The block sold out: your outside hitter is one-on-one, maybe alone.",
      droite: "As good as the left — whichever side the block left is open.",
      arriere: "Good way around it, just slower to set up.",
      deuxieme: "The middle of the net is empty: a dump can surprise them.",
    },
  },
  {
    id: "s04",
    spec: {
      rotation: 4, serve: "center", reception: "high",
      block: { count: 3, start: "spread", target: "spread", late: false },
      attackers: { gauche: "tired", courte: "ready", droite: "ready", arriere: "ready" },
      introMs: 2800,
    },
    ctx: "Balle haute, le contre adverse est déjà en place à trois.",
    ctx_en: "High ball, the block is already set with three.",
    detail: "Ton ailier gauche a raté ses deux dernières.",
    detail_en: "Your left wing missed the last two.",
    scores: { courte: 35, gauche: 25, droite: 75, arriere: 90, deuxieme: 55 },
    why: {
      courte: "Trop tard : le bloc est déjà posé, la rapide n'a plus rien de rapide.",
      gauche: "Insister sur un attaquant en confiance basse face à un triple bloc, c'est mécanique.",
      droite: "Changer de côté oblige le bloc à se déplacer. C'est déjà ça de pris.",
      arriere: "Le bloc est haut et regroupé : attaquer de loin, c'est le contourner.",
      deuxieme: "Tout le monde attend une passe : la deuxième main garde de la valeur.",
    },
    why_en: {
      courte: "Too late: the block is already set, the quick is no longer quick.",
      gauche: "Feeding a low-confidence hitter into a triple block is just mechanical.",
      droite: "Switching sides forces the block to move. That is already something.",
      arriere: "The block is high and packed: hitting from distance goes around it.",
      deuxieme: "Everyone expects a set: the dump keeps its value.",
    },
  },
  {
    id: "s05",
    spec: {
      rotation: 2, serve: "left", reception: "scramble",
      block: { count: 1, start: "middle", target: "middle", late: true },
      attackers: { gauche: "ready", courte: "ready", droite: "ready", arriere: "ready" },
      introMs: 3000,
    },
    ctx: "Contre-attaque, ton équipe vient de défendre un smash.",
    ctx_en: "Counter-attack, your team just dug a spike.",
    detail: "La balle remonte molle.",
    detail_en: "The ball comes back slow.",
    scores: { courte: 45, gauche: 85, droite: 80, arriere: 95, deuxieme: 40 },
    why: {
      courte: "Ton central vient de défendre, il n'a pas eu le temps de repartir en course.",
      gauche: "Sûr et efficace face à un bloc incomplet.",
      droite: "Même logique : l'important, c'est de viser là où il n'y a personne.",
      arriere: "Le meilleur choix en transition : l'arrière était déjà en position d'attaque.",
      deuxieme: "Sur une balle molle, la deuxième main est lisible comme un livre.",
    },
    why_en: {
      courte: "Your middle just made the dig — no time to start a run.",
      gauche: "Safe and effective against an incomplete block.",
      droite: "Same logic: what matters is hitting where nobody is.",
      arriere: "Best choice in transition: the back-row player was already in attack position.",
      deuxieme: "On a soft ball, the dump reads like a book.",
    },
  },
  {
    id: "s06",
    spec: {
      rotation: 0, serve: "right", reception: "deep",
      block: { count: 2, start: "spread", target: "spread", late: false },
      attackers: { gauche: "ready", courte: "ready", droite: "hot", arriere: "ready" },
      introMs: 2400,
    },
    ctx: "24-24. Réception moyenne, un peu derrière toi.",
    ctx_en: "24-24. Average reception, slightly behind you.",
    detail: "Ton pointu est en feu ce soir.",
    detail_en: "Your opposite is on fire tonight.",
    scores: { courte: 30, gauche: 70, droite: 100, arriere: 65, deuxieme: 20 },
    why: {
      courte: "Réception moyenne = rapide risquée. À 24-24, ce n'est pas le moment.",
      gauche: "Solide, mais tu as mieux sous la main ce soir.",
      droite: "Sur une balle derrière toi, la passe arrière au pointu est naturelle — et c'est lui qui est chaud.",
      arriere: "Correct, mais plus compliqué à régler depuis une réception moyenne.",
      deuxieme: "Sur balle de set, la deuxième main est un pari. Le pointu est une certitude.",
    },
    why_en: {
      courte: "Average reception means a risky quick. At 24-24, this is not the moment.",
      gauche: "Solid, but you have better tonight.",
      droite: "On a ball behind you, the back set to the opposite is natural — and he is hot.",
      arriere: "Fine, but harder to time from an average pass.",
      deuxieme: "On set point, the dump is a gamble. The opposite is a certainty.",
    },
  },
  {
    id: "s07",
    spec: {
      rotation: 1, serve: "left", reception: "scramble",
      block: { count: 2, start: "spread", target: "spread", late: false },
      attackers: { gauche: "ready", courte: "ready", droite: "ready", arriere: "ready" },
      introMs: 3000,
    },
    ctx: "Le libéro a sorti un miracle, la balle part vers le fond.",
    ctx_en: "The libero pulled off a miracle, the ball drifts to the back.",
    detail: "Tu cours dos au filet.",
    detail_en: "You are running with your back to the net.",
    scores: { courte: 0, gauche: 90, droite: 45, arriere: 40, deuxieme: 0 },
    why: {
      courte: "Dos au filet, il n'y a même pas de rapide possible.",
      gauche: "La haute en 4, très loin du filet : c'est LA passe de survie. Tout le monde la connaît, et c'est bien pour ça qu'elle marche.",
      droite: "Beaucoup plus dure à doser dos au filet.",
      arriere: "Belle idée sur le papier, trop précise pour la situation.",
      deuxieme: "Tu es dos au filet : la deuxième main n'existe pas ici.",
    },
    why_en: {
      courte: "Back to the net, a quick is not even physically possible.",
      gauche: "The high ball to zone 4, far off the net: THE survival set. Everyone knows it, which is exactly why it works.",
      droite: "Much harder to judge with your back to the net.",
      arriere: "Nice on paper, too precise for this situation.",
      deuxieme: "Back to the net: the dump does not exist here.",
    },
  },
  {
    id: "s08",
    spec: {
      rotation: 4, serve: "center", reception: "perfect",
      block: { count: 2, start: "spread", target: "spread", late: false },
      attackers: { gauche: "ready", courte: "down", droite: "ready", arriere: "free" },
      introMs: 2200,
    },
    ctx: "Réception nickel, mais ton central est resté au sol.",
    ctx_en: "Great reception, but your middle stayed on the floor.",
    detail: "Ton central vient de plonger en défense.",
    detail_en: "Your middle just dove for a dig.",
    scores: { courte: 10, gauche: 80, droite: 80, arriere: 90, deuxieme: 75 },
    why: {
      courte: "Passer à un attaquant qui n'est pas debout, c'est perdre la balle.",
      gauche: "Choix sain : un attaquant disponible vaut mieux qu'un attaquant théorique.",
      droite: "Même chose de l'autre côté, aussi valable.",
      arriere: "Le bloc s'est concentré devant : l'attaque de derrière est la moins surveillée.",
      deuxieme: "Personne ne te regarde. C'est exactement le moment.",
    },
    why_en: {
      courte: "Setting a hitter who is not on his feet is losing the ball.",
      gauche: "Sound: an available hitter beats a theoretical one.",
      droite: "Same on the other side, just as valid.",
      arriere: "The block is focused up front: the back-row attack is the least watched.",
      deuxieme: "Nobody is looking at you. This is exactly the moment.",
    },
  },
  {
    id: "s09",
    spec: {
      rotation: 3, serve: "right", reception: "high",
      block: { count: 3, start: "spread", target: "spread", late: false },
      attackers: { gauche: "ready", courte: "ready", droite: "ready", arriere: "ready" },
      introMs: 2800,
    },
    ctx: "Service flottant mal réceptionné, la balle monte très haut.",
    ctx_en: "Badly received float serve, the ball goes very high.",
    detail: "Tu as tout le temps. Le bloc aussi.",
    detail_en: "You have all the time. So does the block.",
    scores: { courte: 40, gauche: 70, droite: 70, arriere: 85, deuxieme: 65 },
    why: {
      courte: "Le temps que la balle redescende, le bloc est posé : la rapide n'en est plus une.",
      gauche: "Classique et honnête, mais lisible.",
      droite: "Pareil : ça se joue, ça ne surprend personne.",
      arriere: "Avec autant de temps, tes arrières sont montés : c'est l'option qui écarte le plus le bloc.",
      deuxieme: "Sur une balle que tout le monde voit venir, la surprise reprend de la valeur.",
    },
    why_en: {
      courte: "By the time the ball comes down the block is set: the quick is no longer quick.",
      gauche: "Classic and honest, but readable.",
      droite: "Same: it works, it surprises nobody.",
      arriere: "With this much time your back row is up: it spreads the block the most.",
      deuxieme: "On a ball everyone sees coming, surprise regains value.",
    },
  },
  {
    id: "s10",
    spec: {
      rotation: 3, serve: "center", reception: "ok",
      block: { count: 2, start: "spread", target: "left", late: false },
      attackers: { gauche: "marked", courte: "ready", droite: "ready", arriere: "ready" },
      introMs: 2400,
    },
    ctx: "Ton ailier gauche te crie « BALLE ! » depuis trois points.",
    ctx_en: "Your left hitter has been shouting \"BALL!\" for three points.",
    detail: "Il est marqué par le meilleur contreur.",
    detail_en: "He is marked by their best blocker.",
    scores: { courte: 85, gauche: 40, droite: 75, arriere: 70, deuxieme: 50 },
    why: {
      courte: "Le passeur n'est pas là pour faire plaisir : le central est libre, il faut le servir.",
      gauche: "Céder à celui qui crie le plus fort, c'est le piège classique du jeune passeur.",
      droite: "Bon compromis : tu changes de côté sans forcer sur le duel perdu.",
      arriere: "Valable, et ça évite le bras marqué.",
      deuxieme: "Pas le pire, mais tu as des attaquants libres — sers-les.",
    },
    why_en: {
      courte: "A setter is not there to please people: the middle is free, feed him.",
      gauche: "Giving in to whoever shouts loudest is the classic young-setter trap.",
      droite: "Good compromise: you switch sides without forcing the losing matchup.",
      arriere: "Valid, and it avoids the covered arm.",
      deuxieme: "Not the worst, but you have free hitters — use them.",
    },
  },
  {
    id: "s11",
    spec: {
      rotation: 5, serve: "center", reception: "ok",
      block: { count: 1, start: "setter", target: "setter", late: false },
      attackers: { gauche: "ready", courte: "ready", droite: "ready", arriere: "ready" },
      introMs: 2400,
    },
    ctx: "Le contreur adverse en face de toi saute à chaque passe.",
    ctx_en: "The blocker opposite you jumps on every single set.",
    detail: "Il a sauté sur tes six dernières passes.",
    detail_en: "He jumped on your last six sets.",
    scores: { courte: 35, gauche: 65, droite: 65, arriere: 70, deuxieme: 100 },
    why: {
      courte: "Il saute tôt et systématiquement : sur la rapide, son réflexe tombe pile au bon moment. C'est le seul ballon où son défaut devient une qualité.",
      gauche: "Tu joues normalement face à quelqu'un qui ne joue pas normalement.",
      droite: "Idem : tu passes à côté de l'information.",
      arriere: "Solide, mais il y a plus simple.",
      deuxieme: "Il saute systématiquement : il retombe pendant que la balle passe. La deuxième main est gratuite.",
    },
    why_en: {
      courte: "He jumps early every time: on the quick, that reflex lands exactly on time. It is the one ball where his flaw becomes a strength.",
      gauche: "You play normally against someone who does not play normally.",
      droite: "Same: you are ignoring the information.",
      arriere: "Solid, but there is something simpler.",
      deuxieme: "He jumps every time: he is coming down while the ball goes over. The dump is free.",
    },
  },
  {
    id: "s12",
    spec: {
      rotation: 0, serve: "center", reception: "perfect",
      block: { count: 2, start: "spread", target: "spread", late: false },
      attackers: { gauche: "ready", courte: "ready", droite: "ready", arriere: "ready" },
      introMs: 2200,
    },
    ctx: "Premier ballon du match, réception parfaite.",
    ctx_en: "First ball of the match, perfect reception.",
    detail: "Personne ne sait encore comment tu distribues.",
    detail_en: "Nobody knows your distribution yet.",
    scores: { courte: 95, gauche: 75, droite: 70, arriere: 70, deuxieme: 45 },
    why: {
      courte: "Ouvrir sur la rapide, c'est obliger le bloc à respecter ton central pour tout le reste du match.",
      gauche: "Sûr, mais tu ne poses aucune question au bloc adverse.",
      droite: "Même remarque : ça marche, ça n'installe rien.",
      arriere: "Bonne balle, mais moins forte comme message d'entrée.",
      deuxieme: "Sur le premier ballon, personne ne te surveille encore — donc personne ne retiendra la leçon.",
    },
    why_en: {
      courte: "Opening with the quick forces the block to respect your middle for the whole match.",
      gauche: "Safe, but it asks the block no questions at all.",
      droite: "Same: it works, it sets nothing up.",
      arriere: "Good ball, weaker as an opening statement.",
      deuxieme: "On the first ball nobody watches you yet — so nobody learns the lesson.",
    },
  },
];

// La scène envoyée au client est DÉDUITE de la spec, une fois pour toutes au
// chargement. Le client reçoit un modèle de volley déjà résolu — positions,
// propriétaires des options, légalité — et n'a plus qu'à le dessiner.
for (const s of SITUATIONS) s.scene = R.buildScene(s.spec);

if (typeof module !== 'undefined' && module.exports) module.exports = { PASSES, SITUATIONS };
