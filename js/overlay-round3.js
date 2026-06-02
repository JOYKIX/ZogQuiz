import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";

const rootNode = document.querySelector(".overlay-round3");
const themeNode = document.getElementById("m3-overlay-theme");

let themes = {};
let state = null;
let overlayConfig = null;

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
  themeNode.style.lineHeight = String(overlayConfig.questionLineHeight);
  themeNode.style.maxWidth = `${overlayConfig.maxWidthPx}px`;
  themeNode.style.setProperty("--m3-min-font", `${overlayConfig.questionMinFontSizePx}px`);
  themeNode.style.setProperty("--m3-max-font", `${overlayConfig.questionMaxFontSizePx}px`);
}

function render() {
  themeNode.textContent = getDisplayTheme();
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

