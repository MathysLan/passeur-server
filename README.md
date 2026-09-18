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
- **Les deux temps d'une manche.** On regarde (`round`, ~2,5 s de mise en
  situation), PUIS on joue (`go`, 5 s). Les deux sont déclenchés ici : si chaque
  client démarrait son chrono à la fin de sa propre animation, celui dont
  l'onglet a ramé jouerait plus longtemps. Une réponse envoyée avant le `go`
  est refusée.
- **Les règles du volley.** `rules.js` décide qui est en ligne avant, qui peut
  contrer, et quelles distributions les règles autorisent — d'où le fait qu'un
  passeur arrière n'a pas de deuxième main (FIVB 13.2.2). Le client n'en connaît
  aucune : il reçoit une scène déjà résolue et la dessine.

## Lancer en local

    npm install
    npm start          # écoute sur $PORT, 8090 par défaut

Puis ouvrir le client du portfolio en lui donnant ce serveur :

    games/passeur/index.html?server=ws://localhost:8090

`?server=` marche sur les six jeux du portfolio ; sans lui, le client parle à
la production.

## Tests

    npm test           # = rules, puis moteur, puis partie complète

Trois niveaux, aucune dépendance en dehors de `ws` :

- `test-rules.mjs` — les **règles du volley** (`rules.js`) : positions 1 à 6,
  ligne avant / ligne arrière, ce qu'un joueur arrière a le droit de faire, qui
  peut contrer, et la légalité des douze situations. Chaque test porte le numéro
  de la règle FIVB qu'il protège, pour qu'une modification future sache ce
  qu'elle casse. 43 vérifications.

- `test-engine.mjs` — le **moteur pur** (`engine.js`) : barèmes, effet de la
  vitesse, bornes du temps, passes inconnues, tirage sans répétition, fin de
  partie, note finale, et la forme de chaque `scene`. 35 vérifications.
- `test.js` — une **partie complète en WebSocket**, jouée par de vrais clients
  `ws` contre le serveur lancé pour l'occasion. Il vérifie aussi ce qui ne doit
  PAS arriver : que le salon ne laisse fuir aucune situation, que la manche ne
  contient pas le barème, qu'une double réponse est ignorée, que seul le MJ
  fait avancer, que la `scene` envoyée ne contient ni note ni conseil, et que
  les deux temps d'une manche sont bien tenus par le serveur. 37 vérifications.

## Ajouter une situation

Tout est dans `situations.js` : ajouter un objet, c'est tout. Il y en a 12 pour
l'instant.

    {
      id: 's13',
      scene: {
        reception: 'perfect', from: 'center', setter: 'stable',
        block: { count: 2, focus: 'spread', ready: false },
        attackers: { gauche: 'ready', courte: 'running', droite: 'ready', arriere: 'ready' },
      },
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

### `scene` : le terrain

C'est la partie **visible** de la situation — ce que le client dessine en SVG.
Elle ne contient rien de secret : c'est exactement ce que `ctx` et `detail`
racontaient déjà en prose, sous une forme que l'affichage sait lire. Le client
ne connaît donc aucune situation en particulier ; il sait dessiner une
réception, un bloc et des attaquants, et c'est tout.

Les valeurs possibles sont listées en haut de `situations.js`, et
`test-engine.mjs` refuse toute valeur inconnue : une faute de frappe sortirait
un terrain muet chez le joueur, **sans la moindre erreur JS** pour le signaler.
Il vérifie aussi que `scene` ne contient aucune trace du barème — c'est
typiquement le champ dans lequel une note finit par se glisser « juste pour
l'affichage ».

Ajouter un état (un attaquant blessé, un bloc à quatre…) demande de toucher
**aux deux dépôts** : la valeur ici, son dessin dans `games/passeur/court.js`
du portfolio. C'est voulu : un état que le client ne sait pas dessiner ne doit
pas pouvoir exister.

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
| `answer` | `{ passId }` — la seule vraie intention de jeu. Refusée avant le `go`, et refusée si les règles interdisent cette option |
| `next` | MJ uniquement : manche suivante, ou classement final |
| `lobby` | MJ uniquement : rejouer, on revient au salon |

| Serveur → client | |
|---|---|
| `you` | ton identifiant, le code de la partie, si tu es MJ |
| `lobby` | joueurs présents, qui est MJ |
| `round` | `ctx`, `detail`, la `scene`, `introMs` (durée de la mise en situation) — **pas les barèmes** |
| `go` | « À TOI ». C'est SEULEMENT ici que les 5 secondes partent |
| `answered` | qui a répondu (pas ce qu'il a répondu) |
| `results` | enfin les points, le meilleur choix, les `why`, et le détail du calcul de chacun (`relevance`, `speed`, `ms`) |
| `end` | classement trié, note sur 100 et titre par joueur |
| `error` | message lisible, en français |

## Licence

MIT.
