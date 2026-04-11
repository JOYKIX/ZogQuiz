import { db, ref, onValue } from "./firebase.js";

const root = document.getElementById("overlay-router-root");

const OVERLAY_BY_ROUND = {
  manche1: "overlay-round1.html",
  manche2: "overlay-round2.html",
  manche3: "overlay-round3.html",
};

let activeRound = null;
let activeOverlayUrl = null;

function clearOverlay() {
  root.replaceChildren();
  root.classList.add("is-empty");
}

function mountOverlay(url) {
  if (activeOverlayUrl === url) return;

  const frame = document.createElement("iframe");
  frame.className = "overlay-router-frame";
  frame.src = url;
  frame.title = "ZogQuiz live overlay";
  frame.setAttribute("allow", "autoplay");

  root.replaceChildren(frame);
  root.classList.remove("is-empty");
  activeOverlayUrl = url;
}

function renderLiveOverlay(round) {
  activeRound = round || null;
  const overlayUrl = activeRound ? OVERLAY_BY_ROUND[activeRound] : null;

  if (!overlayUrl) {
    activeOverlayUrl = null;
    clearOverlay();
    return;
  }

  mountOverlay(overlayUrl);
}

onValue(ref(db, "quiz/state"), (snapshot) => {
  const quizState = snapshot.val() || {};
  renderLiveOverlay(quizState.liveRound || null);
});
