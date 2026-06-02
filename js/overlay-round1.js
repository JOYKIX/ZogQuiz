import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";

const rootNode = document.querySelector(".overlay-round1");
const textNode = document.getElementById("m1-text");

let state = null;
let participantsQuestions = {};
let viewersQuestions = {};
let overlayConfig = null;

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
  textNode.style.lineHeight = String(overlayConfig.lineHeight);
  textNode.style.maxWidth = `${overlayConfig.maxWidthPx}px`;
  textNode.style.setProperty("--m1-min-font", `${overlayConfig.minFontSizePx}px`);
  textNode.style.setProperty("--m1-max-font", `${overlayConfig.maxFontSizePx}px`);
}

function render() {
  textNode.textContent = getDisplayText();
  textNode.dataset.mode = state?.showAnswer ? "answer" : "question";
  applyOverlayConfig();
}

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
