import { db, ref, onValue } from "./firebase.js";

const typeNode = document.getElementById("overlay-type");
const questionNode = document.getElementById("overlay-question");
const answerNode = document.getElementById("overlay-answer");

let state = null;
let participantsQuestions = {};
let viewersQuestions = {};

function render() {
  if (!state?.currentQuestionId) {
    typeNode.textContent = "EN ATTENTE";
    questionNode.textContent = "Aucune question sélectionnée.";
    answerNode.classList.add("hidden");
    return;
  }

  const source = state.currentType === "viewers" ? viewersQuestions : participantsQuestions;
  const question = source[state.currentQuestionId];

  typeNode.textContent = state.currentType === "viewers" ? "QUESTION VIEWERS" : "QUESTION PARTICIPANTS";
  questionNode.textContent = question?.text || "Question introuvable.";
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
