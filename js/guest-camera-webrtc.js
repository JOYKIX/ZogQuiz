import {
  db,
  ref,
  set,
  onValue,
  onChildAdded,
  onChildRemoved,
  onDisconnect,
  update,
  remove,
} from "./firebase.js";
import { ADMIN_CAMERA_ID, CAMERA_PRESENCE_PATH, CAMERA_ROUND_STATE_PATHS, CAMERA_SIGNALING_PATH, ROOM_TO_ROUND_KEY, getActiveParticipantIdsForRound, getCameraRoleParticipantIds, getCameraRoleParticipantNames, getCameraSlotPreviewLabel, resolveCameraSlotGuestId, watchCameraConfig } from "./camera-config.js";

const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
const GUEST_HEARTBEAT_MS = 15000;
const OVERLAY_RETRY_MS = 3500;
const PRESENCE_STALE_MS = 45000;
const SIGNAL_TTL_MS = 120000;

function safeKey(value) {
  return String(value || "").replace(/[.#$\[\]/]/g, "_").slice(0, 120);
}

function toPlainDescription(description) {
  if (!description) return null;
  return { type: description.type, sdp: description.sdp };
}

function toPlainCandidate(candidate) {
  if (!candidate) return null;
  return candidate.toJSON ? candidate.toJSON() : {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  };
}

function createClientId(prefix) {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return safeKey(`${prefix}_${Date.now().toString(36)}_${bytes[0].toString(36)}${bytes[1].toString(36)}`);
}

function chooseFreshestRoundState(current = {}, next = {}) {
  if (!current || !Object.keys(current).length) return next || {};
  if (!next || !Object.keys(next).length) return current || {};
  return Number(next.updatedAt || 0) >= Number(current.updatedAt || 0) ? next : current;
}

function closePeer(entry) {
  entry?.unsubscribeAnswer?.();
  entry?.unsubscribeCandidates?.();
  entry?.unsubscribeOffer?.();
  entry?.unsubscribeSignal?.();
  try { entry?.pc?.close(); } catch {}
}

export function createCameraPublisherController({ getSessionId, getNickname, elements, sourceType = "guest", activeLabel = "Caméra active : flux prêt pour les overlays OBS." }) {
  const state = {
    stream: new MediaStream(),
    status: "off",
    microphoneStatus: "off",
    peers: new Map(),
    unsubscribeRequests: null,
    unsubscribeRequestRemovals: null,
    heartbeat: null,
    selectedDeviceId: "",
    selectedMicrophoneDeviceId: "",
    mediaVersion: Date.now(),
  };

  function hasVideo() {
    return state.stream.getVideoTracks().some((track) => track.readyState !== "ended");
  }

  function hasAudio() {
    return state.stream.getAudioTracks().some((track) => track.readyState !== "ended");
  }

  function hasTracks() {
    return state.stream.getTracks().some((track) => track.readyState !== "ended");
  }

  function stopTracks(kind) {
    state.stream.getTracks()
      .filter((track) => !kind || track.kind === kind)
      .forEach((track) => {
        track.stop();
        state.stream.removeTrack(track);
      });
  }

  function render(status = state.status, text = "") {
    state.status = status;
    const active = status === "active" || status === "starting";
    elements.button.disabled = status === "starting";
    elements.button.textContent = active ? "Désactiver la caméra" : "Activer la caméra";
    if (elements.deviceSelect) elements.deviceSelect.disabled = status === "starting";
    if (elements.status) {
      elements.status.className = `message camera-status ${status}`;
      elements.status.textContent = text || {
        off: "Caméra désactivée.",
        starting: "Demande d’autorisation caméra…",
        active: activeLabel,
        error: "Erreur caméra.",
      }[status] || "";
    }
    elements.preview.classList.toggle("hidden", !hasVideo());
    if (hasVideo() && elements.preview.srcObject !== state.stream) elements.preview.srcObject = state.stream;
    if (!hasVideo() && elements.preview.srcObject) elements.preview.srcObject = null;
  }

  function renderMicrophone(status = state.microphoneStatus, text = "") {
    state.microphoneStatus = status;
    if (!elements.microphoneButton && !elements.microphoneStatus) return;
    const active = status === "active" || status === "starting";
    if (elements.microphoneButton) {
      elements.microphoneButton.disabled = status === "starting";
      elements.microphoneButton.textContent = active ? "Désactiver le micro" : "Activer le micro";
    }
    if (elements.microphoneDeviceSelect) elements.microphoneDeviceSelect.disabled = status === "starting";
    if (elements.microphoneStatus) {
      elements.microphoneStatus.className = `message camera-status ${status}`;
      elements.microphoneStatus.textContent = text || {
        off: "Micro désactivé.",
        starting: "Demande d’autorisation micro…",
        active: "Micro actif : traitement anti-bruit WebRTC activé.",
        error: "Erreur micro.",
      }[status] || "";
    }
  }

  function cameraConstraints() {
    const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
    return state.selectedDeviceId
      ? { ...base, deviceId: { exact: state.selectedDeviceId } }
      : { ...base, facingMode: "user" };
  }

  function microphoneConstraints() {
    const base = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
    };
    return state.selectedMicrophoneDeviceId
      ? { ...base, deviceId: { exact: state.selectedMicrophoneDeviceId } }
      : base;
  }

  async function refreshDeviceList() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const currentValue = state.selectedDeviceId || elements.deviceSelect?.value;
    const currentMicrophoneValue = state.selectedMicrophoneDeviceId || elements.microphoneDeviceSelect?.value;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const cameras = devices.filter((device) => device.kind === "videoinput");
    if (elements.deviceSelect) {
      elements.deviceSelect.replaceChildren();
      cameras.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Caméra ${index + 1}`;
        elements.deviceSelect.append(option);
      });
      const hasCurrent = cameras.some((device) => device.deviceId === currentValue);
      state.selectedDeviceId = hasCurrent ? currentValue : (cameras[0]?.deviceId || "");
      elements.deviceSelect.value = state.selectedDeviceId;
      elements.deviceSelect.hidden = cameras.length <= 1;
      elements.deviceField?.classList.toggle("hidden", cameras.length <= 1);
    }

    const microphones = devices.filter((device) => device.kind === "audioinput");
    if (elements.microphoneDeviceSelect) {
      elements.microphoneDeviceSelect.replaceChildren();
      microphones.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Micro ${index + 1}`;
        elements.microphoneDeviceSelect.append(option);
      });
      const hasCurrentMicrophone = microphones.some((device) => device.deviceId === currentMicrophoneValue);
      state.selectedMicrophoneDeviceId = hasCurrentMicrophone ? currentMicrophoneValue : (microphones[0]?.deviceId || "");
      elements.microphoneDeviceSelect.value = state.selectedMicrophoneDeviceId;
      elements.microphoneDeviceSelect.hidden = microphones.length <= 1;
      elements.microphoneDeviceField?.classList.toggle("hidden", microphones.length <= 1);
    }
  }

  async function writePresence() {
    const sessionId = getSessionId();
    if (!sessionId || !hasTracks()) return;
    const presenceRef = ref(db, `${CAMERA_PRESENCE_PATH}/${safeKey(sessionId)}`);
    const videoTracks = state.stream.getVideoTracks();
    const audioTracks = state.stream.getAudioTracks();
    await set(presenceRef, {
      sessionId: safeKey(sessionId),
      nickname: String(getNickname() || "Invité").slice(0, 40),
      sourceType,
      isAdmin: sourceType === "admin",
      active: true,
      hasVideo: videoTracks.length > 0,
      hasAudio: audioTracks.length > 0,
      mediaVersion: state.mediaVersion,
      tracks: videoTracks.map((track) => ({ id: track.id, label: track.label, enabled: track.enabled })),
      audioTracks: audioTracks.map((track) => ({ id: track.id, label: track.label, enabled: track.enabled, noiseSuppression: track.getSettings?.().noiseSuppression ?? true, echoCancellation: track.getSettings?.().echoCancellation ?? true })),
      updatedAt: Date.now(),
    });
  }

  async function removePresence() {
    const sessionId = getSessionId();
    if (!sessionId) return;
    await remove(ref(db, `${CAMERA_PRESENCE_PATH}/${safeKey(sessionId)}`));
  }

  function startHeartbeat() {
    clearInterval(state.heartbeat);
    state.heartbeat = setInterval(() => {
      writePresence().catch(console.warn);
    }, GUEST_HEARTBEAT_MS);
  }

  async function resetPeerConnections() {
    for (const requestId of [...state.peers.keys()]) await closeRequest(requestId, true);
    if (hasTracks()) watchRequests();
  }

  async function syncPresenceAfterTrackChange() {
    state.mediaVersion = Date.now();
    if (hasTracks()) {
      await writePresence();
      await onDisconnect(ref(db, `${CAMERA_PRESENCE_PATH}/${safeKey(getSessionId())}`)).remove();
      startHeartbeat();
      watchRequests();
      await resetPeerConnections();
    } else {
      clearInterval(state.heartbeat);
      state.heartbeat = null;
      state.unsubscribeRequests?.();
      state.unsubscribeRequestRemovals?.();
      state.unsubscribeRequests = null;
      state.unsubscribeRequestRemovals = null;
      for (const requestId of [...state.peers.keys()]) await closeRequest(requestId, true);
      await removePresence().catch(() => {});
    }
  }

  async function createOfferForRequest(requestId, request) {
    if (!hasTracks() || !getSessionId()) return;
    if (Date.now() - Number(request?.requestedAt || 0) > SIGNAL_TTL_MS) {
      await remove(ref(db, `${CAMERA_SIGNALING_PATH}/${safeKey(getSessionId())}/${requestId}`));
      return;
    }
    if (state.peers.has(requestId)) return;

    const signalPath = `${CAMERA_SIGNALING_PATH}/${safeKey(getSessionId())}/${requestId}`;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const entry = { pc, signalPath };
    state.peers.set(requestId, entry);

    state.stream.getTracks().forEach((track) => pc.addTrack(track, state.stream));
    pc.onicecandidate = async (event) => {
      const candidate = toPlainCandidate(event.candidate);
      if (!candidate) return;
      const key = safeKey(`${Date.now()}_${Math.random().toString(36).slice(2)}`);
      await set(ref(db, `${signalPath}/guestCandidates/${key}`), candidate);
    };
    pc.onconnectionstatechange = async () => {
      await update(ref(db, signalPath), { guestConnectionState: pc.connectionState, guestStateAt: Date.now() }).catch(() => {});
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        setTimeout(() => {
          if (["failed", "closed", "disconnected"].includes(pc.connectionState)) closeRequest(requestId, true);
        }, 2500);
      }
    };

    entry.unsubscribeAnswer = onValue(ref(db, `${signalPath}/answer`), async (snap) => {
      const answer = snap.val();
      if (!answer || pc.signalingState === "closed" || pc.remoteDescription) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.warn);
    });
    entry.unsubscribeCandidates = onChildAdded(ref(db, `${signalPath}/overlayCandidates`), async (snap) => {
      const candidate = snap.val();
      if (!candidate || pc.signalingState === "closed") return;
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
    });

    const offer = await pc.createOffer({ offerToReceiveVideo: false, offerToReceiveAudio: false });
    await pc.setLocalDescription(offer);
    await update(ref(db, signalPath), {
      status: "offered",
      nickname: String(getNickname() || "Invité").slice(0, 40),
      sourceType,
      hasVideo: hasVideo(),
      hasAudio: hasAudio(),
      mediaVersion: state.mediaVersion,
      offer: toPlainDescription(pc.localDescription),
      offeredAt: Date.now(),
    });
  }

  async function closeRequest(requestId, removeSignal = false) {
    const entry = state.peers.get(requestId);
    closePeer(entry);
    state.peers.delete(requestId);
    if (removeSignal && getSessionId()) await remove(ref(db, `${CAMERA_SIGNALING_PATH}/${safeKey(getSessionId())}/${requestId}`)).catch(() => {});
  }

  function watchRequests() {
    if (state.unsubscribeRequests) state.unsubscribeRequests();
    if (state.unsubscribeRequestRemovals) state.unsubscribeRequestRemovals();
    state.unsubscribeRequests = null;
    state.unsubscribeRequestRemovals = null;
    const sessionId = getSessionId();
    if (!sessionId || !hasTracks()) return;
    const requestsRef = ref(db, `${CAMERA_SIGNALING_PATH}/${safeKey(sessionId)}`);
    state.unsubscribeRequests = onChildAdded(requestsRef, (snap) => createOfferForRequest(snap.key, snap.val()).catch(console.warn));
    state.unsubscribeRequestRemovals = onChildRemoved(requestsRef, (snap) => closeRequest(snap.key, false));
  }

  async function start() {
    if (!getSessionId()) { render("error", "Connectez-vous avant d’activer la caméra."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { render("error", "Caméra indisponible sur ce navigateur ou sans HTTPS."); return; }
    await refreshDeviceList();
    render("starting");
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: cameraConstraints(), audio: false });
      stopTracks("video");
      cameraStream.getVideoTracks().forEach((track) => state.stream.addTrack(track));
      await refreshDeviceList();
      render("active");
      await syncPresenceAfterTrackChange();
    } catch (error) {
      stopTracks("video");
      render("error", error?.name === "NotAllowedError" ? "Permission caméra refusée." : `Impossible d’activer la caméra : ${error.message || error}`);
    }
  }

  async function startMicrophone() {
    if (!getSessionId()) { renderMicrophone("error", "Connectez-vous avant d’activer le micro."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { renderMicrophone("error", "Micro indisponible sur ce navigateur ou sans HTTPS."); return; }
    await refreshDeviceList();
    renderMicrophone("starting");
    try {
      const microphoneStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: microphoneConstraints() });
      stopTracks("audio");
      microphoneStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
        state.stream.addTrack(track);
      });
      await refreshDeviceList();
      renderMicrophone("active");
      await syncPresenceAfterTrackChange();
    } catch (error) {
      stopTracks("audio");
      renderMicrophone("error", error?.name === "NotAllowedError" ? "Permission micro refusée." : `Impossible d’activer le micro : ${error.message || error}`);
    }
  }

  async function stopMicrophone({ keepMessage = false, skipRender = false } = {}) {
    stopTracks("audio");
    await syncPresenceAfterTrackChange();
    if (!skipRender) renderMicrophone("off", keepMessage ? "Micro désactivé." : undefined);
  }

  async function stop({ keepMessage = false, skipRender = false } = {}) {
    stopTracks("video");
    await syncPresenceAfterTrackChange();
    if (!skipRender) render("off", keepMessage ? "Caméra désactivée." : undefined);
  }

  async function stopAll() {
    clearInterval(state.heartbeat);
    state.heartbeat = null;
    state.unsubscribeRequests?.();
    state.unsubscribeRequestRemovals?.();
    state.unsubscribeRequests = null;
    state.unsubscribeRequestRemovals = null;
    for (const requestId of [...state.peers.keys()]) await closeRequest(requestId, true);
    stopTracks();
    await removePresence().catch(() => {});
    render("off");
    renderMicrophone("off");
  }

  elements.button.addEventListener("click", () => (hasVideo() ? stop({ keepMessage: true }) : start()));
  elements.microphoneButton?.addEventListener("click", () => (hasAudio() ? stopMicrophone({ keepMessage: true }) : startMicrophone()));
  elements.deviceSelect?.addEventListener("change", async () => {
    state.selectedDeviceId = elements.deviceSelect.value;
    if (!hasVideo()) return;
    await stop({ skipRender: true });
    await start();
  });
  elements.microphoneDeviceSelect?.addEventListener("change", async () => {
    state.selectedMicrophoneDeviceId = elements.microphoneDeviceSelect.value;
    if (!hasAudio()) return;
    await stopMicrophone({ skipRender: true });
    await startMicrophone();
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", () => refreshDeviceList().catch(console.warn));
  window.addEventListener("beforeunload", () => { stopTracks(); removePresence(); });
  render("off");
  renderMicrophone("off");
  refreshDeviceList().catch(console.warn);

  return { start, stop, startMicrophone, stopMicrophone, stopAll, isActive: hasTracks, refreshIdentity: writePresence };
}

export function createGuestCameraController(options) {
  return createCameraPublisherController({ ...options, sourceType: "guest" });
}

export function initCameraOverlay(roundKey) {
  const overlayId = createClientId(`obs_${roundKey}`);
  const grid = document.getElementById("camera-grid");
  const status = document.getElementById("camera-overlay-status");
  const peers = new Map();
  const previewCards = new Map();
  let currentConfig = null;
  let presence = {};
  let guestSessions = {};
  let roundAnswers = { round2: {}, round3: {} };
  let roundStates = {};
  let retryTimer = null;

  function slotName(slot, nickname) {
    return slot?.label || nickname || "Invité";
  }

  function activeQuizParticipantIds() {
    return Object.entries(guestSessions)
      .filter(([, session]) => session?.active !== false && String(session?.nickname || "").trim())
      .map(([id]) => id);
  }

  function currentAnswerSet() {
    if (roundKey === "round2") {
      const questionId = roundStates.round2?.activeQuestionId || "";
      return questionId ? (roundAnswers.round2?.[questionId] || {}) : {};
    }
    if (roundKey === "round3") {
      const state = roundStates.round3 || {};
      const themeId = state.activeThemeId || "";
      if (!themeId) return {};
      const answerKey = safeKey(`${themeId}_${Number(state.questionIndex || 0)}`);
      return roundAnswers.round3?.[answerKey] || {};
    }
    return {};
  }

  function shouldRevealWrittenAnswers(answerSet) {
    const participantIds = activeQuizParticipantIds();
    if (!participantIds.length) return false;
    return participantIds.every((id) => String(answerSet?.[id]?.answer || "").trim());
  }

  function getVisibleAnswerForGuest(guestId) {
    if (!["round2", "round3"].includes(roundKey)) return "";
    const answerSet = currentAnswerSet();
    if (!shouldRevealWrittenAnswers(answerSet)) return "";
    return String(answerSet?.[guestId]?.answer || "").trim();
  }

  function updateAnswerOverlays() {
    peers.forEach((entry, guestId) => {
      if (!entry.answer) return;
      const answer = getVisibleAnswerForGuest(guestId);
      entry.answer.textContent = answer;
      entry.answer.classList.toggle("hidden", !answer);
    });
  }

  function formatPx(value) {
    const numeric = Number(value);
    return `${Number.isFinite(numeric) ? numeric.toFixed(1) : "0.0"}px`;
  }

  function applyCardLayout(entry, slot) {
    if (!entry?.card || !slot) return;
    entry.card.style.left = formatPx(slot.x);
    entry.card.style.top = formatPx(slot.y);
    entry.card.style.width = formatPx(slot.width);
    entry.card.style.height = formatPx(slot.height);
    entry.card.style.borderRadius = formatPx(slot.borderRadius);
    entry.card.style.zIndex = String(slot.zIndex);
    if (entry.video) entry.video.style.objectFit = slot.fit || "cover";
  }

  function applyConfig(config) {
    currentConfig = config;
    grid.classList.toggle("names-hidden", true);
    grid.classList.toggle("disabled", !config.enabled && !config.preview);
    reconcile();
  }

  function activePresenceEntries() {
    const now = Date.now();
    return Object.entries(presence)
      .filter(([, item]) => item?.active && item.hasVideo !== false && now - Number(item.updatedAt || 0) < PRESENCE_STALE_MS)
      .sort((a, b) => String(a[1].nickname || a[0]).localeCompare(String(b[1].nickname || b[0]), "fr"));
  }

  function desiredGuests() {
    if (!currentConfig?.enabled) return [];
    const activeEntries = activePresenceEntries();
    const activeById = new Map(activeEntries);
    const roundState = roundStates[roundKey] || {};
    const activeParticipantIds = getActiveParticipantIdsForRound(roundKey, roundState);
    const roleParticipantIds = getCameraRoleParticipantIds(roundKey, roundState);
    const roleParticipantNames = getCameraRoleParticipantNames(roundKey, roundState);
    const used = new Set();
    const slots = currentConfig.cameras || [];

    return slots.flatMap((slot, slotIndex) => {
      const guestId = resolveCameraSlotGuestId(slot, { activeEntries, activeParticipantIds, roleParticipantIds, roleParticipantNames, used });
      if (!guestId) return [];
      used.add(guestId);
      const item = activeById.get(guestId) || {};
      return [{ guestId, nickname: item.nickname || (guestId === ADMIN_CAMERA_ID ? "Admin" : "Invité"), slot, slotIndex }];
    });
  }

  function updateLayout() {
    peers.forEach((entry) => applyCardLayout(entry, entry.slot));
  }
  function clearPreviewCards() {
    previewCards.forEach((card) => card.remove());
    previewCards.clear();
  }

  function renderPreviewCards() {
    const slots = (currentConfig?.cameras || []).filter((slot) => slot.enabled);
    const activeSlotIndexes = new Set(slots.map((slot) => String((currentConfig.cameras || []).indexOf(slot))));
    for (const slotIndex of [...previewCards.keys()]) {
      if (!activeSlotIndexes.has(slotIndex)) {
        previewCards.get(slotIndex)?.remove();
        previewCards.delete(slotIndex);
      }
    }
    slots.forEach((slot) => {
      const slotIndex = String((currentConfig.cameras || []).indexOf(slot));
      let card = previewCards.get(slotIndex);
      if (!card) {
        card = document.createElement("article");
        card.className = "camera-card camera-preview-card";
        card.dataset.cameraSlot = slotIndex;
        const label = document.createElement("span");
        label.className = "camera-preview-label";
        card.append(label);
        grid.append(card);
        previewCards.set(slotIndex, card);
      }
      card.querySelector(".camera-preview-label").textContent = getCameraSlotPreviewLabel(slot, Number(slotIndex));
      applyCardLayout({ card }, slot);
    });
  }


  function ensureCard(guestId, nickname, slot, slotIndex) {
    let entry = peers.get(guestId);
    if (entry?.card) {
      entry.nickname = nickname;
      entry.slot = slot;
      entry.slotIndex = slotIndex;
      entry.name.textContent = slotName(slot, nickname);
      if (entry.answer) {
        const visibleAnswer = getVisibleAnswerForGuest(guestId);
        entry.answer.textContent = visibleAnswer;
        entry.answer.classList.toggle("hidden", !visibleAnswer);
      }
      applyCardLayout(entry, slot);
      return entry;
    }
    const card = document.createElement("article");
    card.className = "camera-card connecting";
    card.dataset.guestId = guestId;
    card.dataset.cameraSlot = String(slotIndex);
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    const name = document.createElement("span");
    name.className = "camera-name";
    name.textContent = slotName(slot, nickname);
    const answer = document.createElement("span");
    answer.className = "camera-answer hidden";
    card.append(video, name, answer);
    grid.append(card);
    entry = { ...(entry || {}), card, video, name, answer, guestId, nickname, slot, slotIndex };
    peers.set(guestId, entry);
    const visibleAnswer = getVisibleAnswerForGuest(guestId);
    answer.textContent = visibleAnswer;
    answer.classList.toggle("hidden", !visibleAnswer);
    applyCardLayout(entry, slot);
    return entry;
  }

  async function connectGuest(guestId, nickname, slot, slotIndex) {
    const entry = ensureCard(guestId, nickname, slot, slotIndex);
    if (entry.pc && !["failed", "closed", "disconnected"].includes(entry.pc.connectionState)) return;
    closePeer(entry);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const signalId = safeKey(`${overlayId}_${roundKey}_${Date.now().toString(36)}`);
    const signalPath = `${CAMERA_SIGNALING_PATH}/${safeKey(guestId)}/${signalId}`;
    Object.assign(entry, { pc, signalPath, signalId });

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      entry.video.srcObject = stream;
      entry.video.play?.().catch(() => {});
      entry.card.classList.remove("connecting");
    };
    pc.onicecandidate = async (event) => {
      const candidate = toPlainCandidate(event.candidate);
      if (!candidate) return;
      const key = safeKey(`${Date.now()}_${Math.random().toString(36).slice(2)}`);
      await set(ref(db, `${signalPath}/overlayCandidates/${key}`), candidate);
    };
    pc.onconnectionstatechange = async () => {
      await update(ref(db, signalPath), { overlayConnectionState: pc.connectionState, overlayStateAt: Date.now() }).catch(() => {});
      entry.card.classList.toggle("connecting", !["connected", "completed"].includes(pc.connectionState));
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) scheduleReconnect();
    };

    entry.unsubscribeOffer = onValue(ref(db, `${signalPath}/offer`), async (snap) => {
      const offer = snap.val();
      if (!offer || pc.signalingState === "closed" || pc.remoteDescription) return;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await update(ref(db, signalPath), { status: "answered", answer: toPlainDescription(pc.localDescription), answeredAt: Date.now() });
    });
    entry.unsubscribeCandidates = onChildAdded(ref(db, `${signalPath}/guestCandidates`), async (snap) => {
      const candidate = snap.val();
      if (!candidate || pc.signalingState === "closed") return;
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
    });

    await set(ref(db, signalPath), { status: "requesting", roundKey, overlayId, requestedAt: Date.now() });
    await onDisconnect(ref(db, signalPath)).remove();
  }

  async function disconnectGuest(guestId, removeSignal = true) {
    const entry = peers.get(guestId);
    if (!entry) return;
    closePeer(entry);
    entry.video?.srcObject?.getTracks?.().forEach((track) => track.stop());
    entry.card?.remove();
    peers.delete(guestId);
    if (removeSignal && entry.signalPath) await remove(ref(db, entry.signalPath)).catch(() => {});
    updateLayout();
  }

  function scheduleReconnect() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(reconcile, OVERLAY_RETRY_MS);
  }

  function reconcile() {
    if (!grid || !currentConfig) return;
    if (currentConfig.preview) {
      for (const guestId of [...peers.keys()]) {
        disconnectGuest(guestId).catch(console.warn);
      }
      renderPreviewCards();
      grid.classList.toggle("names-hidden", true);
      if (status) status.textContent = `${previewCards.size}/${currentConfig.cameraCount} emplacement(s) prévisualisé(s)`;
      return;
    }
    clearPreviewCards();
    grid.classList.toggle("names-hidden", true);
    const desired = desiredGuests();
    const desiredIds = new Set(desired.map((item) => item.guestId));
    for (const guestId of [...peers.keys()]) {
      if (!desiredIds.has(guestId)) disconnectGuest(guestId).catch(console.warn);
    }
    desired.forEach(({ guestId, nickname, slot, slotIndex }) => connectGuest(guestId, nickname, slot, slotIndex).catch(console.warn));
    if (status) status.textContent = currentConfig.enabled ? `${desired.length}/${currentConfig.cameraCount} caméra(s) connectée(s)` : "Caméras désactivées pour cette manche";
    updateLayout();
    updateAnswerOverlays();
  }

  watchCameraConfig(roundKey, applyConfig);
  const extraRoundStatePaths = roundKey === "round2" ? ["rooms/manche2/state"] : [];
  [...extraRoundStatePaths, ...(CAMERA_ROUND_STATE_PATHS[roundKey] || [])].forEach((path) => {
    onValue(ref(db, path), (snap) => {
      roundStates[roundKey] = chooseFreshestRoundState(roundStates[roundKey], snap.val() || {});
      reconcile();
      updateAnswerOverlays();
    });
  });
  onValue(ref(db, CAMERA_PRESENCE_PATH), (snap) => {
    presence = snap.val() || {};
    reconcile();
  });
  onValue(ref(db, "rooms/manche1/guestSessions"), (snap) => {
    guestSessions = snap.val() || {};
    updateAnswerOverlays();
  });
  if (roundKey === "round2") {
    onValue(ref(db, "rooms/manche2/answers"), (snap) => {
      roundAnswers.round2 = snap.val() || {};
      updateAnswerOverlays();
    });
  }
  if (roundKey === "round3") {
    onValue(ref(db, "rooms/manche3/answers"), (snap) => {
      roundAnswers.round3 = snap.val() || {};
      updateAnswerOverlays();
    });
  }
  setInterval(reconcile, 10000);
  window.addEventListener("beforeunload", () => {
    peers.forEach((entry) => { if (entry.signalPath) remove(ref(db, entry.signalPath)); closePeer(entry); });
    clearPreviewCards();
  });
}

