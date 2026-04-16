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
      liveRound: "manche1",
      updatedBy: uid,
      updatedAt: Date.now(),
    });
  } else {
    const state = (await get(quizStateRef)).val() || {};
    if (!state.liveRound) {
      await update(quizStateRef, {
        liveRound: state.activeRound || "manche1",
        updatedBy: uid,
        updatedAt: Date.now(),
      });
    }
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

  const manche1OverlayRef = ref(db, "rooms/manche1/overlaySettings");
  if (!(await get(manche1OverlayRef)).exists()) {
    await set(manche1OverlayRef, {
      questionFontSizePx: 72,
      questionColor: "#ffffff",
      updatedBy: uid,
      updatedAt: Date.now(),
    });
  }


  const manche4StateRef = ref(db, "rooms/manche4/state");
  if (!(await get(manche4StateRef)).exists()) {
    await set(manche4StateRef, {
      active: false,
      currentGridId: null,
      cluePhase: 1,
      currentClue: "",
      allowedPlayers: [],
      playerProgress: {},
      finished: false,
      updatedBy: uid,
      updatedAt: Date.now(),
    });
  }

  const manche3OverlayRef = ref(db, "rooms/manche3/overlaySettings");
  if (!(await get(manche3OverlayRef)).exists()) {
    await set(manche3OverlayRef, {
      questionFontSizePx: 72,
      questionColor: "#ffffff",
      updatedBy: uid,
      updatedAt: Date.now(),
    });
  }

  const overlayConfigsRef = ref(db, "overlayConfigs");
  if (!(await get(overlayConfigsRef)).exists()) {
    await set(overlayConfigsRef, {
      round1: {
        questionFontSizePx: 72,
        questionColor: "#ffffff",
        questionFontWeight: 800,
        questionAlign: "center",
        maxWidthPx: 1600,
        updatedBy: uid,
        updatedAt: Date.now(),
      },
      round2: {
        maxWidthPx: 1400,
        maxHeightPx: 820,
        borderRadiusPx: 0,
        updatedBy: uid,
        updatedAt: Date.now(),
      },
      round3: {
        questionFontSizePx: 74,
        themeFontSizePx: 34,
        timerFontSizePx: 72,
        questionColor: "#ffffff",
        themeColor: "#cfe6ff",
        timerColor: "#8cf5dc",
        fontWeight: 800,
        align: "center",
        blockGapPx: 14,
        maxWidthPx: 1600,
        updatedBy: uid,
        updatedAt: Date.now(),
      },
      round4: {
        clueFontSizePx: 40,
        clueColor: "#ffffff",
        wordFontSizePx: 28,
        cellRadiusPx: 14,
        markerSizePx: 18,
        markerOpacity: 0.95,
        gridMaxWidthPx: 1500,
        gridGapPx: 10,
        updatedBy: uid,
        updatedAt: Date.now(),
      },
      round5: {
        primaryFontSizePx: 52,
        secondaryFontSizePx: 30,
        primaryColor: "#ffffff",
        secondaryColor: "#b5cef0",
        playingColor: "#57e389",
        pausedColor: "#ffd166",
        stoppedColor: "#ff6b6b",
        progressHeightPx: 10,
        cornerRadiusPx: 12,
        maxWidthPx: 1000,
        decorationOpacity: 0.2,
        progressMaxSeconds: 180,
        updatedBy: uid,
        updatedAt: Date.now(),
      },
    });
  }



  const viewersLiveStateRef = ref(db, "rooms/viewers/liveState");
  if (!(await get(viewersLiveStateRef)).exists()) {
    await set(viewersLiveStateRef, {
      active: false,
      status: "idle",
      updatedBy: uid,
      updatedAt: Date.now(),
    });
  }

  const blindtestLiveRef = ref(db, "blindtestLive");
  if (!(await get(blindtestLiveRef)).exists()) {
    await set(blindtestLiveRef, {
      active: false,
      trackId: null,
      trackIndex: 0,
      playbackState: "stopped",
      startedAt: null,
      pausedAtSeconds: 0,
      syncVersion: 0,
      lastError: "",
      updatedBy: uid,
      updatedAt: Date.now(),
    });
  }
}



export { db, ref, set, get, onValue, push, update, runTransaction, remove };
