import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";
import { autoFitText } from "./auto-fit-text.js";

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
  textNode.style.textShadow = overlayConfig.textShadow ? "0 2px 12px rgba(0,0,0,0.45)" : "none";
}

function runAutoFit() {
  if (!overlayConfig || !rootNode || !textNode) return;

  autoFitText({
    container: rootNode,
    textElement: textNode,
    minFontSizePx: overlayConfig.minFontSizePx,
    maxFontSizePx: overlayConfig.maxFontSizePx,
    paddingPx: overlayConfig.safePaddingPx,
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