export function initGuestCameraWall({
  root,
  status,
  adminRoot = root,
  participantsRoot = root,
  adminStatus = status,
  participantsStatus = status,
  showAdminInput,
  showParticipantsInput,
  getCurrentSessionId,
}) {
  if (!adminRoot && !participantsRoot) return null;
  const viewerId = createClientId("guest_viewer");
  const peers = new Map();
  const configs = {};
  const roundStates = {};
  let presence = {};
  let liveRoom = "manche1";
  let retryTimer = null;

  function currentRoundKey() {
    return ROOM_TO_ROUND_KEY[liveRoom === "finale" ? "manche5" : liveRoom] || "round1";
  }

  function shouldShowAdmin() {
    if (!adminRoot) return false;
    return showAdminInput ? showAdminInput.checked : true;
  }

  function shouldShowParticipants() {
    if (!participantsRoot) return false;
    return showParticipantsInput ? showParticipantsInput.checked : true;
  }

  function shouldShowGroup(group) {
    return group === "admin" ? shouldShowAdmin() : shouldShowParticipants();
  }

  function syncRenderVisibility() {
    adminRoot?.classList.toggle("render-disabled", !shouldShowAdmin());
    participantsRoot?.classList.toggle("render-disabled", !shouldShowParticipants());
  }

  function setStatusText(target, text) {
    if (target) target.textContent = text;
  }

  function activePresenceEntries() {
    const now = Date.now();
    const selfId = safeKey(getCurrentSessionId?.() || "");
    return Object.entries(presence)
      .filter(([id, item]) => item?.active && id !== selfId && now - Number(item.updatedAt || 0) < PRESENCE_STALE_MS)
      .sort((a, b) => {
        if (a[0] === ADMIN_CAMERA_ID) return -1;
        if (b[0] === ADMIN_CAMERA_ID) return 1;
        return String(a[1].nickname || a[0]).localeCompare(String(b[1].nickname || b[0]), "fr");
      });
  }

  function desiredStreams() {
    if (!getCurrentSessionId?.()) return [];
    const roundKey = currentRoundKey();
    const config = configs[roundKey];
    const entries = activePresenceEntries();
    const byId = new Map(entries);
    const roundState = roundStates[roundKey] || {};
    const activeParticipantIds = getActiveParticipantIdsForRound(roundKey, roundState);
    const roleParticipantIds = getCameraRoleParticipantIds(roundKey, roundState);
    const roleParticipantNames = getCameraRoleParticipantNames(roundKey, roundState);
    const used = new Set();
    const desired = [];
    const showAdmin = shouldShowAdmin();
    const showParticipants = shouldShowParticipants();

    if (showAdmin && byId.has(ADMIN_CAMERA_ID)) {
      desired.push({ guestId: ADMIN_CAMERA_ID, nickname: byId.get(ADMIN_CAMERA_ID)?.nickname || "Admin", group: "admin", mediaVersion: byId.get(ADMIN_CAMERA_ID)?.mediaVersion || 0 });
      used.add(ADMIN_CAMERA_ID);
    }

    if (showParticipants && config?.enabled && config.cameras?.length) {
      config.cameras.forEach((slot) => {
        const guestId = resolveCameraSlotGuestId(slot, { activeEntries: entries, activeParticipantIds, roleParticipantIds, roleParticipantNames, used, includeAdmin: false });
        if (!guestId || guestId === ADMIN_CAMERA_ID) return;
        used.add(guestId);
        desired.push({ guestId, nickname: byId.get(guestId)?.nickname || "Invité", group: "participants", mediaVersion: byId.get(guestId)?.mediaVersion || 0 });
      });
    }

    if (showParticipants) {
      activeParticipantIds.forEach((participantId) => {
        if (!byId.has(participantId) || used.has(participantId)) return;
        used.add(participantId);
        desired.push({ guestId: participantId, nickname: byId.get(participantId)?.nickname || "Participant", group: "participants", mediaVersion: byId.get(participantId)?.mediaVersion || 0 });
      });
    }

    if (showParticipants && desired.filter((item) => item.group === "participants").length === 0) {
      entries.forEach(([guestId, item]) => {
        if (used.has(guestId) || guestId === ADMIN_CAMERA_ID) return;
        used.add(guestId);
        desired.push({ guestId, nickname: item?.nickname || "Invité", group: "participants", mediaVersion: item?.mediaVersion || 0 });
      });
    }

    return desired;
  }

  function rootForGroup(group) {
    return group === "admin" ? adminRoot : participantsRoot;
  }

  function ensureCard(guestId, nickname, group, mediaVersion = 0) {
    let entry = peers.get(guestId);
    const targetRoot = rootForGroup(group);
    if (entry?.card) {
      entry.nickname = nickname;
      entry.group = group;
      entry.mediaVersion = mediaVersion;
      entry.name.textContent = nickname;
      entry.card.classList.toggle("admin", guestId === ADMIN_CAMERA_ID);
      if (targetRoot && entry.card.parentElement !== targetRoot) targetRoot.append(entry.card);
      return entry;
    }
    const card = document.createElement("article");
    card.className = `guest-remote-camera-card connecting${guestId === ADMIN_CAMERA_ID ? " admin" : ""}`;
    card.dataset.guestId = guestId;
    card.dataset.cameraGroup = group;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = false;
    video.volume = 1;
    video.controls = true;
    const name = document.createElement("span");
    name.className = "guest-remote-camera-name";
    name.textContent = nickname;
    card.append(video, name);
    targetRoot?.append(card);
    entry = { ...(entry || {}), card, video, name, guestId, nickname, group, mediaVersion };
    peers.set(guestId, entry);
    return entry;
  }

  async function connect(guestId, nickname, group, mediaVersion = 0) {
    if (!shouldShowGroup(group)) return;
    const entry = ensureCard(guestId, nickname, group, mediaVersion);
    if (entry.pc && !["failed", "closed", "disconnected"].includes(entry.pc.connectionState)) return;
    closePeer(entry);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const signalId = safeKey(`${viewerId}_${guestId}_${Date.now().toString(36)}`);
    const signalPath = `${CAMERA_SIGNALING_PATH}/${safeKey(guestId)}/${signalId}`;
    Object.assign(entry, { pc, signalPath, signalId });

    pc.ontrack = (event) => {
      if (!shouldShowGroup(group)) {
        disconnect(guestId).catch(console.warn);
        return;
      }
      const [stream] = event.streams;
      entry.video.srcObject = stream;
      entry.video.play?.().catch(() => {});
      entry.card.classList.remove("connecting");
    };
    pc.onicecandidate = async (event) => {
      const candidate = toPlainCandidate(event.candidate);
      if (!candidate) return;
      const key = safeKey(`${Date.now()}_${Math.random().toString(36).slice(2)}`);
      await set(ref(db, `${signalPath}/overlayCandidates/${key}`), candidate);
    };
    pc.onconnectionstatechange = async () => {
      await update(ref(db, signalPath), { viewerConnectionState: pc.connectionState, viewerStateAt: Date.now() }).catch(() => {});
      entry.card.classList.toggle("connecting", !["connected", "completed"].includes(pc.connectionState));
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) scheduleReconnect();
    };
    entry.unsubscribeOffer = onValue(ref(db, `${signalPath}/offer`), async (snap) => {
      const offer = snap.val();
      if (!offer || pc.signalingState === "closed" || pc.remoteDescription) return;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await update(ref(db, signalPath), { status: "answered", answer: toPlainDescription(pc.localDescription), answeredAt: Date.now() });
    });
    entry.unsubscribeCandidates = onChildAdded(ref(db, `${signalPath}/guestCandidates`), async (snap) => {
      const candidate = snap.val();
      if (!candidate || pc.signalingState === "closed") return;
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
    });

    await set(ref(db, signalPath), { status: "requesting", viewerId, requestedAt: Date.now(), viewerType: "guest-wall" });
    await onDisconnect(ref(db, signalPath)).remove();
  }

  async function disconnect(guestId, removeSignal = true) {
    const entry = peers.get(guestId);
    if (!entry) return;
    closePeer(entry);
    entry.video?.srcObject?.getTracks?.().forEach((track) => track.stop());
    entry.card?.remove();
    peers.delete(guestId);
    if (removeSignal && entry.signalPath) await remove(ref(db, entry.signalPath)).catch(() => {});
  }

  function scheduleReconnect() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(reconcile, OVERLAY_RETRY_MS);
  }

  function reconcile() {
    syncRenderVisibility();
    const desired = desiredStreams();
    const ids = new Set(desired.map((item) => item.guestId));
    for (const guestId of [...peers.keys()]) {
      if (!ids.has(guestId)) disconnect(guestId).catch(console.warn);
    }
    const desiredById = new Map(desired.map((item) => [item.guestId, item]));
    peers.forEach((entry, guestId) => {
      const desiredEntry = desiredById.get(guestId);
      if (desiredEntry && entry.mediaVersion !== desiredEntry.mediaVersion) disconnect(guestId).catch(console.warn);
    });
    desired.forEach(({ guestId, nickname, group, mediaVersion }) => connect(guestId, nickname, group, mediaVersion).catch(console.warn));

    const adminCount = desired.filter((item) => item.group === "admin").length;
    const participantCount = desired.filter((item) => item.group === "participants").length;
    setStatusText(
      adminStatus,
      shouldShowAdmin()
        ? (adminCount ? `${adminCount} flux admin visible.` : "Aucun flux admin actif.")
        : "Rendu du flux admin désactivé.",
    );
    setStatusText(
      participantsStatus,
      shouldShowParticipants()
        ? (participantCount ? `${participantCount} flux participant(s) visible(s).` : "Aucun flux participant actif pour le moment.")
        : "Rendu des flux participants désactivé.",
    );
  }

  showAdminInput?.addEventListener("change", reconcile);
  showParticipantsInput?.addEventListener("change", reconcile);
  syncRenderVisibility();

  onValue(ref(db, "quiz/state"), (snap) => {
    const state = snap.val() || {};
    liveRoom = state.liveRound || state.activeRound || "manche1";
    reconcile();
  });
  ["round1", "round2", "round3", "round4", "round5", "round6"].forEach((roundKey) => {
    watchCameraConfig(roundKey, (config) => {
      configs[roundKey] = config;
      reconcile();
    });
    const extraRoundStatePaths = roundKey === "round2" ? ["rooms/manche2/state"] : [];
    [...extraRoundStatePaths, ...(CAMERA_ROUND_STATE_PATHS[roundKey] || [])].forEach((path) => {
      onValue(ref(db, path), (snap) => {
        roundStates[roundKey] = chooseFreshestRoundState(roundStates[roundKey], snap.val() || {});
        reconcile();
      });
    });
  });
  onValue(ref(db, CAMERA_PRESENCE_PATH), (snap) => {
    presence = snap.val() || {};
    reconcile();
  });
  window.addEventListener("beforeunload", () => {
    peers.forEach((entry) => { if (entry.signalPath) remove(ref(db, entry.signalPath)); closePeer(entry); });
  });

  return { refresh: reconcile };
}
