import { db, ref, get, set, update, onValue } from "./firebase.js";
import { blindtestTracks, getBlindtestTrack } from "./blindtest-config.js";

const M5_STATE_PATH = "rooms/manche5/state";

function defaultManche5State(updatedBy = "system") {
  return {
    active: false,
    currentTrackIndex: 0,
    status: "stopped",
    positionMs: 0,
    startedAt: null,
    actionId: 0,
    totalTracks: blindtestTracks.length,
    updatedAt: Date.now(),
    updatedBy,
  };
}

function normalizeManche5State(raw) {
  const maxIndex = Math.max(0, blindtestTracks.length - 1);
  const parsedIndex = Number(raw?.currentTrackIndex);
  const safeIndex = Number.isFinite(parsedIndex) ? Math.min(maxIndex, Math.max(0, Math.floor(parsedIndex))) : 0;
  const status = ["playing", "paused", "stopped"].includes(raw?.status) ? raw.status : "stopped";
  const positionMs = Number.isFinite(Number(raw?.positionMs)) ? Math.max(0, Number(raw.positionMs)) : 0;
  const actionId = Number.isFinite(Number(raw?.actionId)) ? Number(raw.actionId) : 0;
  const startedAt = Number.isFinite(Number(raw?.startedAt)) ? Number(raw.startedAt) : null;

  return {
    ...defaultManche5State(raw?.updatedBy || "system"),
    ...raw,
    currentTrackIndex: safeIndex,
    status,
    positionMs,
    actionId,
    startedAt,
    totalTracks: blindtestTracks.length,
  };
}

function msToSeconds(ms) {
  return Math.max(0, Number(ms || 0) / 1000);
}

function clampAudioTime(audio, seconds) {
  if (!audio || !Number.isFinite(seconds)) return;
  const duration = Number.isFinite(audio.duration) ? audio.duration : null;
  if (duration === null) {
    audio.currentTime = Math.max(0, seconds);
    return;
  }
  audio.currentTime = Math.min(Math.max(0, seconds), Math.max(0, duration - 0.1));
}

function computeTargetTimeSeconds(state) {
  if (state.status !== "playing") return msToSeconds(state.positionMs);
  if (!state.startedAt) return msToSeconds(state.positionMs);
  return Math.max(0, (Date.now() - Number(state.startedAt || 0)) / 1000);
}

async function syncAudioToState(audio, state, { onAutoplayBlocked } = {}) {
  const track = getBlindtestTrack(state.currentTrackIndex);
  if (!track) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    return;
  }

  const expectedSrc = new URL(track.file, window.location.origin).href;
  if (audio.src !== expectedSrc) {
    audio.src = track.file;
    audio.load();
  }

  const targetTime = computeTargetTimeSeconds(state);
  const drift = Math.abs((audio.currentTime || 0) - targetTime);
  if (drift > 0.35 || state.status !== "playing") {
    clampAudioTime(audio, targetTime);
  }

  if (state.status === "playing") {
    try {
      await audio.play();
    } catch {
      onAutoplayBlocked?.();
    }
    return;
  }

  audio.pause();
  if (state.status === "stopped") {
    clampAudioTime(audio, 0);
  }
}

async function ensureManche5State(adminId = "system") {
  const stateRef = ref(db, M5_STATE_PATH);
  const snap = await get(stateRef);
  if (!snap.exists()) {
    await set(stateRef, defaultManche5State(adminId));
    return defaultManche5State(adminId);
  }
  const normalized = normalizeManche5State(snap.val() || {});
  await update(stateRef, {
    totalTracks: blindtestTracks.length,
    currentTrackIndex: normalized.currentTrackIndex,
    updatedAt: Date.now(),
    updatedBy: adminId,
  });
  return normalized;
}

