import { db, ref, onValue } from "./firebase.js";

const themeNode = document.getElementById("m3-overlay-theme");
const questionNode = document.getElementById("m3-overlay-question");
const timerNode = document.getElementById("m3-overlay-timer");

const DURATION = 90_000;
let themes = {};
let state = null;
let overlaySettings = { questionFontSizePx: 72, questionColor: "#ffffff" };

function formatTimer(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function remainingMs() {
  if (!state) return DURATION;
  if (state.timerStatus === "running") return Math.max(0, Number(state.timerEndsAt || 0) - Date.now());
  return Math.max(0, Number(state.timerRemainingMs ?? DURATION));
}

function applyOverlayStyle() {
  questionNode.style.fontSize = `${overlaySettings.questionFontSizePx}px`;
  questionNode.style.color = overlaySettings.questionColor;
  timerNode.style.color = overlaySettings.questionColor;
}

function render() {
  const theme = themes[state?.activeThemeId] || null;
  const questions = Object.values(theme?.questions || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const current = questions[Number(state?.questionIndex || 0)] || null;

  themeNode.textContent = `Thème : ${theme?.name || "—"}`;
  questionNode.textContent = current?.text || (theme ? "Fin des questions" : "En attente du thème.");
  timerNode.textContent = formatTimer(remainingMs());
  applyOverlayStyle();
}

onValue(ref(db, "rooms/manche3/state"), (snap) => {
  state = snap.val() || {};
  render();
});

onValue(ref(db, "rooms/manche3/themes"), (snap) => {
  themes = snap.val() || {};
  render();
});

onValue(ref(db, "rooms/manche3/overlaySettings"), (snap) => {
  const settings = snap.val() || {};
  overlaySettings = {
    questionFontSizePx: Math.max(24, Math.min(180, Number(settings.questionFontSizePx || 72))),
    questionColor: typeof settings.questionColor === "string" && /^#[0-9a-fA-F]{6}$/.test(settings.questionColor)
      ? settings.questionColor
      : "#ffffff",
  };
  render();
});

setInterval(render, 250);
