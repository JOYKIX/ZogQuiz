import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";

const themeNode = document.getElementById("m3-overlay-theme");
const questionNode = document.getElementById("m3-overlay-question");
const timerNode = document.getElementById("m3-overlay-timer");

const DURATION = 90_000;
let themes = {};
let state = null;
let overlayConfig = null;

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

function applyOverlayConfig() {
  if (!overlayConfig) return;
  questionNode.style.fontSize = `${overlayConfig.questionFontSizePx}px`;
  questionNode.style.color = overlayConfig.questionColor;
  themeNode.style.fontSize = `${overlayConfig.themeFontSizePx}px`;
  themeNode.style.color = overlayConfig.themeColor;
  timerNode.style.fontSize = `${overlayConfig.timerFontSizePx}px`;
  timerNode.style.color = overlayConfig.timerColor;

  themeNode.style.fontWeight = String(overlayConfig.fontWeight);
  questionNode.style.fontWeight = String(overlayConfig.fontWeight);
  timerNode.style.fontWeight = String(overlayConfig.fontWeight);

  const root = document.querySelector(".overlay-round3");
  root.style.textAlign = overlayConfig.align;
  root.style.gap = `${overlayConfig.blockGapPx}px`;
  questionNode.style.maxWidth = `${overlayConfig.maxWidthPx}px`;
}

function render() {
  const theme = themes[state?.activeThemeId] || null;
  const questions = Object.values(theme?.questions || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const current = questions[Number(state?.questionIndex || 0)] || null;

  themeNode.textContent = `Thème : ${theme?.name || "—"}`;
  questionNode.textContent = current?.text || (theme ? "Fin des questions" : "En attente du thème.");
  timerNode.textContent = formatTimer(remainingMs());
  applyOverlayConfig();
}

onValue(ref(db, "rooms/manche3/state"), (snap) => {
  state = snap.val() || {};
  render();
});

onValue(ref(db, "rooms/manche3/themes"), (snap) => {
  themes = snap.val() || {};
  render();
});

watchOverlayConfig("round3", (config) => {
  overlayConfig = config;
  render();
});

setInterval(render, 250);
