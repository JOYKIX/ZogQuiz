const root = document.querySelector(".round-intro");
const replayButton = document.getElementById("replay-animation");
const voiceButton = document.getElementById("toggle-voice");

const roundText = [
  "Manche 1 : Le Sprint de Takumi",
  "La première manche du ZogQuiz commence avec le Sprint de Takumi !",
  "Les participants devront faire preuve de rapidité pour être les premiers à répondre aux questions. Attention : en cas de mauvaise réponse, ils ne pourront plus répondre à cette question.",
  "Chaque bonne réponse rapporte 1 point.",
  "Tout le monde sur la ligne de départ... La course commence !",
].join("\n\n");

let utterance = null;

function replayAnimation() {
  root.classList.add("is-replaying");
  void root.offsetWidth;
  root.classList.remove("is-replaying");
}

function stopVoice() {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  voiceButton.setAttribute("aria-pressed", "false");
}

function speakRoundText() {
  if (!window.speechSynthesis) return;
  stopVoice();
  utterance = new SpeechSynthesisUtterance(roundText);
  utterance.lang = "fr-FR";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.onend = () => voiceButton.setAttribute("aria-pressed", "false");
  utterance.onerror = () => voiceButton.setAttribute("aria-pressed", "false");
  voiceButton.setAttribute("aria-pressed", "true");
  window.speechSynthesis.speak(utterance);
}

replayButton?.addEventListener("click", replayAnimation);
voiceButton?.addEventListener("click", () => {
  if (voiceButton.getAttribute("aria-pressed") === "true") {
    stopVoice();
    return;
  }
  speakRoundText();
});

window.addEventListener("beforeunload", stopVoice);
