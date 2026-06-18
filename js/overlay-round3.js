import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";

const rootNode = document.querySelector(".overlay-round3");
const themeNode = document.getElementById("m3-overlay-theme");
const questionAudio = document.getElementById("m3-question-audio");
const answerVideo = document.getElementById("m3-answer-video");

let themes = {};
let state = null;
let overlayConfig = null;
let currentAudioSrc = "";
let currentVideoSrc = "";

function getActiveTheme() {
  return themes[state?.activeThemeId] || null;
}

function getActiveQuestion() {
  const questions = Object.values(getActiveTheme()?.questions || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  return questions[Number(state?.questionIndex || 0)] || null;
}

function getDisplayTheme() {
  return getActiveTheme()?.name || "Aucun thème sélectionné.";
}

function mediaUrl(folder, fileName) {
  const cleanName = String(fileName || "").trim().split(/[\\/]/).pop();
  return cleanName ? `public/manche3/${folder}/${encodeURIComponent(cleanName)}` : "";
}

function syncQuestionAudio(question) {
  if (!questionAudio) return;
  const src = mediaUrl("questions", question?.questionFileName || question?.text);
  if (src === currentAudioSrc) return;
  currentAudioSrc = src;
  questionAudio.pause();
  questionAudio.removeAttribute("src");
  if (!src) return;
  questionAudio.src = src;
  questionAudio.load();
  questionAudio.play().catch(() => {});
}

function syncAnswerVideo(question) {
  if (!answerVideo) return;
  const src = mediaUrl("reponses", question?.answerFileName);
  if (src !== currentVideoSrc) {
    currentVideoSrc = src;
    answerVideo.pause();
    answerVideo.removeAttribute("src");
    if (src) {
      answerVideo.src = src;
      answerVideo.load();
    }
  }
  answerVideo.classList.toggle("hidden", !src || !state?.showAnswer);
  if (src && state?.showAnswer) answerVideo.play().catch(() => {});
  else answerVideo.pause();
}

function applyOverlayConfig() {
  if (!overlayConfig || !rootNode || !themeNode) return;

  rootNode.style.padding = `${overlayConfig.questionPaddingPx}px`;
  rootNode.style.textAlign = overlayConfig.align;

  themeNode.style.color = overlayConfig.themeColor;
  themeNode.style.fontWeight = String(overlayConfig.fontWeight);
  themeNode.style.textAlign = overlayConfig.align;
  themeNode.style.lineHeight = String(overlayConfig.questionLineHeight);
  themeNode.style.maxWidth = `${overlayConfig.maxWidthPx}px`;
  themeNode.style.setProperty("--m3-min-font", `${overlayConfig.questionMinFontSizePx}px`);
  themeNode.style.setProperty("--m3-max-font", `${overlayConfig.questionMaxFontSizePx}px`);
}

function render() {
  const question = getActiveQuestion();
  themeNode.textContent = getDisplayTheme();
  syncQuestionAudio(question);
  syncAnswerVideo(question);
  applyOverlayConfig();
}

onValue(ref(db, "rooms/manche3/state"), (snap) => {
  state = snap.val() || {};
  render();
});

onValue(ref(db, "rooms/manche3/themes"), (snap) => {
  themes = snap.val() || {};
  render();
});

watchOverlayConfig("round3", (config) => {
  overlayConfig = config;
  render();
});
