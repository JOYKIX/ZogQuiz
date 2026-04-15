import { db, ref, update } from "./firebase.js";
import { activeTracks, upsertBlindtestTrack, watchBlindtestTracks } from "./blindtest/tracks.js";
import {
  defaultBlindtestLiveState,
  ensureBlindtestLiveSeed,
  computeTargetSeconds,
  watchBlindtestLive,
  writeBlindtestLive,
} from "./blindtest/live-sync.js";
import {
  YoutubeAudioPlayer,
  validateYoutubeUrl,
  parseYoutubeError,
} from "./blindtest/youtube.js";

function findTrackByLiveState(tracks, liveState) {
  if (!tracks.length) return null;
  if (liveState.trackId) return tracks.find((track) => track.id === String(liveState.trackId)) || null;
  return tracks[Math.min(tracks.length - 1, Math.max(0, Number(liveState.trackIndex || 0)))] || null;
}

function statusLabel(playbackState) {
  if (playbackState === "playing") return "Lecture";
  if (playbackState === "paused") return "Pause";
  return "Arrêt";
}

function buildLiveStatePatchForTrack(track, trackIndex, keepPlaying = false) {
  return {
    trackId: track?.id || null,
    trackIndex: Math.max(0, Number(trackIndex || 0)),
    playbackState: keepPlaying ? "playing" : "paused",
    pausedAtSeconds: 0,
    startedAt: keepPlaying ? Date.now() : null,
    active: true,
    lastError: "",
  };
}

async function syncYoutubePlayerToState(player, track, liveState, opts = {}) {
  const { allowPlay = true, onAutoplayBlocked } = opts;

  if (!track?.videoId) {
    player.stop();
    return;
  }

  const targetSeconds = computeTargetSeconds(liveState);
  const shouldPlay = liveState.playbackState === "playing";
  await player.loadVideo(track.videoId, targetSeconds, false);
  if (shouldPlay && allowPlay) {
    try {
      player.play();
    } catch {
      onAutoplayBlocked?.();
    }
    return;
  }

  if (liveState.playbackState === "paused") {
    player.pause();
    player.seekTo(targetSeconds);
    return;
  }

  player.stop();
}

