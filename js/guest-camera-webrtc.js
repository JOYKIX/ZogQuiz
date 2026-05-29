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
import { CAMERA_PRESENCE_PATH, CAMERA_SIGNALING_PATH, watchCameraConfig } from "./camera-config.js";

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

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function closePeer(entry) {
  entry?.unsubscribeAnswer?.();
  entry?.unsubscribeCandidates?.();
  entry?.unsubscribeOffer?.();
  entry?.unsubscribeSignal?.();
  try { entry?.pc?.close(); } catch {}
}

export function createGuestCameraController({ getSessionId, getNickname, elements }) {
  const state = {
    stream: null,
    status: "off",
    peers: new Map(),
    unsubscribeRequests: null,
    unsubscribeRequestRemovals: null,
    heartbeat: null,
  };

  function render(status = state.status, text = "") {
    state.status = status;
    const active = status === "active" || status === "starting";
    elements.button.disabled = status === "starting";
    elements.button.textContent = active ? "Désactiver la caméra" : "Activer la caméra";
    elements.status.className = `message camera-status ${status}`;
    elements.status.textContent = text || {
      off: "Caméra désactivée.",
      starting: "Demande d’autorisation caméra…",
      active: "Caméra active : flux prêt pour les overlays OBS.",
      error: "Erreur caméra.",
    }[status] || "";
    elements.preview.classList.toggle("hidden", !state.stream);
    if (state.stream && elements.preview.srcObject !== state.stream) elements.preview.srcObject = state.stream;
  }

  async function writePresence() {
    const sessionId = getSessionId();
    if (!sessionId || !state.stream) return;
    const presenceRef = ref(db, `${CAMERA_PRESENCE_PATH}/${safeKey(sessionId)}`);
    await set(presenceRef, {
      sessionId: safeKey(sessionId),
      nickname: String(getNickname() || "Invité").slice(0, 40),
      active: true,
      tracks: state.stream.getVideoTracks().map((track) => ({ id: track.id, label: track.label, enabled: track.enabled })),
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

  async function createOfferForRequest(requestId, request) {
    if (!state.stream || !getSessionId()) return;
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
    const sessionId = getSessionId();
    if (!sessionId) return;
    const requestsRef = ref(db, `${CAMERA_SIGNALING_PATH}/${safeKey(sessionId)}`);
    state.unsubscribeRequests = onChildAdded(requestsRef, (snap) => createOfferForRequest(snap.key, snap.val()).catch(console.warn));
    state.unsubscribeRequestRemovals = onChildRemoved(requestsRef, (snap) => closeRequest(snap.key, false));
  }

  async function start() {
    if (!getSessionId()) { render("error", "Connectez-vous avant d’activer la caméra."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { render("error", "Caméra indisponible sur ce navigateur ou sans HTTPS."); return; }
    render("starting");
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
      render("active");
      await writePresence();
      await onDisconnect(ref(db, `${CAMERA_PRESENCE_PATH}/${safeKey(getSessionId())}`)).remove();
      startHeartbeat();
      watchRequests();
    } catch (error) {
      stopStream(state.stream);
      state.stream = null;
      render("error", error?.name === "NotAllowedError" ? "Permission caméra refusée." : `Impossible d’activer la caméra : ${error.message || error}`);
    }
  }

  async function stop({ keepMessage = false } = {}) {
    clearInterval(state.heartbeat);
    state.heartbeat = null;
    state.unsubscribeRequests?.();
    state.unsubscribeRequestRemovals?.();
    state.unsubscribeRequests = null;
    state.unsubscribeRequestRemovals = null;
    for (const requestId of [...state.peers.keys()]) await closeRequest(requestId, true);
    stopStream(state.stream);
    state.stream = null;
    await removePresence().catch(() => {});
    render("off", keepMessage ? "Caméra désactivée." : undefined);
  }

  elements.button.addEventListener("click", () => (state.stream ? stop({ keepMessage: true }) : start()));
  window.addEventListener("beforeunload", () => { stopStream(state.stream); removePresence(); });
  render("off");

  return { start, stop, isActive: () => Boolean(state.stream), refreshIdentity: writePresence };
}

export function initCameraOverlay(roundKey) {
  const overlayId = createClientId(`obs_${roundKey}`);
  const grid = document.getElementById("camera-grid");
  const status = document.getElementById("camera-overlay-status");
  const peers = new Map();
  let currentConfig = null;
  let presence = {};
  let retryTimer = null;

  function slotName(slot, nickname) {
    return slot?.label || nickname || "Invité";
  }

  function applyCardLayout(entry, slot) {
    if (!entry?.card || !slot) return;
    entry.card.style.left = `${slot.x}px`;
    entry.card.style.top = `${slot.y}px`;
    entry.card.style.width = `${slot.width}px`;
    entry.card.style.height = `${slot.height}px`;
    entry.card.style.borderRadius = `${slot.borderRadius}px`;
    entry.card.style.zIndex = String(slot.zIndex);
    entry.video.style.objectFit = slot.fit || "cover";
  }

  function applyConfig(config) {
    currentConfig = config;
    grid.classList.toggle("names-hidden", !config.showNames);
    grid.classList.toggle("disabled", !config.enabled);
    reconcile();
  }

  function activePresenceEntries() {
    const now = Date.now();
    return Object.entries(presence)
      .filter(([, item]) => item?.active && now - Number(item.updatedAt || 0) < PRESENCE_STALE_MS)
      .sort((a, b) => String(a[1].nickname || a[0]).localeCompare(String(b[1].nickname || b[0]), "fr"));
  }

  function desiredGuests() {
    if (!currentConfig?.enabled) return [];
    const activeEntries = activePresenceEntries();
    const activeById = new Map(activeEntries);
    const used = new Set();
    const slots = currentConfig.cameras || [];

    return slots.flatMap((slot, slotIndex) => {
      if (!slot.enabled) return [];
      let guestId = slot.guestId && activeById.has(slot.guestId) ? slot.guestId : "";
      if (!guestId) {
        const next = activeEntries.find(([candidateId]) => !used.has(candidateId));
        guestId = next?.[0] || "";
      }
      if (!guestId) return [];
      used.add(guestId);
      const item = activeById.get(guestId) || {};
      return [{ guestId, nickname: item.nickname || "Invité", slot, slotIndex }];
    });
  }

  function updateLayout() {
    peers.forEach((entry) => applyCardLayout(entry, entry.slot));
  }

  function ensureCard(guestId, nickname, slot, slotIndex) {
    let entry = peers.get(guestId);
    if (entry?.card) {
      entry.nickname = nickname;
      entry.slot = slot;
      entry.slotIndex = slotIndex;
      entry.name.textContent = slotName(slot, nickname);
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
    card.append(video, name);
    grid.append(card);
    entry = { ...(entry || {}), card, video, name, guestId, nickname, slot, slotIndex };
    peers.set(guestId, entry);
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
    const desired = desiredGuests();
    const desiredIds = new Set(desired.map((item) => item.guestId));
    for (const guestId of [...peers.keys()]) {
      if (!desiredIds.has(guestId)) disconnectGuest(guestId).catch(console.warn);
    }
    desired.forEach(({ guestId, nickname, slot, slotIndex }) => connectGuest(guestId, nickname, slot, slotIndex).catch(console.warn));
    if (status) status.textContent = currentConfig.enabled ? `${desired.length}/${currentConfig.cameraCount} caméra(s) invité(s)` : "Caméras désactivées pour cette manche";
    updateLayout();
  }

  watchCameraConfig(roundKey, applyConfig);
  onValue(ref(db, CAMERA_PRESENCE_PATH), (snap) => {
    presence = snap.val() || {};
    reconcile();
  });
  setInterval(reconcile, 10000);
  window.addEventListener("beforeunload", () => {
    peers.forEach((entry) => { if (entry.signalPath) remove(ref(db, entry.signalPath)); closePeer(entry); });
  });
}
