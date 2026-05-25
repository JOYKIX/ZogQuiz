import { db, ref, update } from "./firebase.js";
import {
  activeTracks,
  watchBlindtestTracks,
  createBlindtestTrack,
  updateBlindtestTrack,
  removeBlindtestTrack,
} from "./blindtest/tracks.js";
import { showConfirm } from "./modal.js";
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
  const revealYoutubeUrl = String(els.revealUrlInput?.value || "").trim();
  const category = String(els.categoryInput?.value || "opening").toLowerCase();
  const aliases = parseAliasesInput(els.aliasesInput?.value || "");
  const active = Boolean(els.activeInput?.checked);

  const validation = validateYoutubeUrl(youtubeUrl);
  if (!validation.valid) throw new Error(validation.reason);
  if (!title) throw new Error("Le titre de piste est obligatoire.");

  return {
    title,
    youtubeUrl,
    answer,
    revealYoutubeUrl,
    category,
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

function resolveGuestPlaybackTrack(track, state) {
  if (!track) return null;
  if (state.showAnswer && track.revealYoutubeUrl) {
    const revealValidation = validateYoutubeUrl(track.revealYoutubeUrl);
    if (revealValidation.valid) return { ...track, videoId: revealValidation.videoId };
  }
  return track;
}

export function initManche5Admin(options) {
  const { getCurrentAdminId, setMessage, showToast } = options;

  const els = {
    statusMessage: document.getElementById("m4-admin-message"),
    currentTrackLabel: document.getElementById("m4-current-track"),
    currentTrackTitle: document.getElementById("m4-current-track-title"),
    currentTrackYoutube: document.getElementById("m4-current-track-youtube"),
    currentTrackAnswer: document.getElementById("m4-current-track-answer"),
    playbackStatus: document.getElementById("m4-playback-status"),
    liveError: document.getElementById("m4-live-error"),

    startBtn: document.getElementById("m4-start-round"),
    playBtn: document.getElementById("m4-play"),
    pauseBtn: document.getElementById("m4-pause"),
    resumeBtn: document.getElementById("m4-resume"),
    replayBtn: document.getElementById("m4-replay"),
    showAnswerBtn: document.getElementById("m4-show-answer"),
    nextBtn: document.getElementById("m4-next"),
    prevBtn: document.getElementById("m4-prev"),

    trackList: document.getElementById("m4-track-list"),
    trackForm: document.getElementById("m4-track-form"),
    submitBtn: document.getElementById("m4-track-submit"),
    cancelEditBtn: document.getElementById("m4-track-cancel-edit"),
    formTitle: document.getElementById("m4-track-form-title"),

    titleInput: document.getElementById("m4-track-title-input"),
    urlInput: document.getElementById("m4-track-url-input"),
    answerInput: document.getElementById("m4-track-answer-input"),
    revealUrlInput: document.getElementById("m4-track-reveal-url-input"),
    categoryInput: document.getElementById("m4-track-category-input"),
    aliasesInput: document.getElementById("m4-track-aliases-input"),
    activeInput: document.getElementById("m4-track-active-input"),
    stopOnAnswerInput: document.getElementById("m4-stop-on-answer"),
    answersList: document.getElementById("m4-participants-answers"),
    answersLiveList: document.getElementById("m4-participants-answers-live"),
  };

  if (!els.startBtn || !els.trackForm) return;

  const player = new YoutubeAudioPlayer({
    hostId: "m4-admin-youtube-host",
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
    if (els.revealUrlInput) els.revealUrlInput.value = track.revealYoutubeUrl || "";
    if (els.categoryInput) els.categoryInput.value = track.category || "opening";
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
      li.className = "leader-item m4-track-item";

      const trackTitle = document.createElement("span");
      trackTitle.className = "leader-name";
      trackTitle.textContent = `#${index + 1} · ${track.title || "Sans titre"} · ${(track.category || "opening").toUpperCase()}`;

      const trackMeta = document.createElement("span");
      trackMeta.className = "leader-score";
      const currentBadge = currentTrack?.id === track.id ? " · Courante" : "";
      const activeBadge = track.active ? "Active" : "Inactive";
      trackMeta.textContent = `${activeBadge} · ${formatValidationError(track)}${currentBadge}`;

      const actions = document.createElement("div");
      actions.className = "m4-track-actions";

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
        const confirmed = await showConfirm(`Supprimer la piste “${track.title || "Sans titre"}” ?`, { title: "Suppression de piste" });
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



  function renderParticipantAnswers() {
    if (!els.answersList && !els.answersLiveList) return;
    const answers = Object.values(liveState.participantAnswers || {})
      .sort((a, b) => Number(b?.answeredAt || 0) - Number(a?.answeredAt || 0));
    if (els.answersList) els.answersList.innerHTML = "";
    if (els.answersLiveList) els.answersLiveList.innerHTML = "";
    if (!answers.length) {
      if (els.answersList) els.answersList.innerHTML = "<li class='empty-state'>Aucune réponse reçue.</li>";
      if (els.answersLiveList) els.answersLiveList.innerHTML = "<li class='empty-state'>Aucune réponse reçue.</li>";
      return;
    }
    answers.slice(0, 20).forEach((item) => {
      const li = document.createElement("li");
      li.className = "leader-item";
      const when = item.answeredAt ? new Date(item.answeredAt).toLocaleTimeString("fr-FR") : "—";
      li.innerHTML = `<span class="leader-name">${item.nickname || "Invité"} · ${item.answer || "—"}</span><span class="leader-score">${when}</span>`;
      els.answersList?.appendChild(li.cloneNode(true));
      els.answersLiveList?.appendChild(li);
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
    if (els.currentTrackAnswer) els.currentTrackAnswer.textContent = currentTrack?.answer || "—";
    if (els.playbackStatus) els.playbackStatus.textContent = statusLabel(liveState.playbackState);
    if (els.stopOnAnswerInput) els.stopOnAnswerInput.checked = Boolean(liveState.stopOnAnswer);
    renderParticipantAnswers();

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
    if (els.showAnswerBtn) {
      els.showAnswerBtn.disabled = !hasCurrentTrack;
      els.showAnswerBtn.textContent = liveState.showAnswer ? "Masquer la réponse" : "Afficher la réponse";
    }
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
        activeRound: "manche4",
        liveRound: "manche4",
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

    showToast?.(firstTrack ? "Manche 4 activée" : "Manche 4 activée sans piste (base vide)");
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
  els.showAnswerBtn?.addEventListener("click", async () => {
    await writeBlindtestLive(() => ({ showAnswer: !liveState.showAnswer }), liveState, getCurrentAdminId?.() || "admin");
  });
  els.stopOnAnswerInput?.addEventListener("change", async () => {
    await writeBlindtestLive(() => ({ stopOnAnswer: Boolean(els.stopOnAnswerInput?.checked) }), liveState, getCurrentAdminId?.() || "admin");
  });
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
    const previousAnswersCount = Object.keys(liveState.participantAnswers || {}).length;
    liveState = nextLiveState;
    const nextAnswersCount = Object.keys(nextLiveState.participantAnswers || {}).length;
    if (nextLiveState.stopOnAnswer && nextLiveState.playbackState === "playing" && nextAnswersCount > previousAnswersCount) {
      await writeBlindtestLive(() => ({ playbackState: "paused", pausedAtSeconds: player.getCurrentTime(), startedAt: null }), nextLiveState, getCurrentAdminId?.() || "admin");
      showToast?.("Musique coupée: réponse participant reçue.");
    }
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

export function initManche5Guest(options = {}) {
  const statusLabelNode = document.getElementById("m4-guest-status");
  const trackLabelNode = document.getElementById("m4-guest-track");
  const playbackLabelNode = document.getElementById("m4-guest-playback");
  const answerRevealNode = document.getElementById("m4-guest-answer-reveal");
  const audioUnlockBtn = document.getElementById("m4-audio-unlock");
  const audioHint = document.getElementById("m4-audio-hint");
  const answerForm = document.getElementById("m4-guest-answer-form");
  const answerInput = document.getElementById("m4-guest-answer-input");
  const answerStatus = document.getElementById("m4-guest-answer-status");
  const getSessionId = typeof options.getSessionId === "function" ? options.getSessionId : () => "";
  const getNickname = typeof options.getNickname === "function" ? options.getNickname : () => "";

  const player = new YoutubeAudioPlayer({
    hostId: "m4-guest-youtube-host",
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
    if (answerRevealNode) answerRevealNode.textContent = liveState.showAnswer ? `Réponse : ${currentTrack?.answer || "—"}` : "";

    if (!liveState.active) {
      statusLabelNode.textContent = "En attente du lancement admin.";
    } else if (!audioUnlocked) {
      statusLabelNode.textContent = "Blindtest actif. Cliquez sur “Activer l’audio”.";
    } else {
      statusLabelNode.textContent = "Blindtest en cours.";
    }

    if (audioUnlockBtn) audioUnlockBtn.disabled = audioUnlocked;
  }

  answerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitGuestAnswer();
    } catch {
      setAnswerStatus("Envoi impossible pour le moment.", "error");
    }
  });

  audioUnlockBtn?.addEventListener("click", async () => {
    try {
      await player.ensureReady();
      audioUnlocked = true;
      setGuestHint("Audio activé. Vous recevrez la piste live automatiquement.", "success");
      renderGuestState();

      if (liveState.active) {
        const track = resolveGuestPlaybackTrack(findTrackByIdOrIndex(activeTracks(tracks), liveState), liveState);
        await syncYoutubePlayerToLiveState(player, track, liveState, {
          allowPlay: true,
          onAutoplayBlocked: () => setGuestHint("Lecture bloquée. Recliquez sur Activer l’audio.", "error"),
        });
      }
    } catch {
      setGuestHint("Impossible d’activer l’audio. Vérifiez votre navigateur.", "error");
    }
  });



  function setAnswerStatus(text, type = "default") {
    if (!answerStatus) return;
    answerStatus.textContent = text;
    answerStatus.classList.remove("success", "error", "loading");
    if (type !== "default") answerStatus.classList.add(type);
  }

  async function submitGuestAnswer() {
    const sessionId = String(getSessionId() || "").trim();
    const nickname = String(getNickname() || "").trim();
    const answer = String(answerInput?.value || "").trim();
    if (!sessionId || !nickname) {
      setAnswerStatus("Vous devez être connecté pour répondre.", "error");
      return;
    }
    if (!answer) {
      setAnswerStatus("Tapez une réponse avant d’envoyer.", "error");
      return;
    }
    setAnswerStatus("Envoi…", "loading");
    await update(ref(db, `blindtestLive/participantAnswers/${sessionId}`), {
      sessionId,
      nickname,
      answer,
      answeredAt: Date.now(),
    });
    setAnswerStatus("Réponse envoyée.", "success");
  }
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

    const track = resolveGuestPlaybackTrack(findTrackByIdOrIndex(activeTracks(tracks), nextLiveState), nextLiveState);
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
