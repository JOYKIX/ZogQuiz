import { db, ref, onValue } from "./firebase.js";

const imageNode = document.getElementById("m2-overlay-image");
const emptyNode = document.getElementById("m2-overlay-empty");

let questions = {};
let state = null;

function render() {
  const active = state?.activeQuestionId ? questions[state.activeQuestionId] : null;
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

onValue(ref(db, "rooms/manche2/state"), (snap) => {
  state = snap.val() || {};
  render();
});
