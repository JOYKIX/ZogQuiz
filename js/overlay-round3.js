import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";
import { autoFitText } from "./auto-fit-text.js";

const rootNode = document.querySelector(".overlay-round3");
const themeNode = document.getElementById("m3-overlay-theme");

let themes = {};
let state = null;
let overlayConfig = null;
let rafId = 0;

function getDisplayTheme() {
  const theme = themes[state?.activeThemeId] || null;
  return theme?.name || "Aucun thème sélectionné.";
}

function applyOverlayConfig() {
  if (!overlayConfig || !rootNode || !themeNode) return;

  rootNode.style.padding = `${overlayConfig.questionPaddingPx}px`;
  rootNode.style.textAlign = overlayConfig.align;

  themeNode.style.color = overlayConfig.themeColor;
  themeNode.style.fontWeight = String(overlayConfig.fontWeight);
  themeNode.style.textAlign = overlayConfig.align;
}

function runAutoFit() {
  if (!overlayConfig || !rootNode || !themeNode) return;

  autoFitText({
    container: rootNode,
    textElement: themeNode,
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
  themeNode.textContent = getDisplayTheme();
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
