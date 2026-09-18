// Le Passeur — moteur PUR. Aucun DOM, aucun réseau, aucun hasard non maîtrisé :
// tout ce qui décide d'un score est ici, et rien d'autre.
//
// Pourquoi séparer : c'est la même forme que engine-ban.js et
// engine-precision.js côté serveur. Cette V1 tourne entièrement dans le
// navigateur (comme le Puissance 4), mais le jour où Le Passeur devient
// multijoueur, c'est CE fichier que le serveur charge — et le client n'a alors
// plus qu'à afficher. Aucune règle n'est à réécrire.
//
// Deux conséquences immédiates, déjà vraies dans la V1 :
//   - la barème d'une situation (`scores`) n'est jamais lue par l'affichage
//     avant que le joueur ait répondu ;
//   - `newRound()` ne renvoie QUE ce que le joueur a le droit de voir.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PasseurEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Barème : la pertinence est notée sur 100 dans situations.js, la vitesse
  // module ce score de moitié. Répondre juste vite vaut 100 ; répondre juste
  // au dernier moment vaut 50 ; ne pas répondre vaut 0.
  const SPEED_FLOOR = 0.5;

  function scoreFor(situation, passId, msLeft, msLimit) {
    if (!passId) return { points: 0, relevance: 0, speed: 0, timedOut: true };
    const relevance = situation.scores[passId];
    if (typeof relevance !== 'number') throw new Error(`passe inconnue : ${passId}`);
    const ratio = Math.max(0, Math.min(1, msLeft / msLimit));
    const speed = SPEED_FLOOR + (1 - SPEED_FLOOR) * ratio;
    return {
      points: Math.round(relevance * speed),
      relevance,
      speed: Math.round(speed * 100),
      timedOut: false,
    };
  }

  // La meilleure passe de la situation, et son écart avec celle jouée.
  function bestOf(situation) {
    return Object.keys(situation.scores)
      .reduce((a, b) => (situation.scores[b] > situation.scores[a] ? b : a));
  }

  // Un tirage sans répétition : on épuise le paquet avant de le rebattre, sinon
  // une partie de 6 manches peut tomber trois fois sur la même situation.
  function deal(situations, count, random) {
    const rnd = random || Math.random;
    const pool = situations.slice();
    const out = [];
    while (out.length < count && pool.length) {
      out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    }
    return out;
  }

  function createGame(situations, opts) {
    const o = Object.assign({ rounds: 6, msLimit: 5000, random: Math.random }, opts || {});
    const deck = deal(situations, o.rounds, o.random);
    if (!deck.length) throw new Error('aucune situation disponible');
    let index = -1;
    let total = 0;
    const history = [];

    return {
      rounds: deck.length,
      msLimit: o.msLimit,
      get index() { return index; },
      get total() { return total; },
      get history() { return history.slice(); },
      isOver() { return index >= deck.length - 1 && history.length === deck.length; },

      // Ce que le joueur a le droit de voir : le contexte et les options.
      // Surtout PAS `scores` ni `why` — c'est la réponse.
      newRound() {
        index += 1;
        const s = deck[index];
        if (!s) return null;
        return { id: s.id, index, of: deck.length, ctx: s.ctx, ctx_en: s.ctx_en, detail: s.detail, detail_en: s.detail_en };
      },

      // Résoudre la manche courante. C'est le seul endroit qui donne des points.
      answer(passId, msLeft) {
        const s = deck[index];
        if (!s) throw new Error('aucune manche en cours');
        if (history.length > index) throw new Error('manche déjà résolue');
        const r = scoreFor(s, passId, msLeft, o.msLimit);
        const best = bestOf(s);
        const res = Object.assign({}, r, {
          id: s.id,
          passId: passId || null,
          best,
          wasBest: passId === best,
          why: passId ? s.why[passId] : null,
          why_en: passId ? s.why_en[passId] : null,
          bestWhy: s.why[best],
          bestWhy_en: s.why_en[best],
        });
        total += r.points;
        history.push(res);
        return res;
      },
    };
  }

  // Note finale sur 100 : la moyenne des manches, pour que le score reste
  // comparable d'une partie à l'autre quel que soit le nombre de manches.
  function grade(total, rounds) {
    const avg = rounds ? Math.round(total / rounds) : 0;
    let title = 'Passeur du dimanche', title_en = 'Sunday setter';
    if (avg >= 90) { title = 'Cerveau du jeu'; title_en = 'Brain of the game'; }
    else if (avg >= 75) { title = 'Passeur titulaire'; title_en = 'Starting setter'; }
    else if (avg >= 55) { title = 'Passeur remplaçant'; title_en = 'Backup setter'; }
    else if (avg >= 35) { title = 'En apprentissage'; title_en = 'Still learning'; }
    return { avg, title, title_en };
  }

  return { createGame, scoreFor, bestOf, deal, grade, SPEED_FLOOR };
});
