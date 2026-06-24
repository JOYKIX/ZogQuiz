import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";

const imageNode = document.getElementById("m2-overlay-image");
const emptyNode = document.getElementById("m2-overlay-empty");

let questions = {};
let viewerQuestions = {};
let state = null;
let viewerLiveState = null;
let overlayConfig = null;

function applyOverlayConfig() {
  if (!overlayConfig) return;
  imageNode.style.borderRadius = `${overlayConfig.borderRadiusPx}px`;
}

function getActiveQuestion() {
  if (viewerLiveState?.active && viewerLiveState?.round === "manche2" && viewerLiveState?.questionId) {
    return viewerQuestions[viewerLiveState.questionId] || null;
  }
  return state?.activeQuestionId ? questions[state.activeQuestionId] : null;
}

function render() {
  applyOverlayConfig();
  const active = getActiveQuestion();
  if (!active?.imageDataUrl) {
    imageNode.removeAttribute("src");
    imageNode.classList.add("hidden");
    emptyNode.classList.remove("hidden");
    return;
  }

  imageNode.src = active.imageDataUrl;
  imageNode.classList.remove("hidden");
  emptyNode.classList.add("hidden");
}

onValue(ref(db, "rooms/manche2/questions"), (snap) => {
  questions = snap.val() || {};
  render();
});

onValue(ref(db, "rooms/viewers/questions/manche2"), (snap) => {
  viewerQuestions = snap.val() || {};
  render();
});

onValue(ref(db, "rooms/viewers/liveState"), (snap) => {
  viewerLiveState = snap.val() || null;
  render();
});

onValue(ref(db, "rooms/manche2/state"), (snap) => {
  state = snap.val() || {};
  render();
});

watchOverlayConfig("round2", (config) => {
  overlayConfig = config;
  render();
});
