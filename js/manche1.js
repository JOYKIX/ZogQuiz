import { db, ref, onValue } from "./firebase.js";

const questionNode = document.getElementById("m1-question");
const answerNode = document.getElementById("m1-answer");

let state = null;
let participantsQuestions = {};
let viewersQuestions = {};
let overlaySettings = { questionFontSizePx: 72 };

function render() {
  if (!state?.currentQuestionId) {
    questionNode.textContent = "Aucune question sélectionnée.";
    answerNode.classList.add("hidden");
    return;
  }

  const source = state.currentType === "viewers" ? viewersQuestions : participantsQuestions;
  const question = source[state.currentQuestionId];

  questionNode.textContent = question?.text || "Question introuvable.";
  questionNode.style.fontSize = `${overlaySettings.questionFontSizePx}px`;
  answerNode.textContent = `Réponse : ${question?.answer || "—"}`;
  answerNode.classList.toggle("hidden", !state.showAnswer);
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

onValue(ref(db, "rooms/manche1/overlaySettings"), (snap) => {
  const settings = snap.val() || {};
  overlaySettings = {
    questionFontSizePx: Math.max(24, Math.min(180, Number(settings.questionFontSizePx || 72))),
  };
  render();
});
