# ZogQuiz

Mini plateforme de quiz temps réel (Firebase Realtime Database) avec :
- Connexion admin / participant.
- Création de participants par l'admin.
- Création et gestion des questions (+ points).
- Buzzer live.
- Overlay canvas pour OBS via URL de room.
- Classement en direct.

## Pages
- `index.html` : login.
- `admin.html` : créateur/gestionnaire quiz.
- `buzzer.html` : page participant.
- `leaderboard.html` : classement live.
- `overlay.html?room=room-main` : overlay OBS.

## Compte admin par défaut
- ID: `Admin01`
- MDP: `ZQ!Adm1n_2026#Live`

Sur la page de connexion :
- Les identifiants admin par défaut sont affichés.
- Le bouton **Remplir automatiquement** pré-remplit le formulaire.

## Correctifs inclus
- Connexion plus robuste avec gestion d'erreur Firebase (message clair si indisponible).
- Fallback de connexion admin tolérant une saisie avec casse différente (`admin01`, `ADMIN01`, etc.).
- Nettoyage des abonnements Firebase lors des changements de room pour éviter les écoutes en doublon.
- Bouton buzz automatiquement désactivé quand le buzzer est fermé.

## Lancer en local
Utiliser un serveur statique (ex: VS Code Live Server, `python -m http.server`, etc.) puis ouvrir `index.html`.
