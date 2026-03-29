import { db, ref, onValue } from "./firebase.js";

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room") || "room-main";
const canvas = document.getElementById("overlay-canvas");
const ctx = canvas.getContext("2d");

let overlay = {};
let state = {};
let questions = [];

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  render();
}
window.addEventListener("resize", fitCanvas);

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (overlay.bgUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawText();
    };
    img.src = overlay.bgUrl;
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawText();
  }
}

function drawText() {
  const idx = state.currentQuestionIndex ?? 0;
  const q = questions[idx];
  ctx.fillStyle = overlay.textColor || "#ffffff";
  ctx.font = "bold 52px Arial";
  ctx.fillText(`ZogQuiz • Room ${roomId}`, 40, 80);
  ctx.font = "bold 44px Arial";
  ctx.fillText(q?.text ? `Q: ${q.text}` : "En attente de question...", 40, 170);

  ctx.font = "bold 56px Arial";
  if (state.buzz?.userId) {
    ctx.fillText(`🔔 ${state.buzz.userId} a buzzé !`, 40, 260);
  } else if (state.buzzerOpen) {
    ctx.fillText("Buzzer OUVERT", 40, 260);
  } else {
    ctx.fillText("Buzzer fermé", 40, 260);
  }
}

onValue(ref(db, `rooms/${roomId}/overlay`), (snap) => {
  overlay = snap.val() || {};
  render();
});
onValue(ref(db, `rooms/${roomId}/state`), (snap) => {
  state = snap.val() || {};
  render();
});
onValue(ref(db, `rooms/${roomId}/quiz/questions`), (snap) => {
  questions = Object.values(snap.val() || {});
  render();
});

fitCanvas();
