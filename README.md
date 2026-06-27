# ZogQuiz SPA (refonte manche 1)

Application web admin + buzzer + overlay OBS pour un format type *Questions pour un champion*.

## Fonctionnalités principales

- Auth admin locale (ID + mot de passe hashé SHA-256 en base).
- Génération de codes temporaires pour connecter les participants au buzzer.
- Nettoyage automatique des codes expirés en base pour éviter la surcharge.
- Reconnexion participant sur le même pseudo sans doublon de profil (même entrée de session conservée).
- Création de questions/réponses pour :
  - **questions participants** (buzzer actif)
  - **questions viewers** (sans buzzer)
- Pilotage live de la manche 1 :
  - choix de la question active,
  - bouton afficher/masquer réponse,
  - premier buzz verrouille les autres,
  - unlock manuel du buzzer,
  - marquer juste (+1) / faux (bloqué sur la question en cours).
- Nettoyage des données de buzz (historique + blocs) à chaque changement de question.
- Leaderboard participants sur page classement dédiée et overlay OBS dédié.
- Leaderboard viewers Twitch (alimenté par bot Python) sur page classement dédiée et overlay OBS dédié.
- Overlays OBS dédiés par manche (`overlay-round1` à `overlay-round6`) et par leaderboard.
- Navbar des manches (1 à 5 + finale) et sous-menu manche 1 (création/modification/suppression).

## Pages

- `index.html` : interface admin complète.
- `buzzer.html` : connexion invité (code + pseudo) et buzzer live.
- `overlay-round1.html` : overlay OBS manche 1 (question/réponse).
- `overlay-round2.html` : overlay OBS manche 2 (image active).
- `overlay-round3.html` : overlay OBS manche 3 (thème/question/timer).
- `theme-orverlay.html` : overlay OBS manche 3 listant les 12 thèmes avec nombre de colonnes configurable.
- `overlay-round4.html` : overlay OBS manche 4 (blindtest : statut, piste en cours, timer).
- `overlay-round5.html` : overlay OBS manche 5 (mort subite).
- `overlay-round6.html` : overlay OBS manche 6 / finale.
- `overlay-leaderboard-participants.html` : overlay OBS du leaderboard participants.
- `overlay-leaderboard-viewers.html` : overlay OBS du leaderboard viewers Twitch.
- `classement.html` : leaderboard participants + viewers Twitch (page séparée des manches).
- `bot/bot.py` : bot Twitch qui lit le chat et attribue le point viewers au premier bon répondant sur la question active.

## Lancer

Servir le dossier avec un serveur statique, puis ouvrir :

- `index.html` pour l'admin,
- `buzzer.html` côté participant,
- `overlay-roundX.html` (selon la manche) dans OBS comme source navigateur, ou `overlay-leaderboard-participants.html` / `overlay-leaderboard-viewers.html` pour les classements.


## Bot viewers Twitch

Configurer `bot/.env` puis lancer:

```bash
python3 bot/bot.py
```

Variables demandées:

```dotenv
TWITCH_TOKEN=oauth:
TWITCH_CHANNEL=
```

## Voice chat

- Ouvrir `guest.html`, se connecter, puis utiliser le bloc `Vocal`.
- Le micro est capturé avec `echoCancellation: true`, `noiseSuppression: false` et `autoGainControl: false`.
- RNNoise est chargé côté client depuis `vendor/rnnoise/rnnoise.wasm`. Si ce fichier est absent ou incompatible, le vocal passe en fallback micro sans suppression RNNoise.
- Le raccourci mute/unmute est configurable depuis l’interface invité et sauvegardé dans `localStorage`.
