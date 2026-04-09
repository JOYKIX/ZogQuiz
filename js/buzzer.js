import { db, ref, get, set, push, onValue, runTransaction, remove } from "./firebase.js";

const guestForm = document.getElementById("guest-form");
const guestMessage = document.getElementById("guest-message");
const buzzerPanel = document.getElementById("buzzer-panel");
const guestTitle = document.getElementById("guest-title");
const buzzBtn = document.getElementById("buzz-btn");
const buzzFeedback = document.getElementById("buzz-feedback");

let currentSession = null;
let currentNickname = "";
let liveState = null;
let currentQuestionBlocked = false;

function normalizeNickname(nickname) {
  return nickname.trim().toLowerCase().replace(/\s+/g, "-");
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
  if (!codeSnap.exists()) return (guestMessage.textContent = "Code invalide.");

  const codeData = codeSnap.val();
  const expired = Date.now() > (codeData.expiresAt || 0);
  if (!codeData.active || expired) {
    if (expired) {
      await remove(codeRef);
    }
    return (guestMessage.textContent = "Code expiré ou désactivé.");
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

  guestMessage.textContent = existingSnap.exists()
    ? "Reconnecté au buzzer avec ton profil existant."
    : "Connecté au buzzer.";
  guestTitle.textContent = `Connecté en tant que ${nickname}`;
  buzzerPanel.classList.remove("hidden");
  watchLiveState();
});

function watchLiveState() {
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
    buzzFeedback.textContent = "Question viewers en cours : buzzer désactivé.";
    return;
  }

  if (currentQuestionBlocked) {
    buzzBtn.disabled = true;
    buzzFeedback.textContent = "Tu as déjà tenté et c'était faux sur cette question.";
    return;
  }

  if (liveState.buzzerLocked) {
    buzzBtn.disabled = liveState.lockedBySessionId !== currentSession;
    buzzFeedback.textContent = liveState.lockedBySessionId === currentSession
      ? "Tu as buzzé en premier, attends l'admin."
      : `${liveState.lockedByNickname || "Quelqu'un"} a déjà buzzé.`;
    return;
  }

  buzzBtn.disabled = false;
  buzzFeedback.textContent = "Buzzer ouvert. Clique quand tu veux répondre.";
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
    if (!state || state.currentType === "viewers" || state.buzzerLocked) {
      return state;
    }
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
    buzzFeedback.textContent = "Buzz validé ! Tu es le premier.";
  } else {
    buzzFeedback.textContent = "Trop tard, quelqu'un a buzzé avant.";
  }
});
