import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
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

export const ROUNDS = ["manche1", "manche2", "manche3", "manche4", "manche5", "manche6", "finale"];

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
      maxFontSizePx: 180,
      minFontSizePx: 28,
      textColor: "#ffffff",
      fontWeight: 800,
      textShadow: true,
      horizontalAlign: "center",
      verticalAlign: "center",
      safePaddingPx: 48,
      maxWidthPx: 1600,
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


  const manche5StateRef = ref(db, "rooms/manche5/state");
  if (!(await get(manche5StateRef)).exists()) {
    await set(manche5StateRef, {
      active: false,
      turnOrder: [],
      hpByPlayer: {},
      eliminated: {},
      currentTurnPlayerId: null,
      targetPlayerId: null,
      duel: { attackerId: null, targetId: null, question: "", buzzerOpen: false, buzzedBy: null, phase: "target" },
      updatedBy: uid,
      updatedAt: Date.now(),
    });
  }



  const manche6StateRef = ref(db, "rooms/manche6/state");
  if (!(await get(manche6StateRef)).exists()) {
    await set(manche6StateRef, {
      name: "Manche 6",
      phase: "setup",
      status: "idle",
      durationMs: 60000,
      activePlayer: "participant",
      players: {
        participant: { id: null, type: "participant", name: "Participant", score: 0, source: "manual" },
        viewer: { id: null, type: "viewer", name: "Viewer", score: 0, source: "manual" },
      },
      timers: { participant: { remainingMs: 60000 }, viewer: { remainingMs: 60000 } },
      timerStartedAt: null,
      currentQuestion: "",
      answers: { participant: "", viewer: "" },
      winner: null,
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
        maxFontSizePx: 180,
        minFontSizePx: 28,
        textColor: "#ffffff",
        fontWeight: 800,
        textShadow: true,
        horizontalAlign: "center",
        verticalAlign: "center",
        safePaddingPx: 48,
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
        questionMaxFontSizePx: 80,
        questionMinFontSizePx: 24,
        questionPaddingPx: 40,
        questionLineHeight: 1.2,
        themeColor: "#cfe6ff",
        fontWeight: 800,
        align: "center",
        maxWidthPx: 1600,
        updatedBy: uid,
        updatedAt: Date.now(),
      },
      round3Timer: {
        timerFontSizePx: 72,
        timerColor: "#8cf5dc",
        timerFormat: "minutes-seconds",
        fontWeight: 950,
        align: "center",
        paddingPx: 40,
        lineHeight: 0.9,
        maxWidthPx: 2200,
        updatedBy: uid,
        updatedAt: Date.now(),
      },
      round3ThemeOverlay: {
        textColor: "#cfe6ff",
        backgroundColor: "#10233f",
        activeBorderColor: "#ffda6b",
        fontSizePx: 34,
        fontWeight: 800,
        align: "center",
        columns: 2,
        maxWidthPx: 1600,
        paddingPx: 40,
        columnGapPx: 36,
        rowGapPx: 16,
        itemBackgroundWidthPercent: 100,
        itemPaddingYPx: 13,
        itemPaddingXPx: 21,
        borderRadiusPx: 14,
        borderWidthPx: 2,
        lineHeight: 1.08,
        letterSpacingEm: -0.035,
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

  const cameraOverlayConfigsRef = ref(db, "cameraOverlayConfigs");
  if (!(await get(cameraOverlayConfigsRef)).exists()) {
    const baseCameraConfig = {
      enabled: false,
      x: 40,
      y: 40,
      width: 260,
      height: 146,
      gap: 14,
      perRow: 3,
      borderRadius: 18,
      showNames: false,
      updatedBy: uid,
      updatedAt: Date.now(),
    };
    await set(cameraOverlayConfigsRef, {
      round1: { ...baseCameraConfig },
      round2: { ...baseCameraConfig },
      round3: { ...baseCameraConfig },
      round4: { ...baseCameraConfig },
      round5: { ...baseCameraConfig },
      round6: { ...baseCameraConfig },
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



  const legacyBlindtestLiveRef = ref(db, "blindtestLive");
  const legacyBlindtestTracksRef = ref(db, "blindtest/tracks");
  const manche4BlindtestTracksRef = ref(db, "rooms/manche4/blindtest/tracks");

  if (!(await get(manche4BlindtestTracksRef)).exists()) {
    const legacyTracksSnap = await get(legacyBlindtestTracksRef);
    if (legacyTracksSnap.exists()) {
      await set(manche4BlindtestTracksRef, legacyTracksSnap.val());
    }
  }

  const blindtestLiveRef = ref(db, "rooms/manche4/blindtest/live");
  if (!(await get(blindtestLiveRef)).exists()) {
    const legacyLiveSnap = await get(legacyBlindtestLiveRef);
    if (legacyLiveSnap.exists()) {
      await set(blindtestLiveRef, legacyLiveSnap.val());
    } else {
      await set(blindtestLiveRef, {
        active: false,
        trackId: null,
        trackIndex: 0,
        playbackState: "stopped",
        startedAt: null,
        pausedAtSeconds: 0,
        syncVersion: 0,
        lastError: "",
        stopOnAnswer: false,
        participantAnswers: {},
        updatedBy: uid,
        updatedAt: Date.now(),
      });
    }
  }
}



export { db, ref, set, get, onValue, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, push, update, runTransaction, remove };