export function initManche5Admin(options) {
  const { getCurrentAdminId, setMessage, showToast } = options;

  const els = {
    statusMessage: document.getElementById("m5-admin-message"),
    currentTrackLabel: document.getElementById("m5-current-track"),
    currentTrackFile: document.getElementById("m5-current-track-file"),
    playbackStatus: document.getElementById("m5-playback-status"),
    startBtn: document.getElementById("m5-start-round"),
    playBtn: document.getElementById("m5-play"),
    pauseBtn: document.getElementById("m5-pause"),
    replayBtn: document.getElementById("m5-replay"),
    nextBtn: document.getElementById("m5-next"),
    prevBtn: document.getElementById("m5-prev"),
  };

  if (!els.startBtn) return;

  const audio = new Audio();
  audio.preload = "auto";
  let currentState = defaultManche5State();
  let lastAppliedActionId = null;

  function render() {
    const total = blindtestTracks.length;
    const displayIndex = total ? currentState.currentTrackIndex + 1 : 0;
    const track = getBlindtestTrack(currentState.currentTrackIndex);
    els.currentTrackLabel.textContent = `Musique ${displayIndex} / ${total}`;
    els.currentTrackFile.textContent = track ? track.file.split("/").pop() : "Aucun fichier";

    const statusMap = { playing: "Lecture", paused: "Pause", stopped: "Arrêt" };
    els.playbackStatus.textContent = statusMap[currentState.status] || "Arrêt";

    const hasTracks = total > 0;
    els.playBtn.disabled = !hasTracks;
    els.pauseBtn.disabled = !hasTracks || currentState.status !== "playing";
    els.replayBtn.disabled = !hasTracks;
    els.nextBtn.disabled = !hasTracks || currentState.currentTrackIndex >= total - 1;
    els.prevBtn.disabled = !hasTracks || currentState.currentTrackIndex <= 0;
  }

  async function writeState(patchBuilder) {
    const adminId = getCurrentAdminId?.() || "admin";
    const prev = currentState;
    const baseAction = Number(prev.actionId || 0);
    const patch = patchBuilder(prev, baseAction + 1);
    if (!patch) return;
    await update(ref(db, M5_STATE_PATH), {
      ...patch,
      totalTracks: blindtestTracks.length,
      updatedAt: Date.now(),
      updatedBy: adminId,
    });
  }

  els.startBtn.addEventListener("click", async () => {
    const adminId = getCurrentAdminId?.() || "admin";
    await ensureManche5State(adminId);
    await Promise.all([
      update(ref(db, M5_STATE_PATH), {
        active: true,
        totalTracks: blindtestTracks.length,
        updatedAt: Date.now(),
        updatedBy: adminId,
      }),
      update(ref(db, "quiz/state"), {
        activeRound: "manche5",
        liveRound: "manche5",
        updatedAt: Date.now(),
        updatedBy: adminId,
      }),
    ]);
    showToast?.("Manche 5 lancée");
  });

  els.playBtn.addEventListener("click", async () => {
    await writeState((prev, nextActionId) => {
      if (!blindtestTracks.length) return null;
      const nextPositionMs = prev.status === "paused" ? Number(prev.positionMs || 0) : 0;
      return {
        active: true,
        status: "playing",
        positionMs: nextPositionMs,
        startedAt: Date.now() - nextPositionMs,
        actionId: nextActionId,
      };
    });
  });

  els.pauseBtn.addEventListener("click", async () => {
    await writeState((prev, nextActionId) => {
      if (prev.status !== "playing") return null;
      const currentPositionMs = Math.max(0, Math.floor(audio.currentTime * 1000));
      return {
        status: "paused",
        positionMs: currentPositionMs,
        startedAt: null,
        actionId: nextActionId,
      };
    });
  });

  els.replayBtn.addEventListener("click", async () => {
    await writeState((prev, nextActionId) => ({
      status: "playing",
      positionMs: 0,
      startedAt: Date.now(),
      actionId: nextActionId,
    }));
  });

  els.nextBtn.addEventListener("click", async () => {
    await writeState((prev, nextActionId) => {
      const nextIndex = Math.min(blindtestTracks.length - 1, prev.currentTrackIndex + 1);
      if (nextIndex === prev.currentTrackIndex) return null;
      const keepPlaying = prev.status === "playing";
      return {
        currentTrackIndex: nextIndex,
        status: keepPlaying ? "playing" : "paused",
        positionMs: 0,
        startedAt: keepPlaying ? Date.now() : null,
        actionId: nextActionId,
      };
    });
  });

  els.prevBtn.addEventListener("click", async () => {
    await writeState((prev, nextActionId) => {
      const nextIndex = Math.max(0, prev.currentTrackIndex - 1);
      if (nextIndex === prev.currentTrackIndex) return null;
      const keepPlaying = prev.status === "playing";
      return {
        currentTrackIndex: nextIndex,
        status: keepPlaying ? "playing" : "paused",
        positionMs: 0,
        startedAt: keepPlaying ? Date.now() : null,
        actionId: nextActionId,
      };
    });
  });

  audio.addEventListener("ended", async () => {
    if (!blindtestTracks.length) return;
    const adminId = getCurrentAdminId?.() || "admin";
    const nextIndex = Math.min(blindtestTracks.length - 1, currentState.currentTrackIndex + 1);
    const isLast = nextIndex === currentState.currentTrackIndex;
    await writeState((prev, nextActionId) => ({
      currentTrackIndex: nextIndex,
      status: isLast ? "stopped" : "playing",
      positionMs: 0,
      startedAt: isLast ? null : Date.now(),
      actionId: nextActionId,
      updatedBy: adminId,
    }));
  });

  onValue(ref(db, M5_STATE_PATH), async (snap) => {
    currentState = normalizeManche5State(snap.val() || defaultManche5State());
    render();
    if (lastAppliedActionId === currentState.actionId && currentState.status !== "playing") return;
    lastAppliedActionId = currentState.actionId;
    await syncAudioToState(audio, currentState, {
      onAutoplayBlocked: () => setMessage?.(els.statusMessage, "Lecture locale bloquée par le navigateur.", "error"),
    });
    setMessage?.(els.statusMessage, "Synchronisé.", "success");
  });

  render();
}

export function initManche5Guest() {
  const statusLabel = document.getElementById("m5-guest-status");
  const trackLabel = document.getElementById("m5-guest-track");
  const stateLabel = document.getElementById("m5-guest-playback");
  const audio = new Audio();
  audio.preload = "auto";

  let state = defaultManche5State();
  let lastActionId = null;

  function renderGuestStatus() {
    const total = blindtestTracks.length;
    const displayIndex = total ? state.currentTrackIndex + 1 : 0;
    if (trackLabel) trackLabel.textContent = `Piste : ${displayIndex} / ${total}`;
    const labels = { playing: "Lecture", paused: "Pause", stopped: "Attente" };
    if (stateLabel) stateLabel.textContent = `État : ${labels[state.status] || "Attente"}`;
    if (statusLabel) statusLabel.textContent = state.active ? "Blindtest en cours." : "En attente du lancement admin.";
  }

  onValue(ref(db, M5_STATE_PATH), async (snap) => {
    state = normalizeManche5State(snap.val() || defaultManche5State());
    renderGuestStatus();
    if (lastActionId === state.actionId && state.status !== "playing") return;
    lastActionId = state.actionId;
    await syncAudioToState(audio, state, {
      onAutoplayBlocked: () => {
        if (statusLabel) statusLabel.textContent = "Lecture audio bloquée. Touchez l’écran puis attendez la prochaine action admin.";
      },
    });
  });

  return {
    pauseLocalAudio() {
      audio.pause();
    },
  };
}

