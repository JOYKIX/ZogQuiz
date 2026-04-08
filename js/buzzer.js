import { db, ref, get, set, push } from "./firebase.js";

const guestForm = document.getElementById("guest-form");
const guestMessage = document.getElementById("guest-message");
const buzzerPanel = document.getElementById("buzzer-panel");
const guestTitle = document.getElementById("guest-title");
const buzzBtn = document.getElementById("buzz-btn");
const buzzFeedback = document.getElementById("buzz-feedback");

let currentSession = null;

guestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = document.getElementById("guest-code").value.trim().toUpperCase();
  const nickname = document.getElementById("guest-nickname").value.trim();

  if (!code || !nickname) {
    guestMessage.textContent = "Code et pseudo obligatoires.";
    return;
  }

  const codeSnap = await get(ref(db, `rooms/manche1/accessCodes/${code}`));
  if (!codeSnap.exists()) {
    guestMessage.textContent = "Code invalide.";
    return;
  }

  const codeData = codeSnap.val();
  const expired = Date.now() > (codeData.expiresAt || 0);
  if (!codeData.active || expired) {
    guestMessage.textContent = "Code expiré ou désactivé.";
    return;
  }

  const sessionRef = push(ref(db, "rooms/manche1/guestSessions"));
  currentSession = sessionRef.key;

  await set(sessionRef, {
    nickname,
    code,
    joinedAt: Date.now(),
  });

  guestMessage.textContent = "Connecté au buzzer.";
  guestTitle.textContent = `Connecté en tant que ${nickname}`;
  buzzerPanel.classList.remove("hidden");
});

buzzBtn.addEventListener("click", async () => {
  if (!currentSession) return;

  await push(ref(db, "rooms/manche1/buzzes"), {
    sessionId: currentSession,
    timestamp: Date.now(),
  });

  buzzFeedback.textContent = "Buzz envoyé !";
});
