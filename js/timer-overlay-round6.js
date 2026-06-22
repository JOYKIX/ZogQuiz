import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";
import { formatTimer } from "./timer-format.js";

const DEFAULT_DURATION_MS = 60_000;
const MIN_SEGMENTS = 1;
const MAX_SEGMENTS = 240;
const SEGMENT_RADIUS = 45;
const MIN_SEGMENT_GAP_DEGREES = 2;
const MAX_SEGMENT_GAP_DEGREES = 7;
const PLAYER_KEYS = ["participant", "viewer"];

const rootNode = document.querySelector(".timer-overlay-round6");
const timerNodes = Object.fromEntries(PLAYER_KEYS.map((key) => [key, document.getElementById(`m6-timer-${key}`)]));
const shellNodes = Object.fromEntries(PLAYER_KEYS.map((key) => [key, document.getElementById(`m6-timer-${key}-shell`)]));
const segmentsNodes = Object.fromEntries(PLAYER_KEYS.map((key) => [key, document.getElementById(`m6-timer-${key}-segments`)]));
const renderedSegmentCounts = { participant: 0, viewer: 0 };

let state = null;
let overlayConfig = null;
let ticker = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function polarToCartesian(radius, angleDegrees) {
  const angleRadians = (angleDegrees - 90) * Math.PI / 180;
  return { x: 50 + radius * Math.cos(angleRadians), y: 50 + radius * Math.sin(angleRadians) };
}

function describeArc(radius, startAngle, endAngle) {
  const start = polarToCartesian(radius, startAngle);
  const end = polarToCartesian(radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function getDurationMs() {
  return Math.max(1_000, Number(state?.durationMs || DEFAULT_DURATION_MS));
}

function remainingMs(key) {
  const base = Math.max(0, Number(state?.timers?.[key]?.remainingMs ?? getDurationMs()));
  if (state?.status !== "running" || state?.activePlayer !== key || !state?.timerStartedAt) return base;
  return Math.max(0, base - Math.max(0, Date.now() - Number(state.timerStartedAt)));
}

function getSegmentCount() {
  return clamp(Math.ceil(getDurationMs() / 1000), MIN_SEGMENTS, MAX_SEGMENTS);
}

function renderSegmentGeometry(key, segmentCount) {
  const segmentsNode = segmentsNodes[key];
  if (!segmentsNode || renderedSegmentCounts[key] === segmentCount) return;
  const angleStep = 360 / segmentCount;
  const gap = clamp(angleStep * 0.34, MIN_SEGMENT_GAP_DEGREES, MAX_SEGMENT_GAP_DEGREES);
  const arcSweep = Math.max(0.4, angleStep - gap);
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < segmentCount; index += 1) {
    const startAngle = index * angleStep + gap / 2;
    const endAngle = startAngle + arcSweep;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "m6-timer-segment");
    path.setAttribute("d", describeArc(SEGMENT_RADIUS, startAngle, endAngle));
    path.setAttribute("pathLength", "1");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    fragment.append(path);
  }
  segmentsNode.replaceChildren(fragment);
  renderedSegmentCounts[key] = segmentCount;
}

function renderSegments(key) {
  const segmentsNode = segmentsNodes[key];
  if (!segmentsNode) return;
  const segmentCount = getSegmentCount();
  const activeCount = clamp(Math.ceil(remainingMs(key) / 1000), 0, segmentCount);
  shellNodes[key]?.classList.toggle("is-low", remainingMs(key) <= 10_000 && activeCount > 0);
  renderSegmentGeometry(key, segmentCount);
  Array.from(segmentsNode.children).forEach((segment, index) => {
    segment.classList.toggle("is-active", index < activeCount);
    segment.classList.toggle("is-inactive", index >= activeCount);
  });
}

function applyOverlayConfig() {
  if (!overlayConfig || !rootNode) return;
  const shellMaxSizePx = Math.max(160, Number(overlayConfig.maxWidthPx) || 520);
  const shellMinSizePx = Math.min(220, shellMaxSizePx);
  const shellSizePx = clamp(Math.round(overlayConfig.timerFontSizePx * 4.2), shellMinSizePx, shellMaxSizePx);
  rootNode.style.padding = `${overlayConfig.paddingPx}px`;
  PLAYER_KEYS.forEach((key) => {
    const shellNode = shellNodes[key];
    const timerNode = timerNodes[key];
    if (!shellNode || !timerNode) return;
    shellNode.style.setProperty("--timer-text-color", overlayConfig.timerColor);
    shellNode.style.setProperty("--timer-circle-color", overlayConfig.timerCircleColor);
    shellNode.style.setProperty("--timer-size", `${shellSizePx}px`);
    shellNode.style.setProperty("--timer-font-size", `clamp(2rem, 16vmin, ${overlayConfig.timerFontSizePx}px)`);
    shellNode.style.setProperty("--timer-x", `${overlayConfig[`${key}XPercent`]}%`);
    shellNode.style.setProperty("--timer-y", `${overlayConfig[`${key}YPercent`]}%`);
    timerNode.style.color = overlayConfig.timerColor;
    timerNode.style.fontWeight = String(overlayConfig.fontWeight);
  });
}

function render() {
  PLAYER_KEYS.forEach((key) => {
    if (timerNodes[key]) timerNodes[key].textContent = formatTimer(remainingMs(key), overlayConfig?.timerFormat);
    renderSegments(key);
  });
  applyOverlayConfig();
}

onValue(ref(db, "rooms/manche6/state"), (snap) => {
  state = snap.val() || {};
  render();
  window.clearInterval(ticker);
  ticker = window.setInterval(render, 100);
});

watchOverlayConfig("round6Timer", (config) => {
  overlayConfig = config;
  render();
});
