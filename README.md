# ZogQuiz SPA (refonte manche 1)

Application web admin + buzzer + overlay OBS pour un format type *Questions pour un champion*.

## Fonctionnalités principales

- Auth admin locale (ID + mot de passe hashé SHA-256 en base).
- Génération de codes temporaires pour connecter les participants au buzzer.
- Création de questions/réponses pour :
  - **questions participants** (buzzer actif)
  - **questions viewers** (sans buzzer)
- Pilotage live de la manche 1 :
  - choix de la question active,
  - bouton afficher/masquer réponse,
  - premier buzz verrouille les autres,
  - unlock manuel du buzzer,
  - marquer juste (+1) / faux (bloqué sur la question en cours).
- Leaderboard participants avec attribution manuelle de points au clic.
- Overlay OBS (`overlay.html`) synchronisé en temps réel avec la question active et la réponse.

## Pages

- `index.html` : interface admin complète.
- `buzzer.html` : connexion invité (code + pseudo) et buzzer live.
- `overlay.html` : overlay pour OBS (question/réponse).

## Lancer

Servir le dossier avec un serveur statique, puis ouvrir :

- `index.html` pour l'admin,
- `buzzer.html` côté participant,
- `overlay.html` dans OBS (source navigateur).
