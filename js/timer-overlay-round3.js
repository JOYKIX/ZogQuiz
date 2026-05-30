import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";
import { autoFitText } from "./auto-fit-text.js";
import { formatTimer } from "./timer-format.js";

const ROUND3_DURATION_MS = 90_000;
const MIN_SEGMENTS = 1;
const MAX_SEGMENTS = 240;
const SEGMENT_RADIUS = 45;
const MIN_SEGMENT_GAP_DEGREES = 2;
const MAX_SEGMENT_GAP_DEGREES = 7;

const rootNode = document.querySelector(".timer-overlay-round3");
const timerNode = document.getElementById("m3-timer-overlay-value");
const timerShellNode = document.querySelector(".m3-segmented-timer");
const segmentsNode = document.getElementById("m3-timer-segments");

let state = null;
let overlayConfig = null;
let ticker = 0;
let rafId = 0;
let roundDurationMs = ROUND3_DURATION_MS;
let renderedSegmentCount = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function polarToCartesian(radius, angleDegrees) {
  const angleRadians = (angleDegrees - 90) * Math.PI / 180;
  return {
    x: 50 + radius * Math.cos(angleRadians),
    y: 50 + radius * Math.sin(angleRadians),
  };
}

function describeArc(radius, startAngle, endAngle) {
  const start = polarToCartesian(radius, startAngle);
  const end = polarToCartesian(radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
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

function getSegmentCount() {
  return clamp(Math.ceil(roundDurationMs / 1000), MIN_SEGMENTS, MAX_SEGMENTS);
}

function getActiveSegmentCount() {
  return clamp(Math.ceil(remainingMs() / 1000), 0, getSegmentCount());
}

function renderSegmentGeometry(segmentCount) {
  if (!segmentsNode || renderedSegmentCount === segmentCount) return;

  const angleStep = 360 / segmentCount;
  const gap = clamp(angleStep * 0.34, MIN_SEGMENT_GAP_DEGREES, MAX_SEGMENT_GAP_DEGREES);
  const arcSweep = Math.max(0.4, angleStep - gap);
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < segmentCount; index += 1) {
    const startAngle = index * angleStep + gap / 2;
    const endAngle = startAngle + arcSweep;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "m3-timer-segment");
    path.setAttribute("d", describeArc(SEGMENT_RADIUS, startAngle, endAngle));
    path.setAttribute("pathLength", "1");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    path.style.setProperty("--segment-index", String(index));
    fragment.append(path);
  }

  segmentsNode.replaceChildren(fragment);
  renderedSegmentCount = segmentCount;
}

function renderSegments() {
  if (!segmentsNode) return;
  const segmentCount = getSegmentCount();
  const activeCount = getActiveSegmentCount();
  renderSegmentGeometry(segmentCount);

  Array.from(segmentsNode.children).forEach((segment, index) => {
    segment.classList.toggle("is-active", index < activeCount);
    segment.classList.toggle("is-inactive", index >= activeCount);
  });
}

function applyOverlayConfig() {
  if (!overlayConfig || !rootNode || !timerNode || !timerShellNode) return;

  const shellMaxSizePx = Math.max(160, Number(overlayConfig.maxWidthPx) || 520);
  const shellMinSizePx = Math.min(220, shellMaxSizePx);
  const shellSizePx = clamp(Math.round(overlayConfig.timerFontSizePx * 4.2), shellMinSizePx, shellMaxSizePx);

  rootNode.style.padding = `${overlayConfig.paddingPx}px`;
  rootNode.style.textAlign = overlayConfig.align;
  rootNode.style.justifyItems = overlayConfig.align === "left" ? "start" : overlayConfig.align === "right" ? "end" : "center";
  timerShellNode.style.setProperty("--timer-color", overlayConfig.timerColor);
  timerShellNode.style.setProperty("--timer-size", `${shellSizePx}px`);
  timerShellNode.style.setProperty("--timer-font-size", `${overlayConfig.timerFontSizePx}px`);
  timerNode.style.color = overlayConfig.timerColor;
  timerNode.style.fontWeight = String(overlayConfig.fontWeight);
  timerNode.style.textAlign = overlayConfig.align;
}

function runAutoFit() {
  if (!overlayConfig || !timerShellNode || !timerNode) return;
  autoFitText({
    container: timerShellNode,
    textElement: timerNode,
    minFontSizePx: 20,
    maxFontSizePx: overlayConfig.timerFontSizePx,
    paddingPx: Math.max(12, overlayConfig.timerFontSizePx * 0.3),
    lineHeight: overlayConfig.lineHeight,
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
  if (!timerNode) return;
  timerNode.textContent = formatTimer(remainingMs(), overlayConfig?.timerFormat);
  renderSegments();
  applyOverlayConfig();
  scheduleAutoFit();
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

if (window.ResizeObserver && rootNode) {
  new ResizeObserver(() => scheduleAutoFit()).observe(rootNode);
}
if (window.ResizeObserver && timerShellNode) {
  new ResizeObserver(() => scheduleAutoFit()).observe(timerShellNode);
}
window.addEventListener("resize", scheduleAutoFit);
document.fonts?.ready?.then(() => scheduleAutoFit());
