import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";

const questionNode = document.getElementById("m1-question");

let state = null;
let participantsQuestions = {};
let viewersQuestions = {};
let overlayConfig = null;

function applyOverlayConfig() {
  if (!overlayConfig) return;
  questionNode.style.fontSize = `${overlayConfig.questionFontSizePx}px`;
  questionNode.style.color = overlayConfig.questionColor;
  questionNode.style.fontWeight = String(overlayConfig.questionFontWeight);
  questionNode.style.textAlign = overlayConfig.questionAlign;
  questionNode.style.maxWidth = `${overlayConfig.maxWidthPx}px`;
}

function render() {
  applyOverlayConfig();
  if (!state?.currentQuestionId) {
    questionNode.textContent = "Aucune question sélectionnée.";
    return;
  }

  const source = state.currentType === "viewers" ? viewersQuestions : participantsQuestions;
  const question = source[state.currentQuestionId];
  questionNode.textContent = question?.text || "Question introuvable.";
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
