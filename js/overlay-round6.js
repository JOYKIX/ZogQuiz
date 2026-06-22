import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";

const rootNode = document.querySelector(".overlay-round6");
const questionNode = document.getElementById("m6-question");
let state = null;
let overlayConfig = null;

function applyOverlayConfig() {
  if (!overlayConfig || !rootNode || !questionNode) return;
  rootNode.style.padding = `${overlayConfig.safePaddingPx}px`;
  rootNode.style.justifyContent = overlayConfig.verticalAlign === "top" ? "flex-start" : overlayConfig.verticalAlign === "bottom" ? "flex-end" : "center";
  questionNode.style.color = overlayConfig.textColor;
  questionNode.style.fontWeight = String(overlayConfig.fontWeight);
  questionNode.style.textAlign = overlayConfig.horizontalAlign;
  questionNode.style.textShadow = overlayConfig.textShadow ? "0 2px 12px rgba(0,0,0,0.45)" : "none";
  questionNode.style.lineHeight = String(overlayConfig.lineHeight);
  questionNode.style.maxWidth = `${overlayConfig.maxWidthPx}px`;
  questionNode.style.setProperty("--m6-font-size", `${overlayConfig.fontSizePx}px`);
}

function render() {
  questionNode.textContent = state?.currentQuestion || "Question en attente côté admin.";
  applyOverlayConfig();
}

onValue(ref(db, "rooms/manche6/state"), (snap) => {
  state = snap.val() || {};
  render();
});

watchOverlayConfig("round6", (config) => {
  overlayConfig = config;
  render();
});
