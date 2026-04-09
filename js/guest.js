import { db, ref, get, set, push, onValue, runTransaction, remove } from "./firebase.js";

const round1Root = document.getElementById("guest-round1");
const round2Root = document.getElementById("guest-round2");

const guestForm = document.getElementById("guest-form");
const guestMessage = document.getElementById("guest-message");
const buzzerPanel = document.getElementById("buzzer-panel");
const guestTitle = document.getElementById("guest-title");
const buzzBtn = document.getElementById("buzz-btn");
const buzzFeedback = document.getElementById("buzz-feedback");

const m2Image = document.getElementById("m2-live-image");
const m2Empty = document.getElementById("m2-empty");

let activeRound = "manche1";
let currentSession = null;
let currentNickname = "";
let liveState = null;
let currentQuestionBlocked = false;
let watchingRound1 = false;
let manche2Questions = {};
let manche2State = null;

function normalizeNickname(nickname) {
  return nickname.trim().toLowerCase().replace(/\s+/g, "-");
}

function renderByRound() {
  const round2 = activeRound === "manche2";
  round1Root.classList.toggle("hidden", round2);
  round2Root.classList.toggle("hidden", !round2);
  if (round2) {
    renderRound2();
  }
}

function renderRound2() {
  const activeQuestion = manche2State?.activeQuestionId ? manche2Questions[manche2State.activeQuestionId] : null;
  if (!activeQuestion?.imageDataUrl) {
    m2Image.classList.add("hidden");
    m2Empty.classList.remove("hidden");
    return;
  }

  m2Image.src = activeQuestion.imageDataUrl;
  m2Image.classList.remove("hidden");
  m2Empty.classList.add("hidden");
}

guestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = document.getElementById("guest-code").value.trim().toUpperCase();
  const nickname = document.getElementById("guest-nickname").value.trim();

  if (!code || !nickname) {
    guestMessage.textContent = "Code et pseudo obligatoires.";
    return;
  }

  const codeRef = ref(db, `rooms/manche1/accessCodes/${code}`);
  const codeSnap = await get(codeRef);
  if (!codeSnap.exists()) {
    guestMessage.textContent = "Code invalide.";
    return;
  }

  const codeData = codeSnap.val() || {};
  const expired = Date.now() > Number(codeData.expiresAt || 0);
  if (!codeData.active || expired) {
    if (expired) await remove(codeRef);
    guestMessage.textContent = "Code expiré.";
    return;
  }

  const nicknameKey = normalizeNickname(nickname);
  if (!nicknameKey) {
    guestMessage.textContent = "Pseudo invalide.";
    return;
  }

  const sessionRef = ref(db, `rooms/manche1/guestSessions/${nicknameKey}`);
  const existingSnap = await get(sessionRef);
  const existing = existingSnap.val() || {};

  currentSession = nicknameKey;
  currentNickname = nickname;

  await set(sessionRef, {
    nickname,
    code,
    joinedAt: existing.joinedAt || Date.now(),
    reconnectAt: Date.now(),
    score: Number(existing.score || 0),
  });

  guestMessage.textContent = existingSnap.exists() ? "Reconnecté." : "Connecté.";
  guestTitle.textContent = `Pseudo : ${nickname}`;
  buzzerPanel.classList.remove("hidden");

  if (!watchingRound1) {
    watchRound1State();
    watchingRound1 = true;
  }
});

function watchRound1State() {
  onValue(ref(db, "rooms/manche1/state"), async (snap) => {
    liveState = snap.val() || {};
    if (!liveState.currentQuestionId || !currentSession) {
      currentQuestionBlocked = false;
    } else {
      const blockedSnap = await get(ref(db, `rooms/manche1/questionBlocks/${liveState.currentQuestionId}/${currentSession}`));
      currentQuestionBlocked = blockedSnap.exists();
    }
    refreshButtonState();
  });
}

function refreshButtonState() {
  if (!liveState) return;

  if (liveState.currentType === "viewers") {
    buzzBtn.disabled = true;
    buzzFeedback.textContent = "Mode viewers";
    return;
  }

  if (currentQuestionBlocked) {
    buzzBtn.disabled = true;
    buzzFeedback.textContent = "Déjà tenté";
    return;
  }

  if (liveState.buzzerLocked) {
    buzzBtn.disabled = liveState.lockedBySessionId !== currentSession;
    buzzFeedback.textContent = liveState.lockedBySessionId === currentSession
      ? "En attente admin"
      : `${liveState.lockedByNickname || "Quelqu'un"} a buzzé`;
    return;
  }

  buzzBtn.disabled = false;
  buzzFeedback.textContent = "Buzzer ouvert";
}

buzzBtn.addEventListener("click", async () => {
  if (!currentSession || !liveState || liveState.currentType === "viewers") return;

  const blockedSnap = await get(ref(db, `rooms/manche1/questionBlocks/${liveState.currentQuestionId}/${currentSession}`));
  if (blockedSnap.exists()) {
    currentQuestionBlocked = true;
    refreshButtonState();
    return;
  }

  const stateRef = ref(db, "rooms/manche1/state");
  const tx = await runTransaction(stateRef, (state) => {
    if (!state || state.currentType === "viewers" || state.buzzerLocked) return state;
    return {
      ...state,
      buzzerLocked: true,
      lockedBySessionId: currentSession,
      lockedByNickname: currentNickname,
      lockedAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  if (tx.committed) {
    await push(ref(db, "rooms/manche1/buzzes"), {
      sessionId: currentSession,
      nickname: currentNickname,
      questionId: liveState.currentQuestionId || null,
      timestamp: Date.now(),
    });
    buzzFeedback.textContent = "Buzz validé";
  } else {
    buzzFeedback.textContent = "Trop tard";
  }
});

onValue(ref(db, "quiz/state"), (snap) => {
  activeRound = snap.val()?.activeRound || "manche1";
  renderByRound();
});

onValue(ref(db, "rooms/manche2/questions"), (snap) => {
  manche2Questions = snap.val() || {};
  renderRound2();
});

onValue(ref(db, "rooms/manche2/state"), (snap) => {
  manche2State = snap.val() || {};
  renderRound2();
});

watchRound1State();
watchingRound1 = true;
renderByRound();
