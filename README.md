# passeur-server

Serveur arbitre du jeu **« Le Passeur »**, un des jeux web du portfolio de
Mathys Langiny. Le client est ailleurs : il vit dans le dépôt du portfolio,
sous [`games/passeur/`](https://github.com/MathysLan/MathysLan.github.io/tree/main/games/passeur),
et il est servi par GitHub Pages. Ici, il n'y a que l'arbitre.

C'est la même séparation que pour les autres jeux du portfolio
(`demicercle-server`, `ban-server`, `precision-server`, `morpion-server`) :
**le front est statique, le serveur est la seule autorité.**

## Le jeu

Une situation de volley, cinq passes possibles, cinq secondes pour décider.
Tout le monde joue la même situation en même temps. Les points dépendent de la
**pertinence** de la décision *et* de la **vitesse**.

Ce n'est pas une simulation de volley : c'est un jeu de lecture rapide inspiré
du poste de passeur.

## Ce qui est du ressort du serveur (et pas du client)

Le client n'envoie qu'une intention : « je choisis la passe courte ». Tout le
reste est calculé ici.

- **Le tirage des situations.** Une partie tire N situations distinctes ; le
  client ne sait jamais lesquelles arrivent ensuite.
- **Les barèmes.** `scores` et `why` ne partent **jamais** avec la manche :
  ils ne sont envoyés qu'au message `results`, c'est-à-dire une fois que tout
  le monde a répondu. Un client qui lirait le trafic ne verrait pas la bonne
  réponse avant de jouer — c'est le même modèle « zéro confiance » que le
  `fatal` du Jeu du Ban ou la cible du Demi-Cercle.
- **Le chrono.** Le compte à rebours affiché est un repère visuel. Le temps
  réellement pris est recoupé à l'horloge serveur (`Date.now()` à l'envoi de
  la manche), donc trafiquer le timer du navigateur ne rapporte rien.
- **Le rythme.** C'est le MJ (le premier arrivé) qui lance la partie et
  enchaîne les manches. Une manche se résout aussi toute seule quand le temps
  est écoulé, même si personne n'a répondu, et un joueur qui quitte ne bloque
  pas les autres.

## Lancer en local

    npm install
    npm start          # écoute sur $PORT, 8090 par défaut

Puis ouvrir le client du portfolio en lui donnant ce serveur :

    games/passeur/index.html?server=ws://localhost:8090

`?server=` marche sur les six jeux du portfolio ; sans lui, le client parle à
la production.

## Tests

    npm test           # = node test-engine.mjs && node test.js

Deux niveaux, aucune dépendance en dehors de `ws` :

- `test-engine.mjs` — le **moteur pur** (`engine.js`) : barèmes, effet de la
  vitesse, bornes du temps, passes inconnues, tirage sans répétition, fin de
  partie, note finale. 28 vérifications.
- `test.js` — une **partie complète en WebSocket**, jouée par de vrais clients
  `ws` contre le serveur lancé pour l'occasion. Il vérifie aussi ce qui ne doit
  PAS arriver : que le salon ne laisse fuir aucune situation, que la manche ne
  contient pas le barème, qu'une double réponse est ignorée, que seul le MJ
  fait avancer. 24 vérifications.

## Ajouter une situation

Tout est dans `situations.js` : ajouter un objet, c'est tout. Il y en a 12 pour
l'instant.

    {
      id: 's13',
      ctx: 'Ce que le joueur voit en une ligne.',
      ctx_en: '…',
      detail: 'Le détail qui doit faire pencher la décision.',
      detail_en: '…',
      scores: { courte: 100, gauche: 55, droite: 50, arriere: 45, deuxieme: 35 },
      why:    { courte: 'Pourquoi c est le bon choix.', /* …les cinq… */ },
      why_en: { /* …les cinq… */ },
    }

Deux règles pour que ça reste un jeu : au moins un choix clairement mauvais, et
`why` explique le choix **après** coup — c'est là que c'est intéressant.
`test-engine.mjs` vérifie la forme de chaque situation, donc une faute de
frappe dans un `id` de passe se voit tout de suite.

## Déploiement

`render.yaml` décrit le service (Node, plan gratuit, `npm install` puis
`npm start`). Sur le plan gratuit, l'instance s'endort : le premier joueur
attend ~30 s le temps du réveil, et le client le dit dans son message d'erreur.

## Le protocole, en bref

Un seul WebSocket, du JSON, une machine à états par phase.

| Client → serveur | |
|---|---|
| `join` | `{ name, avatar, code? }` — sans `code`, on crée la partie et on devient MJ |
| `start` | MJ uniquement : `{ rounds }` |
| `answer` | `{ pass }` — la seule vraie intention de jeu |
| `next` | MJ uniquement : manche suivante, ou classement final |
| `lobby` | MJ uniquement : rejouer, on revient au salon |

| Serveur → client | |
|---|---|
| `you` | ton identifiant, le code de la partie, si tu es MJ |
| `lobby` | joueurs présents, qui est MJ |
| `round` | `ctx`, `detail`, les cinq passes, la limite de temps — **pas les barèmes** |
| `answered` | qui a répondu (pas ce qu'il a répondu) |
| `results` | enfin les points, le meilleur choix et les `why` |
| `end` | classement trié, note sur 100 et titre par joueur |
| `error` | message lisible, en français |

## Licence

MIT.
