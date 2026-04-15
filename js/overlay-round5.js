import { db, ref, onValue } from "./firebase.js";
import { activeTracks, normalizeTrack } from "./blindtest/tracks.js";
import { computeTargetSeconds } from "./blindtest/live-sync.js";

const statusNode = document.getElementById("m5-overlay-status");
const trackNode = document.getElementById("m5-overlay-track");
const playbackNode = document.getElementById("m5-overlay-playback");
const timeNode = document.getElementById("m5-overlay-time");

let tracks = [];
let liveState = {
  active: false,
  trackId: null,
  trackIndex: 0,
  playbackState: "stopped",
  pausedAtSeconds: 0,
  startedAt: null,
};

function formatTime(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds || 0)));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function render() {
  const enabled = activeTracks(tracks);
  const currentTrack = liveState.trackId ? enabled.find((track) => track.id === String(liveState.trackId)) : enabled[liveState.trackIndex] || null;
  const index = currentTrack ? enabled.findIndex((track) => track.id === currentTrack.id) + 1 : 0;

  const labels = { playing: "Lecture", paused: "Pause", stopped: "Arrêt" };

  statusNode.textContent = liveState.active ? "Blindtest en cours" : "En attente du lancement";
  trackNode.textContent = `Piste ${index || 0} / ${enabled.length || 0}`;
  playbackNode.textContent = `État : ${labels[liveState.playbackState] || "Arrêt"}`;
  timeNode.textContent = formatTime(computeTargetSeconds(liveState));
}

onValue(ref(db, "blindtest/tracks"), (snap) => {
  const raw = snap.val() || {};
  tracks = Object.entries(raw).map(([id, data]) => normalizeTrack(id, data));
  render();
});

onValue(ref(db, "blindtestLive"), (snap) => {
  liveState = { ...liveState, ...(snap.val() || {}) };
  render();
});

setInterval(render, 250);
