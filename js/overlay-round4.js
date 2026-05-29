import { activeTracks, watchBlindtestTracks } from "./blindtest/tracks.js";
import { computeTargetSeconds, defaultBlindtestLiveState, watchBlindtestLive } from "./blindtest/live-sync.js";
import { YoutubeAudioPlayer, parseYoutubeError } from "./blindtest/youtube.js";
import { watchOverlayConfig } from "./overlay-config.js";
import { autoFitText } from "./auto-fit-text.js";

const rootNode = document.querySelector(".overlay-round4");
const promptNode = document.getElementById("m4-overlay-prompt");
const errorNode = document.getElementById("m4-overlay-error");

const CATEGORY_PROMPTS = {
  opening: "Quel est cet opening ?",
  ending: "Quel est cet ending ?",
  ost: "Quel est cette OST ?",
  personnage: "Quel est ce personnage ?",
};

let tracks = [];
let liveState = defaultBlindtestLiveState();
let overlayConfig = null;
let lastAppliedSyncVersion = -1;
let resizeObserver = null;
let rafId = 0;

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

function getOverlayText(currentTrack, hasEnabledTracks) {
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
  promptNode.classList.toggle("no-shadow", !overlayConfig.textShadow);
}

function runAutoFit() {
  if (!rootNode || !promptNode) return;

  const config = overlayConfig || {};
  autoFitText({
    container: rootNode,
    textElement: promptNode,
    minFontSizePx: config.minFontSizePx ?? 36,
    maxFontSizePx: config.maxFontSizePx ?? 220,
    paddingPx: config.paddingPx ?? 40,
    lineHeight: config.lineHeight ?? 1.04,
    maxWidthPx: config.maxWidthPx ?? 1800,
  });
}

function scheduleAutoFit() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    runAutoFit();
  });
}

function render() {
  const { enabled, currentTrack } = resolveCurrentTrack();

  promptNode.textContent = getOverlayText(currentTrack, enabled.length > 0);
  promptNode.classList.toggle("is-answer", Boolean(liveState.showAnswer && currentTrack));

  if (errorNode && liveState.lastError) {
    errorNode.textContent = liveState.lastError;
    errorNode.classList.remove("hidden");
  } else if (errorNode) {
    errorNode.textContent = "";
    errorNode.classList.add("hidden");
  }

  applyConfig();
  scheduleAutoFit();
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

if (window.ResizeObserver && rootNode) {
  resizeObserver = new ResizeObserver(() => scheduleAutoFit());
  resizeObserver.observe(rootNode);
}
window.addEventListener("resize", scheduleAutoFit);
document.fonts?.ready?.then(() => scheduleAutoFit());

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
