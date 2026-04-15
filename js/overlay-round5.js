import { activeTracks, watchBlindtestTracks } from "./blindtest/tracks.js";
import { computeTargetSeconds, defaultBlindtestLiveState, watchBlindtestLive } from "./blindtest/live-sync.js";
import { YoutubeAudioPlayer, parseYoutubeError } from "./blindtest/youtube.js";

const statusNode = document.getElementById("m5-overlay-status");
const trackNode = document.getElementById("m5-overlay-track");
const playbackNode = document.getElementById("m5-overlay-playback");
const timeNode = document.getElementById("m5-overlay-time");
const errorNode = document.getElementById("m5-overlay-error");

let tracks = [];
let liveState = defaultBlindtestLiveState();
let lastAppliedSyncVersion = -1;

const player = new YoutubeAudioPlayer({
  hostId: "m5-overlay-youtube-host",
  onError: (event) => {
    const message = parseYoutubeError(event?.data);
    if (errorNode) {
      errorNode.textContent = message;
      errorNode.classList.remove("hidden");
    }
  },
});

function formatTime(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds || 0)));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function resolveCurrentTrack() {
  const enabled = activeTracks(tracks);
  if (!enabled.length) return { enabled, currentTrack: null, index: -1 };

  const byId = liveState.trackId ? enabled.find((track) => track.id === String(liveState.trackId)) : null;
  const fallbackIndex = Math.max(0, Math.min(enabled.length - 1, Number(liveState.trackIndex || 0)));
  const currentTrack = byId || enabled[fallbackIndex] || null;
  const index = currentTrack ? enabled.findIndex((track) => track.id === currentTrack.id) : -1;
  return { enabled, currentTrack, index };
}

function render() {
  const { enabled, currentTrack, index } = resolveCurrentTrack();

  const labels = { playing: "Lecture", paused: "Pause", stopped: "Arrêt" };

  if (!enabled.length) {
    statusNode.textContent = "Aucune musique configurée pour la manche 5.";
    trackNode.textContent = "Piste 0 / 0";
    playbackNode.textContent = "État : Arrêt";
    timeNode.textContent = "00:00";
    return;
  }

  if (!liveState.active) {
    statusNode.textContent = "Manche 5 prête (en attente du lancement).";
  } else if (!currentTrack) {
    statusNode.textContent = "Piste introuvable, en attente de resynchronisation.";
  } else {
    statusNode.textContent = "Blindtest en direct";
  }

  trackNode.textContent = `Piste ${index >= 0 ? index + 1 : 0} / ${enabled.length}`;
  playbackNode.textContent = `État : ${labels[liveState.playbackState] || "Arrêt"}`;
  timeNode.textContent = formatTime(computeTargetSeconds(liveState));

  if (errorNode && liveState.lastError) {
    errorNode.textContent = liveState.lastError;
    errorNode.classList.remove("hidden");
  } else if (errorNode) {
    errorNode.textContent = "";
    errorNode.classList.add("hidden");
  }
}

async function syncAudio() {
  const { currentTrack } = resolveCurrentTrack();
  if (!currentTrack?.videoId || !liveState.active || liveState.playbackState === "stopped") {
    player.stop();
    return;
  }

  const target = computeTargetSeconds(liveState);
  await player.loadVideo(currentTrack.videoId, target, false);

  if (liveState.playbackState === "paused") {
    player.pause();
    player.seekTo(target);
    return;
  }

  player.play();
}

watchBlindtestTracks((nextTracks) => {
  tracks = nextTracks;
  render();
});

watchBlindtestLive(async (nextLiveState) => {
  liveState = nextLiveState;
  render();

  if (nextLiveState.syncVersion === lastAppliedSyncVersion) return;
  lastAppliedSyncVersion = nextLiveState.syncVersion;

  try {
    await syncAudio();
  } catch {
    if (errorNode) {
      errorNode.textContent = "Impossible de synchroniser le lecteur overlay.";
      errorNode.classList.remove("hidden");
    }
  }
});

setInterval(render, 250);
