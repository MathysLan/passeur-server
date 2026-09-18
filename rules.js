// Les règles du volley indoor utilisées par Le Passeur — module PUR, aucune
// dépendance, aucun réseau. C'est LA source de vérité du jeu : si une règle
// doit s'appliquer, elle s'écrit ici, jamais dans le SVG du client.
//
// Référence : FIVB Official Volleyball Rules 2025-2028. Les règles retenues,
// et ce qu'elles impliquent concrètement ici :
//
//   7.4  POSITIONS. Au moment où le serveur frappe la balle, chaque équipe doit
//        être dans son ordre de rotation. Trois joueurs à l'avant — P4 (avant
//        gauche), P3 (avant centre), P2 (avant droite) — et trois à l'arrière —
//        P5 (arrière gauche), P6 (arrière centre), P1 (arrière droite).
//   7.5  FAUTE DE POSITION si un joueur n'est pas à sa place à cet instant.
//   7.6  APRÈS LA FRAPPE DE SERVICE, les joueurs peuvent se déplacer et occuper
//        n'importe quelle position de leur camp. C'est ce qui autorise le
//        passeur arrière à « pénétrer » au filet pour distribuer.
//        ⚠️ Donc : JAMAIS de logique « il est arrière, il ne peut pas aller
//        devant ». La ligne des 3 m n'est pas un mur, c'est une ligne de
//        référence pour l'attaque et le bloc.
//   13.2.2 ATTAQUE D'UN JOUEUR ARRIÈRE. Un arrière peut attaquer, mais s'il
//        frappe depuis la zone avant, une partie du ballon doit être plus basse
//        que le bord supérieur du filet. Pour attaquer au-dessus du filet, il
//        doit prendre son appel DERRIÈRE la ligne des 3 m — il peut retomber
//        devant, ça n'a aucune importance.
//   14.1.1 / 14.6.2 BLOC. Seuls les joueurs de la ligne AVANT peuvent
//        contrer. Un arrière qui participe à un bloc complété commet une faute.
//
// Conséquence de jeu, et c'est elle qui rend le modèle utile : quand le passeur
// est ARRIÈRE, il ne peut pas conclure une « deuxième main » au-dessus du
// filet — 13.2.2. L'option existe donc toujours à l'écran, mais elle est
// annoncée illégale, et le serveur la refuse. Ce n'est pas une simplification,
// c'est la règle.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PasseurRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Les six rôles d'un système 5-1. Deux rôles « opposés » sont toujours à
  // trois positions d'écart, ce qui garantit qu'il y en a exactement un des
  // deux en ligne avant à chaque rotation.
  const ROLES = ['setter', 'mb1', 'oh1', 'opp', 'mb2', 'oh2'];

  // La rotation de départ, indexée P1..P6. Les cinq autres s'en déduisent : à
  // chaque rotation, le joueur de P2 passe en P1, celui de P3 en P2, etc.
  const BASE = ['setter', 'mb1', 'oh1', 'opp', 'mb2', 'oh2'];

  const FRONT_POS = [4, 3, 2];   // P4 P3 P2, de gauche à droite face au filet
  const BACK_POS = [5, 6, 1];    // P5 P6 P1

  const LABEL = {
    setter: 'passeur', opp: 'pointu', mb1: 'central', mb2: 'central',
    oh1: 'réceptionneur-attaquant', oh2: 'réceptionneur-attaquant',
  };

  // Une rotation : `n` tours depuis la rotation de base.
  function lineup(n) {
    const k = ((n % 6) + 6) % 6;
    const out = BASE.slice(k).concat(BASE.slice(0, k));
    return out;                       // index 0 = P1, 1 = P2, … 5 = P6
  }

  const posOf = (lu, role) => lu.indexOf(role) + 1;         // 1..6, 0 si absent
  const roleAt = (lu, pos) => lu[pos - 1];
  const isFront = (pos) => FRONT_POS.indexOf(pos) !== -1;
  const isBack = (pos) => BACK_POS.indexOf(pos) !== -1;

  // Une composition est légale si les six rôles y sont, une fois chacun (7.4).
  // Le reste des relations de position est garanti par construction : on ne
  // fabrique jamais une composition à la main, on tourne la rotation de base.
  function legalLineup(lu) {
    if (!Array.isArray(lu) || lu.length !== 6) return false;
    const seen = new Set(lu);
    return seen.size === 6 && ROLES.every((r) => seen.has(r));
  }

  // Qui joue quelle distribution, pour une rotation donnée. Tout est DÉDUIT :
  // il n'y a rien à saisir par situation, donc rien à saisir de faux.
  //
  //   gauche   poste 4  — le réceptionneur-attaquant de la ligne avant
  //   courte   poste 3  — le central de la ligne avant
  //   droite   poste 2  — le pointu ; s'il est arrière, ça devient une
  //                       attaque arrière depuis la zone 1
  //   arriere  la pipe  — le réceptionneur-attaquant de la ligne arrière
  //   deuxieme le passeur lui-même
  function owners(lu) {
    const frontRoles = FRONT_POS.map((p) => roleAt(lu, p));
    const isF = (role) => frontRoles.indexOf(role) !== -1;
    const mbFront = isF('mb1') ? 'mb1' : 'mb2';
    const ohFront = isF('oh1') ? 'oh1' : 'oh2';
    const ohBack = ohFront === 'oh1' ? 'oh2' : 'oh1';
    return {
      gauche: ohFront,
      courte: mbFront,
      deuxieme: 'setter',
      droite: 'opp',
      arriere: ohBack,
    };
  }

  // ------------------------------------------------------ l'action représentée
  // On ne teste pas « le joueur est arrière donc c'est interdit » : on décrit
  // l'ACTION que chaque option représente dans le jeu, et on la confronte au
  // règlement. C'est la seule façon d'être juste, et ça reste juste si on
  // ajoute une option demain.
  //
  //   ball    : 'above-net' | 'below-net' — hauteur du ballon au contact
  //   takeoff : 'front-zone' | 'behind-line' — d'où part l'attaquant
  //
  // ⚠️ Ce que le jeu représente aujourd'hui pour la « deuxième main », c'est le
  // BALLON POUSSÉ PAR-DESSUS LE FILET depuis la zone avant — une attaque
  // conclue au-dessus du filet. C'est ce qui la rend impossible à un passeur
  // arrière. Une poussette JOUÉE SOUS LE NIVEAU DU FILET serait, elle,
  // parfaitement légale pour lui : si on ajoute un jour cette option, il suffit
  // de la déclarer `ball: 'below-net'` et la règle ci-dessous la laisse passer.
  const ACTION = {
    gauche: { ball: 'above-net', takeoff: 'behind-line' },
    courte: { ball: 'above-net', takeoff: 'behind-line' },
    droite: { ball: 'above-net', takeoff: 'behind-line' },
    arriere: { ball: 'above-net', takeoff: 'behind-line' },
    deuxieme: { ball: 'above-net', takeoff: 'front-zone' },
  };

  // FIVB 13.2.2 — un joueur de la ligne ARRIÈRE peut tout à fait conclure une
  // attaque. Mais s'il frappe depuis la zone avant, une partie du ballon doit
  // être plus basse que le bord supérieur du filet ; pour conclure au-dessus du
  // filet, il doit avoir pris son appel DERRIÈRE la ligne des 3 m.
  // Un joueur de la ligne avant, lui, n'a aucune de ces contraintes.
  function attackFault(action, isFrontRow) {
    if (isFrontRow) return null;
    if (action.takeoff === 'behind-line') return null;
    if (action.ball !== 'above-net') return null;
    return 'un joueur arrière ne peut pas conclure au-dessus du filet depuis la zone avant (13.2.2)';
  }

  // La légalité de chaque option, avec sa raison en français. Ce n'est PAS le
  // barème : c'est une information publique, que n'importe quel joueur lit sur
  // le terrain. Elle part donc avec la manche.
  function legality(lu) {
    const own = owners(lu);
    const out = {};
    Object.keys(own).forEach((id) => {
      const role = own[id];
      const pos = posOf(lu, role);
      const front = isFront(pos);
      const action = ACTION[id];
      const fault = attackFault(action, front);

      if (id === 'arriere' && front) {
        // Un avant ne fait pas une « attaque arrière » : ce n'est plus la même
        // action. Cette incohérence-là n'existe pas dans les rotations qu'on
        // fabrique, mais autant la refuser explicitement.
        out[id] = { legal: false, by: role, pos, front, action,
          why: "cet attaquant est en ligne avant : ce n'est pas une attaque arrière" };
        return;
      }
      if (fault) {
        out[id] = { legal: false, by: role, pos, front, action, why: fault };
        return;
      }
      out[id] = { legal: true, by: role, pos, front, action };
      // Un arrière qui conclut au-dessus du filet a le droit, mais son appel
      // doit être derrière la ligne : on le rappelle, ce n'est pas un refus.
      if (!front && action.ball === 'above-net' && action.takeoff === 'behind-line') {
        out[id].note = 'attaque arrière : appel derrière la ligne des 3 m (13.2.2)';
      }
    });
    return out;
  }

  // Qui peut contrer (14.1.1 / 14.6.2) : les trois joueurs de la ligne avant,
  // et eux seuls. Sert à borner le nombre de contreurs d'une situation.
  const maxBlockers = () => FRONT_POS.length;

  // Contrôle d'une scène complète. Renvoie la liste des problèmes — vide si
  // tout va bien. C'est ce que les tests appellent, et c'est aussi ce qui
  // empêche d'écrire une situation illégale sans s'en apercevoir.
  function checkScene(scene) {
    const bad = [];
    const lu = scene && scene.lineup;
    if (!legalLineup(lu)) return ['composition illégale (7.4) : il faut les six rôles, une fois chacun'];
    if (!scene.reception || !scene.reception.by) bad.push('personne ne réceptionne');
    else if (lu.indexOf(scene.reception.by) === -1) bad.push('le réceptionneur n\'est pas sur le terrain');
    const b = scene.block || {};
    if (b.count < 0 || b.count > maxBlockers()) {
      bad.push(`${b.count} contreurs : seuls les ${maxBlockers()} joueurs avant peuvent contrer (14.6.2)`);
    }
    const leg = legality(lu);
    Object.keys(leg).forEach((id) => {
      if (!scene.options || !scene.options[id]) bad.push(`option manquante : ${id}`);
      else if (scene.options[id].by !== leg[id].by) {
        bad.push(`${id} attribuée à ${scene.options[id].by}, mais la rotation donne ${leg[id].by}`);
      }
    });
    return bad;
  }

  // La scène complète, déduite d'une rotation et de ce que la situation décrit.
  // Le client reçoit ça et n'a plus qu'à le dessiner : aucune règle de volley
  // n'a besoin d'exister côté navigateur.
  function buildScene(spec) {
    const lu = lineup(spec.rotation || 0);
    const own = owners(lu);
    const leg = legality(lu);
    const options = {};
    Object.keys(own).forEach((id) => {
      options[id] = {
        by: own[id],
        pos: posOf(lu, own[id]),
        front: isFront(posOf(lu, own[id])),
        legal: leg[id].legal,
        why: leg[id].why || null,
        note: leg[id].note || null,
        state: (spec.attackers || {})[id] || 'ready',
      };
    });
    const setterPos = posOf(lu, 'setter');
    // Qui réceptionne, par défaut : le réceptionneur-attaquant de la ligne
    // ARRIÈRE — celui-là même qui viendra à la pipe. Surtout pas « le joueur de
    // P6 », qui selon la rotation peut être le passeur : un passeur qui
    // réceptionne sa propre balle, ça n'existe pas en 5-1, et à l'écran il
    // faudrait dessiner le même bonhomme à deux endroits.
    const receiver = spec.receiver || own.arriere;
    return {
      lineup: lu,
      rotation: ((spec.rotation || 0) % 6 + 6) % 6,
      setter: { pos: setterPos, front: isFront(setterPos) },
      serve: spec.serve || 'center',
      reception: {
        by: receiver,
        pos: posOf(lu, receiver),
        quality: spec.reception || 'ok',
      },
      block: {
        count: (spec.block && spec.block.count) || 0,
        start: (spec.block && spec.block.start) || 'spread',
        target: (spec.block && spec.block.target) || 'spread',
        late: !!(spec.block && spec.block.late),
      },
      options,
      // Durée de la mise en situation, en ms. Une réception de secours prend
      // plus longtemps à lire qu'une réception parfaite.
      introMs: spec.introMs || 2400,
    };
  }

  return {
    ROLES, BASE, FRONT_POS, BACK_POS, LABEL, ACTION,
    lineup, posOf, roleAt, isFront, isBack, legalLineup,
    owners, legality, attackFault, maxBlockers, checkScene, buildScene,
  };
});
