const root = document.querySelector(".round2-intro");
const replayButton = document.getElementById("replay-animation");
const voiceButton = document.getElementById("toggle-voice");

const roundText = [
  "Manche 2 : Image",
  "Une image est affichée.",
  "Réponse écrite.",
  "Œuvre plus lieu.",
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
