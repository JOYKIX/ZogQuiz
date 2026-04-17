# Bot Twitch viewers — ZogQuiz

Ce bot Python lit le chat Twitch et attribue automatiquement **1 point** au premier viewer qui répond correctement à la **question viewers active** en manche 1.

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
- Vérifie l'accès Firebase au démarrage.
- Enregistre un flux chat best-effort dans:
  - `rooms/viewers/chatFeed/{key}`
- Ne traite le scoring que si:
  - `rooms/manche1/state.currentType === "viewers"`
  - `rooms/manche1/state.currentQuestionId` est défini
- Lit la question dans:
  - `rooms/manche1/questions/viewers/{questionId}`
- Accepte les réponses depuis:
  - `normalizedAnswers` (déjà normalisées)
  - `acceptedAnswers` (normalisées côté bot)
  - `answer` (normalisée côté bot, support multi-réponses si séparateurs `|`, `;`, `/`)
- Évite les doubles points par question via écriture conditionnelle (`ETag`) dans:
  - `rooms/manche1/viewerWinners/{questionId}`
- Incrémente le leaderboard viewer dans:
  - `rooms/manche1/viewerLeaderboard/{twitchUserLower}`

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
- **Pas de points attribués**:
  - vérifier que la question active est de type `viewers`,
  - vérifier la présence des réponses dans la question Firebase,
  - vérifier l'URL `FIREBASE_DB_URL`.
