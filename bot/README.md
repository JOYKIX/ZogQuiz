# Bot Twitch viewers — ZogQuiz

Ce bot Python lit le chat Twitch et attribue automatiquement des points aux viewers qui répondent correctement aux questions viewers actives.

## Prérequis

- Python **3.10+**
- Un token Twitch IRC valide (user token)
- L'URL de la base Firebase Realtime Database de votre projet

## Configuration

Édite `bot/.env` :

```dotenv
# Obligatoire: token OAuth IRC Twitch
# Peut être saisi avec ou sans préfixe oauth:
TWITCH_TOKEN=oauth:xxxxxxxxxxxxxxxxxxxx

# Obligatoire: nom de chaîne Twitch (avec ou sans #)
TWITCH_CHANNEL=ma_chaine

# Optionnel: pseudo utilisé par le bot (fallback = TWITCH_CHANNEL)
TWITCH_NICK=ma_chaine

# Optionnel: URL Realtime Database Firebase
FIREBASE_DB_URL=https://zogquiz-default-rtdb.europe-west1.firebasedatabase.app
```

> Le bot supporte aussi les variables d'environnement système (elles ont priorité sur `.env`).

## Lancement

Depuis la racine du projet:

```bash
python3 bot/bot.py
```

## Ce que fait le bot

- Se connecte à Twitch IRC en TLS.
- Garde la connexion IRC ouverte pendant les périodes sans messages pour éviter les cycles déconnexion/reconnexion sur timeout de lecture.
- Vérifie l'accès Firebase au démarrage.
- Enregistre un flux chat best-effort dans:
  - `rooms/viewers/chatFeed/{key}`
- Traite le scoring viewers dès qu'une question viewers est active dans:
  - `rooms/viewers/liveState` pour les manches 1, 2, 3 et 4,
  - avec fallback historique sur `rooms/manche1/state` pour la manche 1.
- Lit les questions dans:
  - `rooms/manche1/questions/viewers/{questionId}` pour la manche 1,
  - `rooms/viewers/questions/{round}/{questionId}` pour les autres manches.
- Accepte les réponses depuis:
  - `normalizedAnswers` (déjà normalisées),
  - `acceptedAnswers` (normalisées côté bot),
  - `answer` (normalisée côté bot, support multi-réponses si séparateurs `|`, `;`, `/`).
- Journalise les tentatives dans:
  - `rooms/viewers/attempts/{round}:{questionId}/{key}`
- Évite les doubles points via écriture conditionnelle (`ETag`) dans:
  - `rooms/viewers/winners/{round}:{questionId}/first` si seul le premier bon gagne,
  - `rooms/viewers/winners/{round}:{questionId}/{twitchUserLower}` si plusieurs gagnants sont autorisés.
- Incrémente le leaderboard viewer global dans:
  - `rooms/manche1/viewerLeaderboard/{twitchUserLower}`
- Utilise la valeur `points` de la question active (ex: +2, +3), pas seulement +1.

## Normalisation des réponses

Le bot compare les réponses en ignorant:

- la casse,
- les accents,
- la ponctuation,
- les espaces multiples.

Exemple: `Éléphant!` et `elephant` matchent.

## Dépannage rapide

- **"Configuration incomplète"**: vérifie `TWITCH_TOKEN` et `TWITCH_CHANNEL`.
- **"Authentification Twitch refusée"**: token invalide ou sans droits chat IRC.
- **Déconnexions/reconnexions répétées avec "The read operation timed out"**: mets à jour le bot avec cette version; le silence du chat n'est plus traité comme une erreur de connexion.
- **Pas de points attribués**:
  - vérifier qu'une question viewers est active dans `rooms/viewers/liveState`,
  - vérifier la présence des réponses dans la question Firebase,
  - vérifier l'URL `FIREBASE_DB_URL`.
