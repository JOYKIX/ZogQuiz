import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  push,
  update,
  runTransaction,
  remove,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCIKaDnFa6zFxSxSPgKHzd4lqWVYcpPpRw",
  authDomain: "zogquiz.firebaseapp.com",
  projectId: "zogquiz",
  storageBucket: "zogquiz.firebasestorage.app",
  messagingSenderId: "721305975532",
  appId: "1:721305975532:web:04e1569e3acecc8b6c03c9",
  databaseURL: "https://zogquiz-default-rtdb.europe-west1.firebasedatabase.app",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export const ROUNDS = ["manche1", "manche2", "manche3", "manche4", "manche5", "finale"];

export async function ensureRoundsSeed(uid) {
  for (const round of ROUNDS) {
    const roundRef = ref(db, `quiz/rounds/${round}`);
    const snap = await get(roundRef);
    if (!snap.exists()) {
      await set(roundRef, {
        name: round,
        ready: false,
        placeholder: true,
        updatedBy: uid,
        updatedAt: Date.now(),
      });
    }
  }

  const quizStateRef = ref(db, "quiz/state");
  if (!(await get(quizStateRef)).exists()) {
    await set(quizStateRef, {
      activeRound: "manche1",
      updatedBy: uid,
      updatedAt: Date.now(),
    });
  }

  const stateRef = ref(db, "rooms/manche1/state");
  if (!(await get(stateRef)).exists()) {
    await set(stateRef, {
      currentType: "participants",
      currentQuestionId: null,
      showAnswer: false,
      buzzerLocked: false,
      lockedBySessionId: null,
      lockedByNickname: "",
      lockedAt: 0,
      updatedAt: Date.now(),
    });
  }

  const manche2StateRef = ref(db, "rooms/manche2/state");
  if (!(await get(manche2StateRef)).exists()) {
    await set(manche2StateRef, {
      activeQuestionId: null,
      updatedBy: uid,
      updatedAt: Date.now(),
    });
  }

  const manche3StateRef = ref(db, "rooms/manche3/state");
  if (!(await get(manche3StateRef)).exists()) {
    await set(manche3StateRef, {
      activePlayerId: null,
      activeThemeId: null,
      questionIndex: 0,
      timerStatus: "idle",
      timerRemainingMs: 90000,
      timerEndsAt: null,
      turnEnded: false,
      updatedBy: uid,
      updatedAt: Date.now(),
    });
  }
}

export function makeTempCode(size = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: size }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export { db, ref, set, get, onValue, push, update, runTransaction, remove };
