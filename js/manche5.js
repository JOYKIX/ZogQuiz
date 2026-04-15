import { db, ref, update } from "./firebase.js";
import {
  activeTracks,
  watchBlindtestTracks,
  createBlindtestTrack,
  updateBlindtestTrack,
  removeBlindtestTrack,
} from "./blindtest/tracks.js";
import {
  defaultBlindtestLiveState,
  ensureBlindtestLiveSeed,
  computeTargetSeconds,
  watchBlindtestLive,
  writeBlindtestLive,
} from "./blindtest/live-sync.js";
import { YoutubeAudioPlayer, validateYoutubeUrl, parseYoutubeError } from "./blindtest/youtube.js";

function statusLabel(playbackState) {
  if (playbackState === "playing") return "Lecture";
  if (playbackState === "paused") return "Pause";
  return "Arrêt";
}

function formatValidationError(track) {
  if (track.isValid) return "Valide";
  return `Invalide · ${track.validationError}`;
}

function parseAliasesInput(raw) {
  return String(raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function findTrackByIdOrIndex(list, liveState) {
  if (!list.length) return null;
  if (liveState.trackId) return list.find((track) => track.id === String(liveState.trackId)) || null;
  const safeIndex = Math.max(0, Math.min(list.length - 1, Number(liveState.trackIndex || 0)));
  return list[safeIndex] || null;
}

function sanitizeLiveStateForTracks(tracks, currentState) {
  const enabled = activeTracks(tracks);
  if (!enabled.length) {
    return {
      active: false,
      trackId: null,
      trackIndex: 0,
      playbackState: "stopped",
      startedAt: null,
      pausedAtSeconds: 0,
      lastError: "Aucune piste active disponible.",
    };
  }

  const currentTrack = findTrackByIdOrIndex(enabled, currentState);
  if (currentTrack) {
    const currentIndex = enabled.findIndex((track) => track.id === currentTrack.id);
    return {
      trackId: currentTrack.id,
      trackIndex: Math.max(0, currentIndex),
      lastError: "",
    };
  }

  return {
    trackId: enabled[0].id,
    trackIndex: 0,
    playbackState: "paused",
    startedAt: null,
    pausedAtSeconds: 0,
    lastError: "Piste courante introuvable. Sélection automatique de la première piste active.",
  };
}

function createTrackFormPayload(els) {
  const title = String(els.titleInput?.value || "").trim();
  const youtubeUrl = String(els.urlInput?.value || "").trim();
  const answer = String(els.answerInput?.value || "").trim();
  const aliases = parseAliasesInput(els.aliasesInput?.value || "");
  const active = Boolean(els.activeInput?.checked);

  const validation = validateYoutubeUrl(youtubeUrl);
  if (!validation.valid) throw new Error(validation.reason);
  if (!title) throw new Error("Le titre de piste est obligatoire.");

  return {
    title,
    youtubeUrl,
    answer,
    aliases,
    active,
  };
}

function buildPlayerSyncPayload(track, liveState) {
  if (!track?.videoId) {
    return { shouldLoad: false, targetSeconds: 0, shouldPlay: false };
  }

  const targetSeconds = computeTargetSeconds(liveState);
  const shouldPlay = liveState.active && liveState.playbackState === "playing";

  return { shouldLoad: true, videoId: track.videoId, targetSeconds, shouldPlay };
}

async function syncYoutubePlayerToLiveState(player, track, liveState, options = {}) {
  const { allowPlay = true, onAutoplayBlocked } = options;
  const payload = buildPlayerSyncPayload(track, liveState);

  if (!payload.shouldLoad) {
    player.stop();
    return;
  }

  await player.loadVideo(payload.videoId, payload.targetSeconds, false);

  if (!liveState.active || liveState.playbackState === "stopped") {
    player.stop();
    return;
  }

  if (liveState.playbackState === "paused") {
    player.pause();
    player.seekTo(payload.targetSeconds);
    return;
  }

  if (payload.shouldPlay && allowPlay) {
    try {
      player.play();
    } catch {
      onAutoplayBlocked?.();
    }
  }
}

function patchForTrackSelection(track, trackIndex, keepPlayback) {
  const shouldKeepPlaying = keepPlayback === "playing";
  return {
    active: true,
    trackId: track?.id || null,
    trackIndex: Math.max(0, Number(trackIndex || 0)),
    playbackState: shouldKeepPlaying ? "playing" : "paused",
    startedAt: shouldKeepPlaying ? Date.now() : null,
    pausedAtSeconds: 0,
    lastError: "",
  };
}

export function initManche5Admin(options) {
  const { getCurrentAdminId, setMessage, showToast } = options;

  const els = {
    statusMessage: document.getElementById("m5-admin-message"),
    currentTrackLabel: document.getElementById("m5-current-track"),
    currentTrackTitle: document.getElementById("m5-current-track-title"),
    currentTrackYoutube: document.getElementById("m5-current-track-youtube"),
    playbackStatus: document.getElementById("m5-playback-status"),
    liveError: document.getElementById("m5-live-error"),

    startBtn: document.getElementById("m5-start-round"),
    playBtn: document.getElementById("m5-play"),
    pauseBtn: document.getElementById("m5-pause"),
    resumeBtn: document.getElementById("m5-resume"),
    replayBtn: document.getElementById("m5-replay"),
    nextBtn: document.getElementById("m5-next"),
    prevBtn: document.getElementById("m5-prev"),

    trackList: document.getElementById("m5-track-list"),
    trackForm: document.getElementById("m5-track-form"),
    submitBtn: document.getElementById("m5-track-submit"),
    cancelEditBtn: document.getElementById("m5-track-cancel-edit"),
    formTitle: document.getElementById("m5-track-form-title"),

    titleInput: document.getElementById("m5-track-title-input"),
    urlInput: document.getElementById("m5-track-url-input"),
    answerInput: document.getElementById("m5-track-answer-input"),
    aliasesInput: document.getElementById("m5-track-aliases-input"),
    activeInput: document.getElementById("m5-track-active-input"),
  };

  if (!els.startBtn || !els.trackForm) return;

  const player = new YoutubeAudioPlayer({
    hostId: "m5-admin-youtube-host",
    onError: async (event) => {
      const message = parseYoutubeError(event?.data);
      setMessage?.(els.statusMessage, message, "error");
      try {
        await writeBlindtestLive(
          () => ({
            playbackState: "paused",
            pausedAtSeconds: player.getCurrentTime(),
            startedAt: null,
            lastError: message,
          }),
          liveState,
          getCurrentAdminId?.() || "admin"
        );
      } catch {
        // ignore secondary write failures
      }
    },
  });

  let tracks = [];
  let liveState = defaultBlindtestLiveState();
  let editingTrackId = null;
  let lastAppliedSyncVersion = -1;

  function resetTrackForm() {
    editingTrackId = null;
    els.trackForm.reset();
    if (els.activeInput) els.activeInput.checked = true;
    if (els.formTitle) els.formTitle.textContent = "Ajouter une piste";
    if (els.submitBtn) els.submitBtn.textContent = "Ajouter la piste";
    els.cancelEditBtn?.classList.add("hidden");
  }

  function fillTrackForm(track) {
    editingTrackId = track.id;
    if (els.titleInput) els.titleInput.value = track.title || "";
    if (els.urlInput) els.urlInput.value = track.youtubeUrl || "";
    if (els.answerInput) els.answerInput.value = track.answer || "";
    if (els.aliasesInput) els.aliasesInput.value = (track.aliases || []).join(", ");
    if (els.activeInput) els.activeInput.checked = track.active !== false;
    if (els.formTitle) els.formTitle.textContent = "Modifier la piste";
    if (els.submitBtn) els.submitBtn.textContent = "Enregistrer";
    els.cancelEditBtn?.classList.remove("hidden");
  }

  function getEnabledTracks() {
    return activeTracks(tracks);
  }

  function getCurrentTrack(enabledTracks = getEnabledTracks()) {
    return findTrackByIdOrIndex(enabledTracks, liveState);
  }

  function renderTrackList() {
    if (!els.trackList) return;
    els.trackList.innerHTML = "";

    if (!tracks.length) {
      els.trackList.innerHTML = "<li class='empty-state'>Aucune musique configurée en base.</li>";
      return;
    }

    const enabledTracks = getEnabledTracks();
    const currentTrack = getCurrentTrack(enabledTracks);

    tracks.forEach((track, index) => {
      const li = document.createElement("li");
      li.className = "leader-item m5-track-item";

      const trackTitle = document.createElement("span");
      trackTitle.className = "leader-name";
      trackTitle.textContent = `#${index + 1} · ${track.title || "Sans titre"}`;

      const trackMeta = document.createElement("span");
      trackMeta.className = "leader-score";
      const currentBadge = currentTrack?.id === track.id ? " · Courante" : "";
      const activeBadge = track.active ? "Active" : "Inactive";
      trackMeta.textContent = `${activeBadge} · ${formatValidationError(track)}${currentBadge}`;

      const actions = document.createElement("div");
      actions.className = "m5-track-actions";

      const selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.className = "btn btn-secondary mini-btn";
      selectBtn.textContent = "Sélectionner";
      selectBtn.disabled = !track.active || !track.isValid;
      selectBtn.addEventListener("click", async () => {
        const keepPlayback = liveState.playbackState;
        const enabled = getEnabledTracks();
        const normalizedTrack = enabled.find((item) => item.id === track.id) || null;
        if (!normalizedTrack) {
          setMessage?.(els.statusMessage, "Impossible de sélectionner une piste inactive/invalide.", "error");
          return;
        }
        const trackIndex = enabled.findIndex((item) => item.id === normalizedTrack.id);
        await writeBlindtestLive(
          () => patchForTrackSelection(normalizedTrack, trackIndex, keepPlayback),
          liveState,
          getCurrentAdminId?.() || "admin"
        );
        showToast?.(`Piste sélectionnée : ${track.title}`);
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-secondary mini-btn";
      editBtn.textContent = "Modifier";
      editBtn.addEventListener("click", () => fillTrackForm(track));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger mini-btn";
      deleteBtn.textContent = "Supprimer";
      deleteBtn.addEventListener("click", async () => {
        const confirmed = window.confirm(`Supprimer la piste “${track.title || "Sans titre"}” ?`);
        if (!confirmed) return;

        try {
          await removeBlindtestTrack(track.id);
          if (editingTrackId === track.id) resetTrackForm();

          const isCurrentTrack = liveState.trackId === track.id;
          if (isCurrentTrack) {
            const remaining = getEnabledTracks().filter((item) => item.id !== track.id);
            const fallback = remaining[0] || null;
            await writeBlindtestLive(
              () => {
                if (!fallback) {
                  return {
                    active: false,
                    trackId: null,
                    trackIndex: 0,
                    playbackState: "stopped",
                    startedAt: null,
                    pausedAtSeconds: 0,
                    lastError: "La piste en cours a été supprimée. Plus aucune piste active.",
                  };
                }

                const fallbackIndex = remaining.findIndex((item) => item.id === fallback.id);
                return {
                  ...patchForTrackSelection(fallback, fallbackIndex, "paused"),
                  playbackState: "paused",
                  startedAt: null,
                  pausedAtSeconds: 0,
                  lastError: "La piste en cours a été supprimée. Sélection automatique d’une nouvelle piste.",
                };
              },
              liveState,
              getCurrentAdminId?.() || "admin"
            );
          }

          showToast?.("Piste supprimée.");
        } catch (error) {
          setMessage?.(els.statusMessage, error.message || "Suppression impossible.", "error");
        }
      });

      actions.append(selectBtn, editBtn, deleteBtn);
      li.append(trackTitle, trackMeta, actions);
      els.trackList.appendChild(li);
    });
  }

  function renderAdminState() {
    const enabledTracks = getEnabledTracks();
    const currentTrack = getCurrentTrack(enabledTracks);
    const currentIndex = currentTrack ? enabledTracks.findIndex((track) => track.id === currentTrack.id) : -1;

    if (els.currentTrackLabel) {
      els.currentTrackLabel.textContent = currentTrack
        ? `Piste ${currentIndex + 1} / ${enabledTracks.length}`
        : "Aucune piste active";
    }
    if (els.currentTrackTitle) els.currentTrackTitle.textContent = currentTrack?.title || "—";
    if (els.currentTrackYoutube) els.currentTrackYoutube.textContent = currentTrack?.youtubeUrl || "—";
    if (els.playbackStatus) els.playbackStatus.textContent = statusLabel(liveState.playbackState);

    if (els.liveError) {
      if (liveState.lastError) {
        els.liveError.textContent = liveState.lastError;
        els.liveError.classList.remove("hidden");
      } else {
        els.liveError.textContent = "";
        els.liveError.classList.add("hidden");
      }
    }

    const hasTracks = enabledTracks.length > 0;
    const hasCurrentTrack = Boolean(currentTrack);

    els.playBtn.disabled = !hasTracks || !hasCurrentTrack;
    els.pauseBtn.disabled = !hasTracks || liveState.playbackState !== "playing";
    els.resumeBtn.disabled = !hasTracks || liveState.playbackState !== "paused";
    els.replayBtn.disabled = !hasTracks || !hasCurrentTrack;
    els.nextBtn.disabled = !hasTracks || currentIndex < 0 || currentIndex >= enabledTracks.length - 1;
    els.prevBtn.disabled = !hasTracks || currentIndex <= 0;
  }

  async function moveTrack(step) {
    const enabledTracks = getEnabledTracks();
    if (!enabledTracks.length) return;
    const currentTrack = getCurrentTrack(enabledTracks);
    const currentIndex = currentTrack ? enabledTracks.findIndex((track) => track.id === currentTrack.id) : 0;
    const nextIndex = Math.max(0, Math.min(enabledTracks.length - 1, currentIndex + step));
    const nextTrack = enabledTracks[nextIndex] || null;

    if (!nextTrack || nextTrack.id === currentTrack?.id) return;

    await writeBlindtestLive(
      () => patchForTrackSelection(nextTrack, nextIndex, liveState.playbackState),
      liveState,
      getCurrentAdminId?.() || "admin"
    );
  }

  els.trackForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const payload = createTrackFormPayload(els);
      const adminId = getCurrentAdminId?.() || "admin";

      if (editingTrackId) {
        await updateBlindtestTrack(editingTrackId, payload, adminId);
        setMessage?.(els.statusMessage, "Piste modifiée.", "success");
        showToast?.("Piste modifiée");
      } else {
        const order = tracks.length ? Math.max(...tracks.map((track) => Number(track.order || 0))) + 1 : 1;
        await createBlindtestTrack({ ...payload, order }, adminId);
        setMessage?.(els.statusMessage, "Piste ajoutée.", "success");
        showToast?.("Piste ajoutée");
      }

      resetTrackForm();
    } catch (error) {
      setMessage?.(els.statusMessage, error.message || "Enregistrement impossible.", "error");
    }
  });

  els.cancelEditBtn?.addEventListener("click", () => resetTrackForm());

  els.startBtn.addEventListener("click", async () => {
    const adminId = getCurrentAdminId?.() || "admin";
    await ensureBlindtestLiveSeed(adminId);

    const enabledTracks = getEnabledTracks();
    const firstTrack = enabledTracks[0] || null;

    await Promise.all([
      update(ref(db, "quiz/state"), {
        activeRound: "manche5",
        liveRound: "manche5",
        updatedAt: Date.now(),
        updatedBy: adminId,
      }),
      update(ref(db, "blindtestLive"), {
        active: Boolean(firstTrack),
        trackId: firstTrack?.id || null,
        trackIndex: 0,
        playbackState: firstTrack ? "paused" : "stopped",
        pausedAtSeconds: 0,
        startedAt: null,
        syncVersion: Number(liveState.syncVersion || 0) + 1,
        updatedAt: Date.now(),
        updatedBy: adminId,
        lastError: firstTrack ? "" : "Aucune piste active configurée.",
      }),
    ]);

    showToast?.(firstTrack ? "Manche 5 activée" : "Manche 5 activée sans piste (base vide)");
  });

  els.playBtn.addEventListener("click", async () => {
    await writeBlindtestLive(
      (state) => ({
        active: true,
        playbackState: "playing",
        startedAt: Date.now() - Math.floor(Number(state.pausedAtSeconds || 0) * 1000),
        lastError: "",
      }),
      liveState,
      getCurrentAdminId?.() || "admin"
    );
  });

  els.pauseBtn.addEventListener("click", async () => {
    await writeBlindtestLive(
      () => ({
        playbackState: "paused",
        pausedAtSeconds: player.getCurrentTime(),
        startedAt: null,
      }),
      liveState,
      getCurrentAdminId?.() || "admin"
    );
  });

  els.resumeBtn.addEventListener("click", async () => {
    await writeBlindtestLive(
      (state) => ({
        playbackState: "playing",
        startedAt: Date.now() - Math.floor(Number(state.pausedAtSeconds || 0) * 1000),
      }),
      liveState,
      getCurrentAdminId?.() || "admin"
    );
  });

  els.replayBtn.addEventListener("click", async () => {
    await writeBlindtestLive(
      () => ({
        active: true,
        playbackState: "playing",
        pausedAtSeconds: 0,
        startedAt: Date.now(),
        lastError: "",
      }),
      liveState,
      getCurrentAdminId?.() || "admin"
    );
  });

  els.nextBtn.addEventListener("click", async () => moveTrack(1));
  els.prevBtn.addEventListener("click", async () => moveTrack(-1));

  watchBlindtestTracks(async (nextTracks) => {
    tracks = nextTracks;
    renderTrackList();

    const patch = sanitizeLiveStateForTracks(tracks, liveState);
    if (Object.keys(patch).length > 0) {
      const changed = Object.entries(patch).some(([key, value]) => liveState[key] !== value);
      if (changed) {
        await writeBlindtestLive(() => patch, liveState, getCurrentAdminId?.() || "admin");
      }
    }

    renderAdminState();
  });

  watchBlindtestLive(async (nextLiveState) => {
    liveState = nextLiveState;
    renderAdminState();

    if (nextLiveState.syncVersion === lastAppliedSyncVersion) return;
    lastAppliedSyncVersion = nextLiveState.syncVersion;

    const track = getCurrentTrack();
    try {
      await syncYoutubePlayerToLiveState(player, track, nextLiveState);
      if (nextLiveState.lastError) {
        setMessage?.(els.statusMessage, `Synchronisé avec alerte : ${nextLiveState.lastError}`, "error");
      } else {
        setMessage?.(els.statusMessage, "Synchronisation admin OK.", "success");
      }
    } catch {
      setMessage?.(els.statusMessage, "Erreur de synchronisation lecteur YouTube.", "error");
    }
  });

  resetTrackForm();
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
      const message = parseYoutubeError(event?.data);
      statusLabelNode.textContent = `Erreur lecteur : ${message}`;
      statusLabelNode.classList.add("error");
      setGuestHint(message, "error");
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
    const currentTrack = findTrackByIdOrIndex(enabledTracks, liveState);
    const index = currentTrack ? enabledTracks.findIndex((track) => track.id === currentTrack.id) : -1;

    if (!enabledTracks.length) {
      trackLabelNode.textContent = "Piste : aucune musique configurée";
      playbackLabelNode.textContent = "État : Arrêt";
      statusLabelNode.textContent = "Aucune musique blindtest disponible.";
      return;
    }

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
      audioUnlocked = true;
      setGuestHint("Audio activé. Vous recevrez la piste live automatiquement.", "success");
      renderGuestState();

      if (liveState.active) {
        const track = findTrackByIdOrIndex(activeTracks(tracks), liveState);
        await syncYoutubePlayerToLiveState(player, track, liveState, {
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

    const track = findTrackByIdOrIndex(activeTracks(tracks), nextLiveState);
    await syncYoutubePlayerToLiveState(player, track, nextLiveState, {
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
