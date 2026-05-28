import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, onValue, push, update, runTransaction, remove, onDisconnect, serverTimestamp, type DataSnapshot } from 'firebase/database';
import type { RoundId } from '../types/domain';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyCIKaDnFa6zFxSxSPgKHzd4lqWVYcpPpRw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'zogquiz.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'zogquiz',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'zogquiz.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '721305975532',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:721305975532:web:04e1569e3acecc8b6c03c9',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL ?? 'https://zogquiz-default-rtdb.europe-west1.firebasedatabase.app',
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const ROUNDS: RoundId[] = ['manche1', 'manche2', 'manche3', 'manche4', 'manche5', 'manche6', 'finale'];

export function listen<T>(path: string, callback: (value: T | null, snapshot: DataSnapshot) => void) {
  return onValue(ref(db, path), (snapshot) => callback(snapshot.val() as T | null, snapshot));
}

export async function read<T>(path: string) {
  const snapshot = await get(ref(db, path));
  return snapshot.val() as T | null;
}

export async function write<T>(path: string, value: T) {
  await set(ref(db, path), value);
}

export async function patch(path: string, value: Record<string, unknown>) {
  await update(ref(db, path), { ...value, updatedAt: Date.now() });
}

export async function create(path: string, value: Record<string, unknown>) {
  const item = push(ref(db, path));
  await set(item, { ...value, createdAt: Date.now(), updatedAt: Date.now() });
  return item.key!;
}

export async function destroy(path: string) {
  await remove(ref(db, path));
}

export async function transact<T>(path: string, updater: (value: T | null) => T | null) {
  return runTransaction(ref(db, path), updater as never);
}

export function markPresence(path: string, value: Record<string, unknown>) {
  const node = ref(db, path);
  set(node, { ...value, online: true, connectedAt: serverTimestamp(), lastSeenAt: Date.now() });
  onDisconnect(node).update({ online: false, lastSeenAt: Date.now() });
}

export async function ensureSeed(uid = 'react-admin') {
  for (const round of ROUNDS) {
    const roundPath = `quiz/rounds/${round}`;
    if (!(await read(roundPath))) {
      await write(roundPath, { name: round, ready: false, placeholder: true, updatedBy: uid, updatedAt: Date.now() });
    }
  }

  const state = await read<{ activeRound?: RoundId; liveRound?: RoundId }>('quiz/state');
  if (!state) {
    await write('quiz/state', { activeRound: 'manche1', liveRound: 'manche1', updatedBy: uid, updatedAt: Date.now() });
  } else if (!state.liveRound) {
    await patch('quiz/state', { liveRound: state.activeRound ?? 'manche1', updatedBy: uid });
  }

  const defaults: Array<[string, Record<string, unknown>]> = [
    ['rooms/manche1/state', { currentType: 'participants', currentQuestionId: null, showAnswer: false, buzzerLocked: false, lockedBySessionId: null, lockedByNickname: '', lockedAt: 0 }],
    ['rooms/manche2/state', { activeQuestionId: null }],
    ['rooms/manche3/state', { activePlayerId: null, activeThemeId: null, questionIndex: 0, timerStatus: 'idle', timerRemainingMs: 90000, timerEndsAt: null, turnEnded: false }],
    ['rooms/manche4/blindtest/live', { active: false, trackId: null, trackIndex: 0, playbackState: 'stopped', startedAt: null, pausedAtSeconds: 0, syncVersion: 0, lastError: '', stopOnAnswer: false, participantAnswers: {} }],
    ['rooms/manche5/state', { active: false, turnOrder: [], hpByPlayer: {}, eliminated: {}, currentTurnPlayerId: null, targetPlayerId: null, duel: { attackerId: null, targetId: null, question: '', buzzerOpen: false, buzzedBy: null, phase: 'target' } }],
    ['rooms/manche6/state', { phase: 'setup', status: 'idle', durationMs: 60000, activePlayer: 'participant', players: { participant: { name: 'Participant', score: 0 }, viewer: { name: 'Viewer', score: 0 } }, timers: { participant: { remainingMs: 60000 }, viewer: { remainingMs: 60000 } }, currentQuestion: '', winner: null }],
    ['rooms/viewers/liveState', { active: false, status: 'idle' }],
  ];

  for (const [path, value] of defaults) {
    if (!(await read(path))) await write(path, { ...value, updatedBy: uid, updatedAt: Date.now() });
  }

  if (!(await read('overlayConfigs'))) {
    await write('overlayConfigs', {
      round1: { maxFontSizePx: 180, minFontSizePx: 28, textColor: '#ffffff', fontWeight: 800, textShadow: true, horizontalAlign: 'center', verticalAlign: 'center', safePaddingPx: 48, maxWidthPx: 1600 },
      round2: { maxWidthPx: 1400, maxHeightPx: 820, borderRadiusPx: 0 },
      round3: { questionFontSizePx: 74, themeFontSizePx: 34, timerFontSizePx: 72, questionColor: '#ffffff', themeColor: '#cfe6ff', timerColor: '#8cf5dc', fontWeight: 800, align: 'center', blockGapPx: 14, maxWidthPx: 1600 },
      round4: { primaryFontSizePx: 52, secondaryFontSizePx: 30, primaryColor: '#ffffff', secondaryColor: '#b5cef0', playingColor: '#57e389', pausedColor: '#ffd166', stoppedColor: '#ff6b6b', progressHeightPx: 10, cornerRadiusPx: 12, maxWidthPx: 1000 },
      round5: { primaryFontSizePx: 52, secondaryFontSizePx: 30, primaryColor: '#ffffff', secondaryColor: '#b5cef0', playingColor: '#57e389', pausedColor: '#ffd166', stoppedColor: '#ff6b6b' },
      round6: { primaryFontSizePx: 64, secondaryFontSizePx: 30, primaryColor: '#ffffff', secondaryColor: '#9ad7ff' },
    });
  }
}
