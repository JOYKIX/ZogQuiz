import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pages = [
  'index.html',
  'guest.html',
  'buzzer.html',
  'classement.html',
  'overlay-round1.html',
  'overlay-round2.html',
  'overlay-round3.html',
  'overlay-round4.html',
  'overlay-round5.html',
  'overlay-round6.html',
];

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [page.replace('.html', ''), resolve(__dirname, page)])),
    },
  },
});
