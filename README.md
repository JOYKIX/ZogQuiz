# ZogQuiz

ZogQuiz est maintenant une application web moderne basée sur **Vite**, **React** et **TypeScript**.

## Architecture

```txt
src/
  assets/        Images et ressources importées par Vite
  components/    Design system React réutilisable
  hooks/         Hooks Firebase, timers et notifications
  overlays/      Overlays OBS transparents et responsives
  pages/         Pages admin, guest et classement
  rounds/        Logique UI dédiée aux manches
  services/      Firebase, auth locale, actions métier
  styles/        Design system global responsive
  types/         Types TypeScript partagés
  utils/         Helpers purs
```

## Scripts

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Pages

- `/` ou `/index.html` : cockpit admin.
- `/guest.html` et `/buzzer.html` : console invité / buzzer.
- `/classement.html` : classements live.
- `/overlay-round1.html` à `/overlay-round6.html` : overlays OBS transparents.

## Firebase

La configuration Firebase historique est conservée dans `src/services/firebase.ts`. Les accès Realtime Database sont centralisés via des helpers typés (`listen`, `read`, `write`, `patch`, `create`, `destroy`, `transact`) pour éviter les listeners dupliqués et nettoyer automatiquement les abonnements React.

Les variables `VITE_FIREBASE_*` peuvent surcharger la configuration par défaut en production.
