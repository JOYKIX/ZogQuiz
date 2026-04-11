import { db, ref, get, set, push, onValue, runTransaction, remove, update } from "./firebase.js";
import { createBuzzSoundTrigger } from "./audio.js";
import { initManche4Guest } from "./manche4.js";

const round1Root = document.getElementById("guest-round1");
const round2Root = document.getElementById("guest-round2");
const round3Root = document.getElementById("guest-round3");
const round4Root = document.getElementById("guest-round4");

const guestForm = document.getElementById("guest-form");
const guestMessage = document.getElementById("guest-message");
const buzzerPanel = document.getElementById("buzzer-panel");
const guestTitle = document.getElementById("guest-title");
const buzzBtn = document.getElementById("buzz-btn");
const buzzFeedback = document.getElementById("buzz-feedback");

const m2Image = document.getElementById("m2-live-image");
const m2Empty = document.getElementById("m2-empty");

const m3GuestStatus = document.getElementById("m3-guest-status");
const m3GuestPlayer = document.getElementById("m3-guest-player");
const m3GuestTheme = document.getElementById("m3-guest-theme");
const m3GuestHelp = document.getElementById("m3-guest-help");
const m3ThemeButtons = document.getElementById("m3-theme-buttons");

let liveRound = "manche1";
let currentSession = null;
let currentNickname = "";
let liveState = null;
let currentQuestionBlocked = false;
let watchingRound1 = false;
let manche2Questions = {};
let manche2State = null;
let round3State = null;
let round3Themes = {};
let sessionsById = {};

const triggerBuzzSound = createBuzzSoundTrigger();

function normalizeNickname(nickname) {
  return nickname.trim().toLowerCase().replace(/\s+/g, "-");
}

function renderByRound() {
  const isRound2 = liveRound === "manche2";
  const isRound3 = liveRound === "manche3";
  const isRound4 = liveRound === "manche4";
  round1Root.classList.toggle("hidden", isRound2 || isRound3 || isRound4);
  round2Root.classList.toggle("hidden", !isRound2);
  round3Root.classList.toggle("hidden", !isRound3);
  round4Root.classList.toggle("hidden", !isRound4);
  if (isRound2) renderRound2();
  if (isRound3) renderRound3();
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

function renderRound3() {
  const activePlayerId = round3State?.activePlayerId;
  const activePlayerName = sessionsById[activePlayerId]?.nickname || "Aucun";
  const activeTheme = round3Themes[round3State?.activeThemeId] || null;
  const isCurrentPlayer = Boolean(currentSession && activePlayerId === currentSession);
  const themeLocked = Boolean(round3State?.activeThemeId);

  m3GuestPlayer.textContent = `Joueur actif : ${activePlayerName}`;
  m3GuestTheme.textContent = `Thème actif : ${activeTheme?.name || "Aucun"}`;

  if (!currentSession) {
    m3GuestStatus.textContent = "Connectez-vous d'abord avec votre code.";
    m3GuestHelp.textContent = "Connectez-vous pour participer.";
  } else if (isCurrentPlayer && !themeLocked) {
    m3GuestStatus.textContent = "À vous de choisir un thème.";
    m3GuestHelp.textContent = "Cliquez sur un thème pour commencer.";
  } else if (isCurrentPlayer && themeLocked) {
    m3GuestStatus.textContent = "Thème choisi. En attente de l'admin.";
    m3GuestHelp.textContent = "Le tour est en cours.";
  } else {
    m3GuestStatus.textContent = "Tour d'un autre joueur.";
    m3GuestHelp.textContent = "Attendez votre tour.";
  }

  const themes = Object.entries(round3Themes || {}).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  m3ThemeButtons.innerHTML = "";
  if (!themes.length) {
    m3ThemeButtons.innerHTML = "<p class='muted'>Aucun thème disponible.</p>";
    return;
  }

  for (const [id, theme] of themes) {
    const btn = document.createElement("button");
    btn.className = id === round3State?.activeThemeId ? "btn btn-secondary" : "btn btn-primary";
    btn.textContent = theme.name || "Thème";
    btn.disabled = !isCurrentPlayer || themeLocked;
    btn.setAttribute("aria-pressed", String(id === round3State?.activeThemeId));
    btn.addEventListener("click", async () => {
      if (!isCurrentPlayer) return;
      await update(ref(db, "rooms/manche3/state"), {
        activeThemeId: id,
        questionIndex: 0,
        timerRemainingMs: Number(round3State?.timerRemainingMs || 90_000),
        timerStatus: round3State?.timerStatus || "idle",
        updatedAt: Date.now(),
      });
    });
    m3ThemeButtons.appendChild(btn);
  }
}

guestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = document.getElementById("guest-code").value.trim().toUpperCase();
  const nickname = document.getElementById("guest-nickname").value.trim();

  if (!code || !nickname) return (guestMessage.textContent = "Code et pseudo obligatoires.");

  const codeRef = ref(db, `rooms/manche1/accessCodes/${code}`);
  const codeSnap = await get(codeRef);
  if (!codeSnap.exists()) return (guestMessage.textContent = "Code invalide.");

  const codeData = codeSnap.val() || {};
  const expired = Date.now() > Number(codeData.expiresAt || 0);
  if (!codeData.active || expired) {
    if (expired) await remove(codeRef);
    return (guestMessage.textContent = "Code expiré.");
  }

  const nicknameKey = normalizeNickname(nickname);
  if (!nicknameKey) return (guestMessage.textContent = "Pseudo invalide.");

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
  renderRound3();
});

function watchRound1State() {
  onValue(ref(db, "rooms/manche1/state"), async (snap) => {
    liveState = snap.val() || {};
    triggerBuzzSound(liveState);
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
    buzzFeedback.textContent = liveState.lockedBySessionId === currentSession ? "En attente admin" : `${liveState.lockedByNickname || "Quelqu'un"} a buzzé`;
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
  const state = snap.val() || {};
  liveRound = state.liveRound || state.activeRound || "manche1";
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

onValue(ref(db, "rooms/manche3/state"), (snap) => {
  round3State = snap.val() || {};
  renderRound3();
});

onValue(ref(db, "rooms/manche3/themes"), (snap) => {
  round3Themes = snap.val() || {};
  renderRound3();
});

onValue(ref(db, "rooms/manche1/guestSessions"), (snap) => {
  sessionsById = snap.val() || {};
  renderRound3();
});

initManche4Guest({ getCurrentSession: () => currentSession });

watchRound1State();
watchingRound1 = true;
renderByRound();
