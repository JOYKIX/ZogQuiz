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
- Leaderboard participants avec attribution manuelle de points au clic.
- Overlay OBS spécifique manche 1 (`manche1.html`) en fond transparent texte seul.
- Navbar des manches (1 à 5 + finale) et sous-menu manche 1 (création/modification/suppression).

## Pages

- `index.html` : interface admin complète.
- `buzzer.html` : connexion invité (code + pseudo) et buzzer live.
- `manche1.html` : overlay OBS manche 1 (question/réponse).
- `overlay.html` : ancien overlay générique (conservé).

## Lancer

Servir le dossier avec un serveur statique, puis ouvrir :

- `index.html` pour l'admin,
- `buzzer.html` côté participant,
- `manche1.html` dans OBS (source navigateur).
