import { db, ref, onValue } from "./firebase.js";
import { activeTracks, watchBlindtestTracks } from "./blindtest/tracks.js";
import { computeTargetSeconds, defaultBlindtestLiveState, watchBlindtestLive } from "./blindtest/live-sync.js";
import { YoutubeAudioPlayer, parseYoutubeError } from "./blindtest/youtube.js";
import { watchOverlayConfig } from "./overlay-config.js";

const promptNode = document.getElementById("m4-overlay-prompt");
const errorNode = document.getElementById("m4-overlay-error");

const CATEGORY_PROMPTS = {
  opening: "Quel est cet opening ?",
  ending: "Quel est cet ending ?",
  ost: "Quel est cette OST ?",
  personnage: "Quel est ce personnage ?",
};

let tracks = [];
let viewerQuestions = {};
let viewerLiveState = null;
let liveState = defaultBlindtestLiveState();
let overlayConfig = null;
let lastAppliedSyncVersion = -1;
const localAudio = new Audio();
localAudio.preload = "auto";
let lastAudioSource = "";

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

function resolveCurrentTrack() {
  const enabled = activeTracks(tracks);
  if (!enabled.length) return { enabled, currentTrack: null };

  const byId = liveState.trackId ? enabled.find((track) => track.id === String(liveState.trackId)) : null;
  const fallbackIndex = Math.max(0, Math.min(enabled.length - 1, Number(liveState.trackIndex || 0)));
  const currentTrack = byId || enabled[fallbackIndex] || null;
  return { enabled, currentTrack };
}

function getPromptForTrack(track) {
  const category = String(track?.category || "opening").toLowerCase();
  return CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.opening;
}

function getAnswerForTrack(track) {
  const answer = String(track?.answer || "").trim();
  return answer || "Réponse indisponible";
}

function getActiveViewerQuestion() {
  if (!viewerLiveState?.active || viewerLiveState?.round !== "manche4" || !viewerLiveState?.questionId) return null;
  return viewerQuestions[viewerLiveState.questionId] || null;
}

function getOverlayText(currentTrack, hasEnabledTracks, viewerQuestion) {
  if (viewerQuestion) return viewerQuestion.prompt || viewerQuestion.text || viewerQuestion.questionText || CATEGORY_PROMPTS.opening;
  if (liveState.showAnswer && currentTrack) return getAnswerForTrack(currentTrack);
  return hasEnabledTracks ? getPromptForTrack(currentTrack) : CATEGORY_PROMPTS.opening;
}

function applyConfig() {
  if (!overlayConfig || !promptNode) return;
  promptNode.style.color = overlayConfig.textColor;
  promptNode.style.fontWeight = String(overlayConfig.fontWeight);
  promptNode.style.textAlign = overlayConfig.align;
  promptNode.style.lineHeight = String(overlayConfig.lineHeight);
  promptNode.style.maxWidth = `${overlayConfig.maxWidthPx}px`;
  promptNode.style.setProperty("--m4-min-font", `${overlayConfig.minFontSizePx}px`);
  promptNode.style.setProperty("--m4-max-font", `${overlayConfig.maxFontSizePx}px`);
  promptNode.classList.toggle("no-shadow", !overlayConfig.textShadow);
}

function render() {
  const { enabled, currentTrack } = resolveCurrentTrack();

  const viewerQuestion = getActiveViewerQuestion();
  promptNode.textContent = getOverlayText(currentTrack, enabled.length > 0, viewerQuestion);
  promptNode.classList.toggle("is-answer", Boolean(!viewerQuestion && liveState.showAnswer && currentTrack));

  if (errorNode && liveState.lastError) {
    errorNode.textContent = liveState.lastError;
    errorNode.classList.remove("hidden");
  } else if (errorNode) {
    errorNode.textContent = "";
    errorNode.classList.add("hidden");
  }

  applyConfig();
}

function syncLocalAudio(sourceUrl, shouldPlay) {
  player.stop();
  if (!sourceUrl) {
    localAudio.pause();
    localAudio.removeAttribute("src");
    lastAudioSource = "";
    return;
  }
  if (lastAudioSource !== sourceUrl) {
    lastAudioSource = sourceUrl;
    localAudio.src = sourceUrl;
    localAudio.currentTime = 0;
  }
  if (shouldPlay) localAudio.play().catch(() => {});
  else localAudio.pause();
}

async function syncAudio() {
  const viewerQuestion = getActiveViewerQuestion();
  if (viewerQuestion) {
    if (viewerQuestion.audioDataUrl) {
      syncLocalAudio(viewerQuestion.audioDataUrl, true);
      return;
    }
    syncLocalAudio("", false);
    const videoId = viewerQuestion.videoId || (viewerQuestion.youtubeUrl ? (viewerQuestion.youtubeUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/) || [])[1] : null);
    if (!videoId) {
      player.stop();
      return;
    }
    await player.loadVideo(videoId, 0, false);
    player.play();
    return;
  }

  syncLocalAudio("", false);
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

onValue(ref(db, "rooms/viewers/questions/manche4"), (snap) => {
  viewerQuestions = snap.val() || {};
  render();
  syncAudio().catch(() => {});
});

onValue(ref(db, "rooms/viewers/liveState"), (snap) => {
  viewerLiveState = snap.val() || null;
  render();
  syncAudio().catch(() => {});
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
