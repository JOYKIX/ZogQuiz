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

## Lancer en local
Utiliser un serveur statique (ex: VS Code Live Server, `python -m http.server`, etc.) puis ouvrir `index.html`.
