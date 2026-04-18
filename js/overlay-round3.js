import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";
import { autoFitText } from "./auto-fit-text.js";

const rootNode = document.querySelector(".overlay-round3");
const themeNode = document.getElementById("m3-overlay-theme");
const questionNode = document.getElementById("m3-overlay-question");
const timerNode = document.getElementById("m3-overlay-timer");

const DURATION = 90_000;
let themes = {};
let state = null;
let overlayConfig = null;
let rafId = 0;

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
  if (!overlayConfig || !rootNode) return;

  questionNode.style.color = overlayConfig.questionColor;
  themeNode.style.fontSize = `${overlayConfig.themeFontSizePx}px`;
  themeNode.style.color = overlayConfig.themeColor;
  timerNode.style.fontSize = `${overlayConfig.timerFontSizePx}px`;
  timerNode.style.color = overlayConfig.timerColor;

  themeNode.style.fontWeight = String(overlayConfig.fontWeight);
  questionNode.style.fontWeight = String(overlayConfig.fontWeight);
  timerNode.style.fontWeight = String(overlayConfig.fontWeight);

  rootNode.style.textAlign = overlayConfig.align;
  rootNode.style.gap = `${overlayConfig.blockGapPx}px`;
  rootNode.style.padding = `${overlayConfig.questionPaddingPx}px`;
}

function runAutoFit() {
  if (!overlayConfig || !rootNode || !questionNode) return;

  autoFitText({
    container: rootNode,
    textElement: questionNode,
    minFontSizePx: overlayConfig.questionMinFontSizePx,
    maxFontSizePx: overlayConfig.questionMaxFontSizePx,
    paddingPx: overlayConfig.questionPaddingPx,
    lineHeight: overlayConfig.questionLineHeight,
    maxWidthPx: overlayConfig.maxWidthPx,
  });
}

function scheduleAutoFit() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    runAutoFit();
  });
}

function render() {
  const theme = themes[state?.activeThemeId] || null;
  const questions = Object.values(theme?.questions || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const current = questions[Number(state?.questionIndex || 0)] || null;

  themeNode.textContent = `Thème : ${theme?.name || "—"}`;
  questionNode.textContent = current?.text || (theme ? "Fin des questions" : "En attente du thème.");
  timerNode.textContent = formatTimer(remainingMs());
  applyOverlayConfig();
  scheduleAutoFit();
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

if (window.ResizeObserver && rootNode) {
  new ResizeObserver(() => scheduleAutoFit()).observe(rootNode);
}
window.addEventListener("resize", scheduleAutoFit);
document.fonts?.ready?.then(() => scheduleAutoFit());

setInterval(render, 250);
