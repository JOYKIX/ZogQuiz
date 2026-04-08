# ZogQuiz SPA (refonte)

Refonte complète vers une base SPA orientée :

- **Compte admin unique** via Firebase Authentication (email/mot de passe).
- **Connexion + création de compte** sur la page principale.
- **Toutes les données dans Firebase Realtime Database**.
- **buzzer.html** réservé aux invités pour la **manche 1**.
- L'admin génère des **codes temporaires** ; l'invité entre code + pseudo pour se connecter au buzzer.
- Structure prête pour les manches : **1, 2, 3, 4, 5 et finale**.

## Pages

- `index.html` : SPA admin (auth + génération de codes + préparation manches).
- `buzzer.html` : page invité pour rejoindre le buzzer de la manche 1.

## Lancer

Servir le dossier avec un serveur statique, puis ouvrir `index.html`.
