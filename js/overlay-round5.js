import { activeTracks, watchBlindtestTracks } from "./blindtest/tracks.js";
import { computeTargetSeconds, defaultBlindtestLiveState, watchBlindtestLive } from "./blindtest/live-sync.js";
import { YoutubeAudioPlayer, parseYoutubeError } from "./blindtest/youtube.js";
import { watchOverlayConfig } from "./overlay-config.js";

const stateNode = document.getElementById("m5-overlay-state");
const trackNode = document.getElementById("m5-overlay-track");
const playbackNode = document.getElementById("m5-overlay-playback");
const timeNode = document.getElementById("m5-overlay-time");
const errorNode = document.getElementById("m5-overlay-error");
const progressNode = document.getElementById("m5-overlay-progress");

let tracks = [];
let liveState = defaultBlindtestLiveState();
let overlayConfig = null;
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

function applyConfig() {
  if (!overlayConfig) return;
  document.querySelector(".overlay-round5").style.maxWidth = `${overlayConfig.maxWidthPx}px`;
  stateNode.style.fontSize = `${overlayConfig.secondaryFontSizePx}px`;
  stateNode.style.color = overlayConfig.secondaryColor;
  playbackNode.style.fontSize = `${overlayConfig.primaryFontSizePx}px`;
  trackNode.style.fontSize = `${overlayConfig.secondaryFontSizePx}px`;
  trackNode.style.color = overlayConfig.primaryColor;
  timeNode.style.fontSize = `${overlayConfig.secondaryFontSizePx}px`;
  timeNode.style.color = overlayConfig.secondaryColor;
  progressNode.style.height = `${overlayConfig.progressHeightPx}px`;
  document.querySelector(".m5-progress-shell").style.borderRadius = `${overlayConfig.cornerRadiusPx}px`;
  progressNode.style.borderRadius = `${overlayConfig.cornerRadiusPx}px`;
  document.querySelector(".m5-progress-shell").style.backgroundColor = `rgba(255,255,255,${overlayConfig.decorationOpacity})`;
}

function render() {
  const { enabled, currentTrack, index } = resolveCurrentTrack();

  if (!enabled.length) {
    stateNode.textContent = "Blindtest non configuré";
    trackNode.textContent = "Piste 0 / 0";
    playbackNode.textContent = "Arrêt";
    timeNode.textContent = "00:00";
    progressNode.style.width = "0%";
    applyConfig();
    return;
  }

  const labels = { playing: "Lecture", paused: "Pause", stopped: "Arrêt" };

  stateNode.textContent = liveState.active ? "Blindtest en direct" : "Blindtest prêt";
  trackNode.textContent = `Piste ${index >= 0 ? index + 1 : 0} / ${enabled.length}`;
  playbackNode.textContent = labels[liveState.playbackState] || "Arrêt";
  timeNode.textContent = formatTime(computeTargetSeconds(liveState));

  if (overlayConfig) {
    if (liveState.playbackState === "playing") playbackNode.style.color = overlayConfig.playingColor;
    else if (liveState.playbackState === "paused") playbackNode.style.color = overlayConfig.pausedColor;
    else playbackNode.style.color = overlayConfig.stoppedColor;

    const ratio = Math.min(1, computeTargetSeconds(liveState) / Math.max(1, overlayConfig.progressMaxSeconds));
    progressNode.style.width = `${Math.round(ratio * 100)}%`;
  }

  if (errorNode && liveState.lastError) {
    errorNode.textContent = liveState.lastError;
    errorNode.classList.remove("hidden");
  } else if (errorNode) {
    errorNode.textContent = "";
    errorNode.classList.add("hidden");
  }

  applyConfig();
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

watchOverlayConfig("round5", (config) => {
  overlayConfig = config;
  render();
});

setInterval(render, 250);
