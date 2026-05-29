import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";
import { autoFitText } from "./auto-fit-text.js";
import { formatTimer } from "./timer-format.js";

const ROUND3_DURATION_MS = 90_000;
const rootNode = document.querySelector(".timer-overlay-round3");
const timerNode = document.getElementById("m3-timer-overlay-value");

let state = null;
let overlayConfig = null;
let ticker = 0;
let rafId = 0;

function remainingMs() {
  if (!state) return ROUND3_DURATION_MS;
  if (state.timerStatus === "running") return Math.max(0, Number(state.timerEndsAt || 0) - Date.now());
  return Math.max(0, Number(state.timerRemainingMs ?? ROUND3_DURATION_MS));
}

function applyOverlayConfig() {
  if (!overlayConfig || !rootNode || !timerNode) return;
  rootNode.style.padding = `${overlayConfig.questionPaddingPx}px`;
  rootNode.style.textAlign = overlayConfig.align;
  timerNode.style.color = overlayConfig.timerColor;
  timerNode.style.fontWeight = String(overlayConfig.fontWeight);
  timerNode.style.textAlign = overlayConfig.align;
}

function runAutoFit() {
  if (!overlayConfig || !rootNode || !timerNode) return;
  autoFitText({
    container: rootNode,
    textElement: timerNode,
    minFontSizePx: Math.max(20, Math.min(overlayConfig.questionMinFontSizePx, overlayConfig.timerFontSizePx)),
    maxFontSizePx: Math.max(overlayConfig.timerFontSizePx, rootNode.clientWidth, rootNode.clientHeight),
    paddingPx: overlayConfig.questionPaddingPx,
    lineHeight: 0.9,
    maxWidthPx: rootNode.clientWidth,
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
  if (!timerNode) return;
  timerNode.textContent = formatTimer(remainingMs(), overlayConfig?.timerFormat);
  applyOverlayConfig();
  scheduleAutoFit();
}

function startTicker() {
  window.clearInterval(ticker);
  ticker = window.setInterval(render, 200);
}

onValue(ref(db, "rooms/manche3/state"), (snap) => {
  state = snap.val() || {};
  render();
  startTicker();
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
