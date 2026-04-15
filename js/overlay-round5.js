import { db, ref, onValue } from "./firebase.js";

const statusNode = document.getElementById("m5-overlay-status");
const trackNode = document.getElementById("m5-overlay-track");
const playbackNode = document.getElementById("m5-overlay-playback");
const timeNode = document.getElementById("m5-overlay-time");

let state = {
  active: false,
  currentTrackIndex: 0,
  totalTracks: 1,
  status: "stopped",
  positionMs: 0,
  startedAt: null,
};

function formatTime(ms) {
  const sec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function playbackPositionMs() {
  if (state.status !== "playing") return Number(state.positionMs || 0);
  if (!state.startedAt) return Number(state.positionMs || 0);
  return Math.max(0, Date.now() - Number(state.startedAt));
}

function render() {
  const total = Math.max(1, Number(state.totalTracks || 1));
  const index = Math.min(total, Math.max(1, Number(state.currentTrackIndex || 0) + 1));
  const labels = { playing: "Lecture", paused: "Pause", stopped: "Arrêt" };

  statusNode.textContent = state.active ? "Blindtest en cours" : "En attente du lancement";
  trackNode.textContent = `Piste ${index} / ${total}`;
  playbackNode.textContent = `État : ${labels[state.status] || "Arrêt"}`;
  timeNode.textContent = formatTime(playbackPositionMs());
}

onValue(ref(db, "rooms/manche5/state"), (snap) => {
  state = { ...state, ...(snap.val() || {}) };
  render();
});

setInterval(render, 250);
