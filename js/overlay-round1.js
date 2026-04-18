import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";

const rootNode = document.querySelector(".overlay-round1");
const textNode = document.getElementById("m1-text");

let state = null;
let participantsQuestions = {};
let viewersQuestions = {};
let overlayConfig = null;
let resizeObserver = null;
let rafId = 0;

function getCurrentQuestion() {
  if (!state?.currentQuestionId) return null;
  const source = state.currentType === "viewers" ? viewersQuestions : participantsQuestions;
  return source[state.currentQuestionId] || null;
}

function getDisplayText() {
  const question = getCurrentQuestion();
  if (!question) return "Aucune question sélectionnée.";

  if (state?.showAnswer) {
    if (Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length) {
      return question.acceptedAnswers.join(" · ");
    }
    return question.answer || "Réponse indisponible.";
  }

  return question.text || "Question introuvable.";
}

function applyOverlayConfig() {
  if (!overlayConfig || !rootNode) return;

  rootNode.style.padding = `${overlayConfig.safePaddingPx}px`;
  rootNode.style.justifyContent = overlayConfig.verticalAlign === "top"
    ? "flex-start"
    : overlayConfig.verticalAlign === "bottom"
      ? "flex-end"
      : "center";

  textNode.style.color = overlayConfig.textColor;
  textNode.style.fontWeight = String(overlayConfig.fontWeight);
  textNode.style.textAlign = overlayConfig.horizontalAlign;
  textNode.style.maxWidth = `${overlayConfig.maxWidthPx}px`;
  textNode.style.textShadow = overlayConfig.textShadow ? "0 2px 12px rgba(0,0,0,0.45)" : "none";
}

function fitsAtSize(sizePx, maxWidth, maxHeight) {
  textNode.style.fontSize = `${sizePx}px`;
  return textNode.scrollWidth <= maxWidth && textNode.scrollHeight <= maxHeight;
}

function autoFitText() {
  if (!overlayConfig || !rootNode || !textNode) return;

  const maxWidth = Math.max(1, rootNode.clientWidth);
  const maxHeight = Math.max(1, rootNode.clientHeight);
  const minSize = Math.max(8, Number(overlayConfig.minFontSizePx || 20));
  const maxSize = Math.max(minSize, Number(overlayConfig.maxFontSizePx || 180));

  let low = minSize;
  let high = maxSize;
  let best = minSize;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fitsAtSize(mid, maxWidth, maxHeight)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  textNode.style.fontSize = `${best}px`;
}

function scheduleAutoFit() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    autoFitText();
  });
}

function render() {
  textNode.textContent = getDisplayText();
  textNode.dataset.mode = state?.showAnswer ? "answer" : "question";
  applyOverlayConfig();
  scheduleAutoFit();
}

if (window.ResizeObserver) {
  resizeObserver = new ResizeObserver(() => scheduleAutoFit());
  resizeObserver.observe(rootNode);
}
window.addEventListener("resize", scheduleAutoFit);

document.fonts?.ready?.then(() => scheduleAutoFit());

onValue(ref(db, "rooms/manche1/state"), (snap) => {
  state = snap.val() || null;
  render();
});

onValue(ref(db, "rooms/manche1/questions/participants"), (snap) => {
  participantsQuestions = snap.val() || {};
  render();
});

onValue(ref(db, "rooms/manche1/questions/viewers"), (snap) => {
  viewersQuestions = snap.val() || {};
  render();
});

watchOverlayConfig("round1", (config) => {
  overlayConfig = config;
  render();
});