export function initManche5Admin(options) {
  const { getCurrentAdminId, setMessage, showToast } = options;

  const els = {
    statusMessage: document.getElementById("m5-admin-message"),
    currentTrackLabel: document.getElementById("m5-current-track"),
    currentTrackTitle: document.getElementById("m5-current-track-title"),
    currentTrackYoutube: document.getElementById("m5-current-track-youtube"),
    playbackStatus: document.getElementById("m5-playback-status"),
    startBtn: document.getElementById("m5-start-round"),
    playBtn: document.getElementById("m5-play"),
    pauseBtn: document.getElementById("m5-pause"),
    resumeBtn: document.getElementById("m5-resume"),
    replayBtn: document.getElementById("m5-replay"),
    nextBtn: document.getElementById("m5-next"),
    prevBtn: document.getElementById("m5-prev"),
    trackList: document.getElementById("m5-track-list"),
    trackForm: document.getElementById("m5-track-form"),
    titleInput: document.getElementById("m5-track-title-input"),
    urlInput: document.getElementById("m5-track-url-input"),
    answerInput: document.getElementById("m5-track-answer-input"),
    aliasesInput: document.getElementById("m5-track-aliases-input"),
    activeInput: document.getElementById("m5-track-active-input"),
  };

  if (!els.startBtn) return;

  const player = new YoutubeAudioPlayer({
    hostId: "m5-admin-youtube-host",
    onError: (event) => setMessage?.(els.statusMessage, parseYoutubeError(event?.data), "error"),
  });

  let tracks = [];
  let liveState = defaultBlindtestLiveState();
  let lastAppliedSyncVersion = -1;

  function renderTrackList() {
    if (!els.trackList) return;
    const list = tracks;
    els.trackList.innerHTML = "";

    if (!list.length) {
      els.trackList.innerHTML = "<li class='empty-state'>Aucune piste en base.</li>";
      return;
    }

    list.forEach((track, index) => {
      const li = document.createElement("li");
      li.className = "leader-item";
      const validationLabel = track.isValid ? "Valide" : `Erreur: ${track.validationError}`;
      li.innerHTML = `<span class="leader-name">#${index + 1} · ${track.title || "Sans titre"}</span><span class="leader-score">${validationLabel}</span>`;
      li.addEventListener("click", async () => {
        const adminId = getCurrentAdminId?.() || "admin";
        const keepPlaying = liveState.playbackState === "playing";
        await writeBlindtestLive(
          () => buildLiveStatePatchForTrack(track, index, keepPlaying),
          liveState,
          adminId
        );
        showToast?.(`Piste sélectionnée : ${track.title}`);
      });
      els.trackList.appendChild(li);
    });
  }

  function renderAdminState() {
    const enabledTracks = activeTracks(tracks);
    const currentTrack = findTrackByLiveState(enabledTracks, liveState);
    const currentIndex = currentTrack ? enabledTracks.findIndex((track) => track.id === currentTrack.id) : -1;

    els.currentTrackLabel.textContent = currentTrack
      ? `Piste ${currentIndex + 1} / ${enabledTracks.length}`
      : "Aucune piste active";
    els.currentTrackTitle.textContent = currentTrack?.title || "—";
    els.currentTrackYoutube.textContent = currentTrack?.youtubeUrl || "—";
    els.playbackStatus.textContent = statusLabel(liveState.playbackState);

    const hasTracks = enabledTracks.length > 0;
    els.playBtn.disabled = !hasTracks;
    els.pauseBtn.disabled = !hasTracks || liveState.playbackState !== "playing";
    els.resumeBtn.disabled = !hasTracks || liveState.playbackState !== "paused";
    els.replayBtn.disabled = !hasTracks;
    els.nextBtn.disabled = !hasTracks || currentIndex < 0 || currentIndex >= enabledTracks.length - 1;
    els.prevBtn.disabled = !hasTracks || currentIndex <= 0;
  }

  els.trackForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = els.titleInput?.value || "";
    const youtubeUrl = els.urlInput?.value || "";
    const answer = els.answerInput?.value || "";
    const aliases = els.aliasesInput?.value || "";
    const active = Boolean(els.activeInput?.checked);

    const validation = validateYoutubeUrl(youtubeUrl);
    if (!validation.valid) {
      setMessage?.(els.statusMessage, validation.reason, "error");
      return;
    }

    try {
      await upsertBlindtestTrack(null, { title, youtubeUrl, answer, aliases, active, order: tracks.length + 1 }, getCurrentAdminId?.() || "admin");
      els.trackForm.reset();
      if (els.activeInput) els.activeInput.checked = true;
      setMessage?.(els.statusMessage, "Piste ajoutée.", "success");
    } catch (error) {
      setMessage?.(els.statusMessage, error.message || "Impossible d’ajouter la piste.", "error");
    }
  });

  els.startBtn.addEventListener("click", async () => {
    const adminId = getCurrentAdminId?.() || "admin";
    await ensureBlindtestLiveSeed(adminId);
    const enabledTracks = activeTracks(tracks);
    const firstTrack = enabledTracks[0] || null;

    await Promise.all([
      update(ref(db, "quiz/state"), {
        activeRound: "manche5",
        liveRound: "manche5",
        updatedAt: Date.now(),
        updatedBy: adminId,
      }),
      update(ref(db, "blindtestLive"), {
        active: true,
        trackId: firstTrack?.id || null,
        trackIndex: 0,
        playbackState: "paused",
        pausedAtSeconds: 0,
        startedAt: null,
        updatedAt: Date.now(),
        updatedBy: adminId,
        lastError: "",
      }),
    ]);

    showToast?.("Manche 5 activée");
  });

  els.playBtn.addEventListener("click", async () => {
    const adminId = getCurrentAdminId?.() || "admin";
    await writeBlindtestLive(
      (state) => ({
        active: true,
        playbackState: "playing",
        startedAt: Date.now() - Math.floor(Number(state.pausedAtSeconds || 0) * 1000),
      }),
      liveState,
      adminId
    );
  });

  els.pauseBtn.addEventListener("click", async () => {
    const adminId = getCurrentAdminId?.() || "admin";
    await writeBlindtestLive(
      () => ({
        playbackState: "paused",
        pausedAtSeconds: player.getCurrentTime(),
        startedAt: null,
      }),
      liveState,
      adminId
    );
  });

  els.resumeBtn.addEventListener("click", async () => {
    const adminId = getCurrentAdminId?.() || "admin";
    await writeBlindtestLive(
      (state) => ({
        playbackState: "playing",
        startedAt: Date.now() - Math.floor(Number(state.pausedAtSeconds || 0) * 1000),
      }),
      liveState,
      adminId
    );
  });

  els.replayBtn.addEventListener("click", async () => {
    const adminId = getCurrentAdminId?.() || "admin";
    await writeBlindtestLive(
      () => ({ playbackState: "playing", pausedAtSeconds: 0, startedAt: Date.now() }),
      liveState,
      adminId
    );
  });

  els.nextBtn.addEventListener("click", async () => {
    const enabledTracks = activeTracks(tracks);
    const currentTrack = findTrackByLiveState(enabledTracks, liveState);
    const index = currentTrack ? enabledTracks.findIndex((t) => t.id === currentTrack.id) : 0;
    const next = enabledTracks[Math.min(enabledTracks.length - 1, index + 1)] || null;
    if (!next || next.id === currentTrack?.id) return;
    await writeBlindtestLive(() => buildLiveStatePatchForTrack(next, index + 1, liveState.playbackState === "playing"), liveState, getCurrentAdminId?.() || "admin");
  });

  els.prevBtn.addEventListener("click", async () => {
    const enabledTracks = activeTracks(tracks);
    const currentTrack = findTrackByLiveState(enabledTracks, liveState);
    const index = currentTrack ? enabledTracks.findIndex((t) => t.id === currentTrack.id) : 0;
    const previous = enabledTracks[Math.max(0, index - 1)] || null;
    if (!previous || previous.id === currentTrack?.id) return;
    await writeBlindtestLive(() => buildLiveStatePatchForTrack(previous, Math.max(0, index - 1), liveState.playbackState === "playing"), liveState, getCurrentAdminId?.() || "admin");
  });

  watchBlindtestTracks((nextTracks) => {
    tracks = nextTracks;
    renderTrackList();
    renderAdminState();
  });

  watchBlindtestLive(async (nextLiveState) => {
    liveState = nextLiveState;
    renderAdminState();

    if (nextLiveState.syncVersion === lastAppliedSyncVersion) return;
    lastAppliedSyncVersion = nextLiveState.syncVersion;

    const track = findTrackByLiveState(activeTracks(tracks), nextLiveState);
    await syncYoutubePlayerToState(player, track, nextLiveState);
    setMessage?.(els.statusMessage, "Synchronisation admin OK.", "success");
  });
}

