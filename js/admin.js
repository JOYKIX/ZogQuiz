import {
  db,
  ref,
  set,
  get,
  push,
  onValue,
  update,
  runTransaction,
  hashPassword,
  sessionGet,
  sessionClear,
} from "./firebase.js";

const session = sessionGet();
if (!session || session.role !== "admin") {
  window.location.href = "index.html";
}

document.getElementById("session-info").textContent = `Connecté: ${session.id}`;
document.getElementById("logout-btn").onclick = () => {
  sessionClear();
  window.location.href = "index.html";
};

const roomInput = document.getElementById("room-id");
const questionsList = document.getElementById("questions-list");
const currentQuestion = document.getElementById("current-question");
const buzzWinner = document.getElementById("buzz-winner");
const overlayLink = document.getElementById("overlay-link");
const previewCanvas = document.getElementById("preview-canvas");
const ctx = previewCanvas.getContext("2d");

let roomId = "room-main";
let questions = [];

function roomPath(path) {
  return `rooms/${roomId}/${path}`;
}

function bindRoom() {
  overlayLink.href = `overlay.html?room=${encodeURIComponent(roomId)}`;
  overlayLink.textContent = `${window.location.origin}/overlay.html?room=${roomId}`;

  onValue(ref(db, roomPath("quiz/questions")), (snap) => {
    const data = snap.val() || {};
    questions = Object.entries(data).map(([key, v]) => ({ key, ...v }));
    questionsList.innerHTML = "";
    questions.forEach((q, idx) => {
      const li = document.createElement("li");
      li.textContent = `${idx + 1}. ${q.text} | Réponse: ${q.answer} | ${q.points} pts`;
      const del = document.createElement("button");
      del.textContent = "Supprimer";
      del.onclick = async () => set(ref(db, roomPath(`quiz/questions/${q.key}`)), null);
      li.append(" ", del);
      questionsList.appendChild(li);
    });
  });

  onValue(ref(db, roomPath("state")), (snap) => {
    const s = snap.val() || {};
    const idx = s.currentQuestionIndex ?? 0;
    currentQuestion.textContent = questions[idx]
      ? `Question en cours: ${questions[idx].text}`
      : "Question en cours: aucune";
    buzzWinner.textContent = s.buzz?.userId ? `Premier buzz: ${s.buzz.userId}` : "Aucun buzz";
  });

  onValue(ref(db, roomPath("overlay")), (snap) => drawPreview(snap.val() || {}));
}

function drawPreview(overlay) {
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

  const renderText = (text, y) => {
    ctx.fillStyle = overlay.textColor || "#ffffff";
    ctx.font = "bold 32px Arial";
    ctx.fillText(text, 25, y);
  };

  renderText(`Room: ${roomId}`, 55);
  renderText("ZogQuiz Overlay Preview", 105);
  if (overlay.bgUrl) {
    renderText("Fond custom chargé (visible dans la page overlay)", 155);
  }
}

document.getElementById("load-room").onclick = () => {
  roomId = roomInput.value.trim() || "room-main";
  bindRoom();
};

document.getElementById("question-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("q-text").value.trim();
  const answer = document.getElementById("q-answer").value.trim();
  const points = Number(document.getElementById("q-points").value);
  if (!text || !answer || !points) return;

  await push(ref(db, roomPath("quiz/questions")), { text, answer, points });
  e.target.reset();
});

document.getElementById("unlock-buzzer").onclick = async () => {
  await update(ref(db, roomPath("state")), { buzzerOpen: true, buzz: null });
};

document.getElementById("reset-buzz").onclick = async () => {
  await update(ref(db, roomPath("state")), { buzz: null, buzzerOpen: false });
};

document.getElementById("next-question").onclick = async () => {
  await runTransaction(ref(db, roomPath("state/currentQuestionIndex")), (current) => (current ?? -1) + 1);
  await update(ref(db, roomPath("state")), { buzz: null, buzzerOpen: false });
};

document.getElementById("apply-score").onclick = async () => {
  const id = document.getElementById("score-id").value.trim();
  const delta = Number(document.getElementById("score-delta").value || 0);
  if (!id) return;
  await runTransaction(ref(db, roomPath(`scoreboard/${id}`)), (current) => {
    const base = current || { id, score: 0 };
    base.score = (base.score || 0) + delta;
    return base;
  });
};

document.getElementById("participant-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("participant-id").value.trim();
  const password = document.getElementById("participant-password").value;
  const message = document.getElementById("participant-message");

  if (!id || !password) return;

  await set(ref(db, `accounts/${id}`), {
    id,
    role: "participant",
    passwordHash: await hashPassword(password),
  });
  message.textContent = `Compte participant ${id} créé/mis à jour.`;
  e.target.reset();
});

document.getElementById("save-overlay").onclick = async () => {
  const bgUrl = document.getElementById("overlay-bg").value.trim();
  const textColor = document.getElementById("overlay-color").value;
  await set(ref(db, roomPath("overlay")), { bgUrl, textColor });
};

bindRoom();
