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
- Leaderboard participants sur page classement dédiée.
- Leaderboard viewers Twitch (alimenté par bot Python) sur page classement dédiée.
- Overlay OBS centralisé (`overlay.html`) qui affiche dynamiquement la manche live.
- Navbar des manches (1 à 5 + finale) et sous-menu manche 1 (création/modification/suppression).

## Pages

- `index.html` : interface admin complète.
- `buzzer.html` : connexion invité (code + pseudo) et buzzer live.
- `overlay.html` : point d'entrée unique OBS, routeur des overlays par manche live.
- `overlay-round1.html` : overlay OBS manche 1 (question/réponse).
- `overlay-round2.html` : overlay OBS manche 2 (image active).
- `overlay-round3.html` : overlay OBS manche 3 (thème/question/timer).
- `classement.html` : leaderboard participants + viewers Twitch (page séparée des manches).
- `bot/bot.py` : bot Twitch qui lit le chat et attribue le point viewers au premier bon répondant sur la question active.

## Lancer

Servir le dossier avec un serveur statique, puis ouvrir :

- `index.html` pour l'admin,
- `buzzer.html` côté participant,
- `overlay.html` dans OBS (source navigateur).


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
