import { activeTracks, watchBlindtestTracks } from "./blindtest/tracks.js";
import { computeTargetSeconds, defaultBlindtestLiveState, watchBlindtestLive } from "./blindtest/live-sync.js";
import { YoutubeAudioPlayer, parseYoutubeError } from "./blindtest/youtube.js";
import { watchOverlayConfig } from "./overlay-config.js";

const stateNode = document.getElementById("m4-overlay-state");
const trackNode = document.getElementById("m4-overlay-track");
const playbackNode = document.getElementById("m4-overlay-playback");
const timeNode = document.getElementById("m4-overlay-time");
const errorNode = document.getElementById("m4-overlay-error");
const progressNode = document.getElementById("m4-overlay-progress");
const answerNode = document.getElementById("m4-overlay-answer");

let tracks = [];
let liveState = defaultBlindtestLiveState();
let overlayConfig = null;
let lastAppliedSyncVersion = -1;
let progressIntervalId = 0;
let lastProgressSignature = "";

const player = new YoutubeAudioPlayer({
  hostId: "m4-overlay-youtube-host",
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
  document.querySelector(".overlay-round4").style.maxWidth = `${overlayConfig.maxWidthPx}px`;
  stateNode.style.fontSize = `${overlayConfig.secondaryFontSizePx}px`;
  stateNode.style.color = overlayConfig.secondaryColor;
  playbackNode.style.fontSize = `${overlayConfig.primaryFontSizePx}px`;
  trackNode.style.fontSize = `${overlayConfig.secondaryFontSizePx}px`;
  trackNode.style.color = overlayConfig.primaryColor;
  timeNode.style.fontSize = `${overlayConfig.secondaryFontSizePx}px`;
  timeNode.style.color = overlayConfig.secondaryColor;
  progressNode.style.height = `${overlayConfig.progressHeightPx}px`;
  document.querySelector(".m4-progress-shell").style.borderRadius = `${overlayConfig.cornerRadiusPx}px`;
  progressNode.style.borderRadius = `${overlayConfig.cornerRadiusPx}px`;
  document.querySelector(".m4-progress-shell").style.backgroundColor = `rgba(255,255,255,${overlayConfig.decorationOpacity})`;
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

  const prompts = {
    opening: "D'où provient cet opening ?",
    ending: "D'où provient cet ending ?",
    ost: "D'où provient cet OST ?",
    personnage: "Quel est ce personnage ?",
  };
  stateNode.textContent = prompts[currentTrack?.category || "opening"] || prompts.opening;
  trackNode.textContent = `Piste ${index >= 0 ? index + 1 : 0} / ${enabled.length}`;
  playbackNode.textContent = labels[liveState.playbackState] || "Arrêt";
  timeNode.textContent = formatTime(computeTargetSeconds(liveState));
  if (answerNode) answerNode.textContent = liveState.showAnswer ? `Réponse : ${currentTrack?.answer || "—"}` : "";

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

function updateProgressOnly() {
  if (!overlayConfig) return;
  const ratio = Math.min(1, computeTargetSeconds(liveState) / Math.max(1, overlayConfig.progressMaxSeconds));
  const width = `${Math.round(ratio * 100)}%`;
  const playbackState = liveState.playbackState || "stopped";
  const signature = `${width}|${playbackState}`;
  if (signature === lastProgressSignature) return;
  lastProgressSignature = signature;

  progressNode.style.width = width;
  if (playbackState === "playing") playbackNode.style.color = overlayConfig.playingColor;
  else if (playbackState === "paused") playbackNode.style.color = overlayConfig.pausedColor;
  else playbackNode.style.color = overlayConfig.stoppedColor;
  timeNode.textContent = formatTime(computeTargetSeconds(liveState));
}

function startProgressTicker() {
  if (progressIntervalId) return;
  progressIntervalId = window.setInterval(() => {
    if (!liveState.active || liveState.playbackState !== "playing") return;
    updateProgressOnly();
  }, 250);
}

async function syncAudio() {
  const { currentTrack } = resolveCurrentTrack();
  const sourceUrl = liveState.showAnswer && currentTrack?.revealYoutubeUrl ? currentTrack.revealYoutubeUrl : currentTrack?.youtubeUrl;
  const videoId = sourceUrl ? (sourceUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/) || [])[1] : null;
  if (!videoId || !liveState.active || liveState.playbackState === "stopped") {
    player.stop();
    return;
  }

  const target = computeTargetSeconds(liveState);
  await player.loadVideo(videoId, target, false);

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

watchOverlayConfig("round4", (config) => {
  overlayConfig = config;
  render();
});
startProgressTicker();
