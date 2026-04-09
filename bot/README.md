# Bot Twitch viewers (ZogQuiz)

Le bot lit le chat Twitch et attribue automatiquement **1 point** au premier viewer qui répond correctement à la **question viewers active** en manche 1.

## Configuration

1. Ouvre `bot/.env`
2. Renseigne:
   - `TWITCH_TOKEN=oauth:...`
   - `TWITCH_CHANNEL=nom_de_ta_chaine`

## Lancer

```bash
python3 bot/bot.py
```

## Comportement

- Le bot ne valide une réponse que si `rooms/manche1/state.currentType === "viewers"`.
- Le bot lit `rooms/manche1/state.currentQuestionId` pour savoir quelle question est active.
- La bonne réponse est comparée en ignorant la casse, les accents et la ponctuation.
- Une seule attribution par question (premier viewer correct).
- Le score viewers est stocké dans:
  - `rooms/manche1/viewerLeaderboard/{twitchUserLower}`
- Le gagnant de chaque question est stocké dans:
  - `rooms/manche1/viewerWinners/{questionId}`
