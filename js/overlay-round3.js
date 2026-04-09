import { db, ref, onValue } from "./firebase.js";

const playerNode = document.getElementById("m3-overlay-player");
const themeNode = document.getElementById("m3-overlay-theme");
const questionNode = document.getElementById("m3-overlay-question");
const timerNode = document.getElementById("m3-overlay-timer");

const DURATION = 90_000;
let sessions = {};
let themes = {};
let state = null;

function formatTimer(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function remainingMs() {
  if (!state) return DURATION;
  if (state.timerStatus === "running") return Math.max(0, Number(state.timerEndsAt || 0) - Date.now());
  return Math.max(0, Number(state.timerRemainingMs ?? DURATION));
}

function render() {
  const player = sessions[state?.activePlayerId]?.nickname || "—";
  const theme = themes[state?.activeThemeId] || null;
  const questions = Object.values(theme?.questions || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const current = questions[Number(state?.questionIndex || 0)] || null;

  playerNode.textContent = `Joueur : ${player}`;
  themeNode.textContent = `Thème : ${theme?.name || "—"}`;
  questionNode.textContent = current?.text || (theme ? "Fin des questions" : "En attente du thème.");
  timerNode.textContent = formatTimer(remainingMs());
}

onValue(ref(db, "rooms/manche3/state"), (snap) => {
  state = snap.val() || {};
  render();
});
onValue(ref(db, "rooms/manche3/themes"), (snap) => {
  themes = snap.val() || {};
  render();
});
onValue(ref(db, "rooms/manche1/guestSessions"), (snap) => {
  sessions = snap.val() || {};
  render();
});

setInterval(render, 250);