export function initManche5Guest() {
  const statusLabelNode = document.getElementById("m5-guest-status");
  const trackLabelNode = document.getElementById("m5-guest-track");
  const playbackLabelNode = document.getElementById("m5-guest-playback");
  const audioUnlockBtn = document.getElementById("m5-audio-unlock");
  const audioHint = document.getElementById("m5-audio-hint");

  const player = new YoutubeAudioPlayer({
    hostId: "m5-guest-youtube-host",
    onError: (event) => {
      statusLabelNode.textContent = `Erreur lecteur : ${parseYoutubeError(event?.data)}`;
      statusLabelNode.classList.add("error");
    },
  });

  let tracks = [];
  let liveState = defaultBlindtestLiveState();
  let audioUnlocked = false;
  let lastAppliedSyncVersion = -1;

  function setGuestHint(text, type = "default") {
    if (!audioHint) return;
    audioHint.textContent = text;
    audioHint.classList.remove("success", "error");
    if (type !== "default") audioHint.classList.add(type);
  }

  function renderGuestState() {
    const enabledTracks = activeTracks(tracks);
    const currentTrack = findTrackByLiveState(enabledTracks, liveState);
    const index = currentTrack ? enabledTracks.findIndex((track) => track.id === currentTrack.id) : -1;

    trackLabelNode.textContent = currentTrack ? `Piste : ${index + 1} / ${enabledTracks.length}` : "Piste : —";
    playbackLabelNode.textContent = `État : ${statusLabel(liveState.playbackState)}`;

    if (!liveState.active) {
      statusLabelNode.textContent = "En attente du lancement admin.";
    } else if (!audioUnlocked) {
      statusLabelNode.textContent = "Blindtest actif. Cliquez sur “Activer l’audio”.";
    } else {
      statusLabelNode.textContent = "Blindtest en cours.";
    }

    if (audioUnlockBtn) audioUnlockBtn.disabled = audioUnlocked;
  }

  audioUnlockBtn?.addEventListener("click", async () => {
    try {
      await player.ensureReady();
      await player.loadVideo("dQw4w9WgXcQ", 0, false);
      player.pause();
      audioUnlocked = true;
      setGuestHint("Audio activé. Vous recevrez la piste live automatiquement.", "success");
      renderGuestState();
      if (liveState.active) {
        const track = findTrackByLiveState(activeTracks(tracks), liveState);
        await syncYoutubePlayerToState(player, track, liveState, {
          allowPlay: true,
          onAutoplayBlocked: () => setGuestHint("Lecture bloquée. Recliquez sur Activer l’audio.", "error"),
        });
      }
    } catch {
      setGuestHint("Impossible d’activer l’audio. Vérifiez votre navigateur.", "error");
    }
  });

  watchBlindtestTracks((nextTracks) => {
    tracks = nextTracks;
    renderGuestState();
  });

  watchBlindtestLive(async (nextLiveState) => {
    liveState = nextLiveState;
    renderGuestState();

    if (nextLiveState.syncVersion === lastAppliedSyncVersion) return;
    lastAppliedSyncVersion = nextLiveState.syncVersion;

    if (!audioUnlocked) {
      setGuestHint("En attente d’activation audio par l’utilisateur.");
      return;
    }

    const track = findTrackByLiveState(activeTracks(tracks), nextLiveState);
    await syncYoutubePlayerToState(player, track, nextLiveState, {
      allowPlay: true,
      onAutoplayBlocked: () => setGuestHint("Lecture bloquée. Recliquez sur Activer l’audio.", "error"),
    });
  });

  return {
    pauseLocalAudio() {
      player.pause();
    },
  };
}
