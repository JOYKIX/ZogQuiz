import { db, ref, onValue } from "./firebase.js";
import { createBuzzSoundTrigger } from "./audio.js";

const questionNode = document.getElementById("m1-question");
const answerNode = document.getElementById("m1-answer");

let state = null;
let participantsQuestions = {};
let viewersQuestions = {};
let overlaySettings = { questionFontSizePx: 72, questionColor: "#ffffff" };

const triggerBuzzSound = createBuzzSoundTrigger();

function applyOverlayStyle() {
  questionNode.style.fontSize = `${overlaySettings.questionFontSizePx}px`;
  questionNode.style.color = overlaySettings.questionColor;
}

function render() {
  applyOverlayStyle();

  if (!state?.currentQuestionId) {
    questionNode.textContent = "Aucune question sélectionnée.";
    answerNode.classList.add("hidden");
    return;
  }

  const source = state.currentType === "viewers" ? viewersQuestions : participantsQuestions;
  const question = source[state.currentQuestionId];

  questionNode.textContent = question?.text || "Question introuvable.";
  answerNode.textContent = `Réponse : ${question?.answer || "—"}`;
  answerNode.classList.toggle("hidden", !state.showAnswer);
}

onValue(ref(db, "rooms/manche1/state"), (snap) => {
  state = snap.val() || null;
  triggerBuzzSound(state);
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

onValue(ref(db, "rooms/manche1/overlaySettings"), (snap) => {
  const settings = snap.val() || {};
  overlaySettings = {
    questionFontSizePx: Math.max(24, Math.min(180, Number(settings.questionFontSizePx || 72))),
    questionColor: typeof settings.questionColor === "string" && /^#[0-9a-fA-F]{6}$/.test(settings.questionColor)
      ? settings.questionColor
      : "#ffffff",
  };
  render();
});
