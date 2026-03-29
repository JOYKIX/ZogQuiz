import { db, ref, onValue, runTransaction, sessionGet, sessionClear } from "./firebase.js";

const session = sessionGet();
if (!session || session.role !== "participant") {
  window.location.href = "index.html";
}

document.getElementById("player-info").textContent = `Connecté: ${session.id}`;
document.getElementById("logout-btn").onclick = () => {
  sessionClear();
  window.location.href = "index.html";
};

const roomInput = document.getElementById("room-id");
const buzzBtn = document.getElementById("buzz-btn");
const stateText = document.getElementById("buzz-state");
let roomId = "room-main";
let state = {};
let unsubState = null;

function roomPath(path) {
  return `rooms/${roomId}/${path}`;
}

function syncBuzzButton() {
  const closed = !state.buzzerOpen || Boolean(state.buzz?.userId);
  buzzBtn.disabled = closed;
}

function bindRoom() {
  if (unsubState) unsubState();
  stateText.textContent = `Connexion à la room ${roomId}...`;

  unsubState = onValue(ref(db, roomPath("state")), (snap) => {
    state = snap.val() || {};
    if (state.buzz?.userId) {
      stateText.textContent = `Premier buzz: ${state.buzz.userId}`;
    } else if (state.buzzerOpen) {
      stateText.textContent = "Buzzer ouvert, fonce !";
    } else {
      stateText.textContent = "Buzzer fermé (attends l'admin).";
    }
    syncBuzzButton();
  });
}

document.getElementById("join-room").onclick = () => {
  roomId = roomInput.value.trim() || "room-main";
  bindRoom();
};

buzzBtn.onclick = async () => {
  await runTransaction(ref(db, roomPath("state")), (current) => {
    const now = current || {};
    if (!now.buzzerOpen || now.buzz?.userId) return now;
    now.buzz = { userId: session.id, ts: Date.now() };
    now.buzzerOpen = false;
    return now;
  });
};

bindRoom();
