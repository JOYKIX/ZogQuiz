import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";
import { formatTimer } from "./timer-format.js";

const ROUND3_DURATION_MS = 90_000;

const rootNode = document.querySelector(".timer-overlay-round3");
const timerNode = document.getElementById("m3-timer-overlay-value");
const timerShellNode = document.querySelector(".m3-timer-card");
const timerProgressNode = document.getElementById("m3-timer-progress");

let state = null;
let overlayConfig = null;
let ticker = 0;
let roundDurationMs = ROUND3_DURATION_MS;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getConfiguredDurationMs(nextState = state) {
  const candidates = [
    nextState?.timerDurationMs,
    nextState?.durationMs,
    nextState?.initialTimerMs,
    nextState?.initialDurationMs,
  ];
  const configured = candidates.map(Number).find((value) => Number.isFinite(value) && value > 0);
  if (configured) return configured;

  const remaining = Number(nextState?.timerRemainingMs);
  if (nextState?.timerStatus === "idle" && Number.isFinite(remaining) && remaining > 0) return remaining;

  return roundDurationMs;
}

function updateRoundDuration(nextState = state) {
  const duration = getConfiguredDurationMs(nextState);
  const remaining = Number(nextState?.timerRemainingMs);
  roundDurationMs = Math.max(
    1_000,
    duration,
    Number.isFinite(remaining) ? remaining : 0,
  );
}

function remainingMs() {
  if (!state) return roundDurationMs;
  if (state.timerStatus === "running") return Math.max(0, Number(state.timerEndsAt || 0) - Date.now());
  return Math.max(0, Number(state.timerRemainingMs ?? roundDurationMs));
}

function applyOverlayConfig() {
  if (!overlayConfig || !rootNode || !timerNode || !timerShellNode) return;

  const shellMaxWidthPx = Math.max(260, Number(overlayConfig.maxWidthPx) || 520);
  const shellWidthPx = clamp(Math.round(overlayConfig.timerFontSizePx * 6.6), 320, shellMaxWidthPx);

  rootNode.style.padding = `${overlayConfig.paddingPx}px`;
  rootNode.style.textAlign = overlayConfig.align;
  rootNode.style.justifyItems = overlayConfig.align === "left" ? "start" : overlayConfig.align === "right" ? "end" : "center";
  timerShellNode.style.setProperty("--timer-color", overlayConfig.timerColor);
  timerShellNode.style.setProperty("--timer-card-width", `${shellWidthPx}px`);
  timerShellNode.style.setProperty("--timer-font-size", `clamp(2.5rem, 15vmin, ${overlayConfig.timerFontSizePx}px)`);
  timerNode.style.color = overlayConfig.timerColor;
  timerNode.style.fontWeight = String(overlayConfig.fontWeight);
  timerNode.style.textAlign = overlayConfig.align;
}

function renderProgress(remaining) {
  if (!timerProgressNode) return;
  const percent = clamp((remaining / Math.max(1, roundDurationMs)) * 100, 0, 100);
  timerProgressNode.style.setProperty("--timer-progress", `${percent}%`);
}

function render() {
  if (!timerNode) return;
  const remaining = remainingMs();
  timerNode.textContent = formatTimer(remaining, overlayConfig?.timerFormat);
  renderProgress(remaining);
  applyOverlayConfig();
}

function startTicker() {
  window.clearInterval(ticker);
  ticker = window.setInterval(render, 200);
}

onValue(ref(db, "rooms/manche3/state"), (snap) => {
  state = snap.val() || {};
  updateRoundDuration(state);
  render();
  startTicker();
});

watchOverlayConfig("round3Timer", (config) => {
  overlayConfig = config;
  render();
});

import { initMortSubiteOverlay } from "./mort-subite.js";
initMortSubiteOverlay();
