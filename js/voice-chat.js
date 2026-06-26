import { db, ref, set, onValue, onChildAdded, onChildRemoved, onDisconnect, update, remove } from "./firebase.js";

const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
const VOICE_ROOT = "voiceChat";
const HEARTBEAT_MS = 10000;
const STALE_MS = 35000;
const SIGNAL_TTL_MS = 120000;
const DEFAULT_ROOM_ID = "main";

function safeKey(value) {
  return String(value || "").replace(/[.#$\[\]/]/g, "_").slice(0, 120);
}

function createId(prefix) {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return safeKey(`${prefix}_${Date.now().toString(36)}_${bytes[0].toString(36)}${bytes[1].toString(36)}`);
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

function setText(element, value) {
  if (element) element.textContent = value;
}

function setHidden(element, hidden) {
  element?.classList.toggle("hidden", hidden);
}

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

async function createProcessedMicrophoneStream({ status, deviceId }) {
  const audioConstraints = {
    echoCancellation: true,
    autoGainControl: false,
    noiseSuppression: true,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    latency: { ideal: 0.01 },
  };
  if (deviceId) audioConstraints.deviceId = { exact: deviceId };
  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
    video: false,
  });

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return { rawStream, outputStream: rawStream, audioContext: null, rnnoiseActive: false };

  const audioContext = new AudioContextCtor({ latencyHint: "interactive", sampleRate: 48000 });
  const source = audioContext.createMediaStreamSource(rawStream);
  let currentNode = source;
  let rnnoiseActive = false;

  if (audioContext.audioWorklet) {
    try {
      await audioContext.audioWorklet.addModule("js/rnnoise-worklet.js");
      const rnnoiseNode = new AudioWorkletNode(audioContext, "rnnoise-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      const wasmResponse = await fetch("wasm/rnnoise.wasm", { cache: "force-cache" });
      if (!wasmResponse.ok) throw new Error("RNNoise WASM introuvable");
      const rnnoiseReady = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 1200);
        rnnoiseNode.port.onmessage = (event) => {
          if (!["ready", "fallback"].includes(event.data?.type)) return;
          clearTimeout(timeout);
          resolve(Boolean(event.data?.active));
        };
      });
      rnnoiseNode.port.postMessage({ type: "load", wasm: await wasmResponse.arrayBuffer() });
      rnnoiseActive = await rnnoiseReady;
      if (!rnnoiseActive) throw new Error("RNNoise WASM non initialisé");
      currentNode.connect(rnnoiseNode);
      currentNode = rnnoiseNode;
    } catch (error) {
      setText(status, "Vocal actif. RNNoise indisponible.");
    }
  }

  const highPass = audioContext.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 90;
  highPass.Q.value = 0.75;

  const presence = audioContext.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3200;
  presence.Q.value = 0.8;
  presence.gain.value = 2.2;

  const lowPass = audioContext.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = 15500;
  lowPass.Q.value = 0.7;

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -30;
  compressor.knee.value = 22;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.14;

  const gain = audioContext.createGain();
  gain.gain.value = 1.08;

  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 24;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.06;

  const destination = audioContext.createMediaStreamDestination();
  currentNode.connect(highPass).connect(presence).connect(lowPass).connect(compressor).connect(gain).connect(limiter).connect(destination);
  return { rawStream, outputStream: destination.stream, audioContext, rnnoiseActive };
}

export function createVoiceChatController({ elements, getUserId, getDisplayName, getRoomId = () => DEFAULT_ROOM_ID }) {
  const state = {
    joined: false,
    muted: false,
    clientId: createId("voice"),
    roomId: DEFAULT_ROOM_ID,
    rawStream: null,
    localStream: null,
    audioContext: null,
    peers: new Map(),
    participants: {},
    heartbeat: null,
    unsubPresence: null,
    unsubSignals: null,
    unsubSignalRemoved: null,
    analyser: null,
    speakingRaf: 0,
    levelRaf: 0,
    selectedDeviceId: "",
    monitorEnabled: false,
    monitorAudio: null,
  };

  function render() {
    elements.joinButton.textContent = state.joined ? "Quitter le vocal" : "Rejoindre le vocal";
    elements.joinButton.disabled = false;
    elements.muteButton.disabled = !state.joined;
    elements.muteButton.textContent = state.muted ? "Unmute" : "Mute";
    if (elements.monitorButton) {
      elements.monitorButton.disabled = !state.joined;
      elements.monitorButton.textContent = state.monitorEnabled ? "Couper retour" : "Retour voix";
    }
    setHidden(elements.panel, false);
    const activePeople = Object.values(state.participants).filter((p) => Date.now() - Number(p.updatedAt || 0) < STALE_MS);
    elements.list.replaceChildren(...activePeople.map((participant) => {
      const item = document.createElement("li");
      item.className = participant.speaking ? "speaking" : "";
      item.textContent = `${participant.nickname || "Invité"}${participant.muted ? " · mute" : ""}`;
      return item;
    }));
    if (!activePeople.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "Aucun participant.";
      elements.list.append(empty);
    }
    elements.speaking?.classList.toggle("active", Boolean(state.participants[state.clientId]?.speaking));
  }

  async function refreshMicrophones() {
    if (!navigator.mediaDevices?.enumerateDevices || !elements.deviceSelect) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter((device) => device.kind === "audioinput");
    elements.deviceSelect.replaceChildren(...microphones.map((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Micro ${index + 1}`;
      return option;
    }));
    if (state.selectedDeviceId && microphones.some((device) => device.deviceId === state.selectedDeviceId)) {
      elements.deviceSelect.value = state.selectedDeviceId;
    } else {
      state.selectedDeviceId = elements.deviceSelect.value || "";
    }
    setHidden(elements.deviceField, microphones.length === 0);
  }

  async function writePresence(extra = {}) {
    if (!state.joined) return;
    const presenceRef = ref(db, `${VOICE_ROOT}/rooms/${state.roomId}/presence/${state.clientId}`);
    const payload = {
      id: state.clientId,
      userId: safeKey(getUserId() || state.clientId),
      nickname: String(getDisplayName() || "Invité").slice(0, 40),
      muted: state.muted,
      speaking: Boolean(extra.speaking),
      updatedAt: Date.now(),
      ...extra,
    };
    await set(presenceRef, payload);
  }

  function startSpeakingMeter() {
    cancelAnimationFrame(state.speakingRaf);
    cancelAnimationFrame(state.levelRaf);
    const track = state.localStream?.getAudioTracks?.()[0];
    if (!state.audioContext || !track) return;
    const source = state.audioContext.createMediaStreamSource(new MediaStream([track]));
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 512;
    source.connect(state.analyser);
    const data = new Uint8Array(state.analyser.fftSize);
    let lastSpeaking = false;
    let lastWrite = 0;
    const tick = () => {
      state.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const sample of data) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const level = Math.sqrt(sum / data.length);
      const speaking = !state.muted && level > 0.03;
      if (elements.level) elements.level.style.transform = `scaleX(${Math.min(1, level * 8).toFixed(3)})`;
      if (speaking !== lastSpeaking || Date.now() - lastWrite > 2500) {
        lastSpeaking = speaking;
        lastWrite = Date.now();
        writePresence({ speaking }).catch(console.warn);
      }
      state.speakingRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  function closePeer(peerId, removeSignal = false) {
    const entry = state.peers.get(peerId);
    entry?.unsubAnswer?.(); entry?.unsubCandidates?.(); entry?.unsubOffer?.();
    try { entry?.pc?.close(); } catch {}
    if (entry?.audio) entry.audio.remove();
    state.peers.delete(peerId);
    if (removeSignal) remove(ref(db, `${VOICE_ROOT}/rooms/${state.roomId}/signals/${state.clientId}_${peerId}`)).catch(() => {});
  }

  async function ensurePeer(remoteId, initiator) {
    if (!state.joined || remoteId === state.clientId || state.peers.has(remoteId)) return;
    const signalId = initiator ? `${state.clientId}_${remoteId}` : `${remoteId}_${state.clientId}`;
    const signalPath = `${VOICE_ROOT}/rooms/${state.roomId}/signals/${signalId}`;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audio = new Audio();
    audio.autoplay = true;
    const entry = { pc, audio };
    state.peers.set(remoteId, entry);
    state.localStream.getAudioTracks().forEach((track) => pc.addTrack(track, state.localStream));
    pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };
    pc.onicecandidate = async (event) => {
      const candidate = toPlainCandidate(event.candidate);
      if (!candidate) return;
      await set(ref(db, `${signalPath}/${initiator ? "offerCandidates" : "answerCandidates"}/${safeKey(`${Date.now()}_${Math.random()}`)}`), candidate);
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) setTimeout(() => closePeer(remoteId, true), 2000);
    };

    if (initiator) {
      entry.unsubAnswer = onValue(ref(db, `${signalPath}/answer`), async (snap) => {
        const answer = snap.val();
        if (!answer || pc.remoteDescription || pc.signalingState === "closed") return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.warn);
      });
      entry.unsubCandidates = onChildAdded(ref(db, `${signalPath}/answerCandidates`), (snap) => pc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(console.warn));
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      await update(ref(db, signalPath), { from: state.clientId, to: remoteId, offer: toPlainDescription(pc.localDescription), createdAt: Date.now() });
    } else {
      entry.unsubOffer = onValue(ref(db, signalPath), async (snap) => {
        const signal = snap.val();
        if (!signal?.offer || Date.now() - Number(signal.createdAt || 0) > SIGNAL_TTL_MS || pc.remoteDescription) return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await update(ref(db, signalPath), { answer: toPlainDescription(pc.localDescription), answeredAt: Date.now() });
      });
      entry.unsubCandidates = onChildAdded(ref(db, `${signalPath}/offerCandidates`), (snap) => pc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(console.warn));
    }
  }

  function watchRoom() {
    state.unsubPresence = onValue(ref(db, `${VOICE_ROOT}/rooms/${state.roomId}/presence`), (snap) => {
      state.participants = snap.val() || {};
      for (const [remoteId, participant] of Object.entries(state.participants)) {
        if (remoteId !== state.clientId && Date.now() - Number(participant.updatedAt || 0) < STALE_MS) {
          ensurePeer(remoteId, state.clientId < remoteId).catch(console.warn);
        }
      }
      for (const peerId of state.peers.keys()) if (!state.participants[peerId]) closePeer(peerId, true);
      render();
    });
    state.unsubSignalRemoved = onChildRemoved(ref(db, `${VOICE_ROOT}/rooms/${state.roomId}/signals`), (snap) => {
      const peerId = snap.key?.replace(`${state.clientId}_`, "").replace(`_${state.clientId}`, "");
      if (peerId) closePeer(peerId, false);
    });
  }

  async function join() {
    if (state.joined) return leave();
    if (!navigator.mediaDevices?.getUserMedia) { setText(elements.status, "Micro indisponible."); return; }
    elements.joinButton.disabled = true;
    setText(elements.status, "Connexion vocal…");
    state.roomId = safeKey(getRoomId() || DEFAULT_ROOM_ID);
    const processed = await createProcessedMicrophoneStream({ status: elements.status, deviceId: state.selectedDeviceId });
    state.rawStream = processed.rawStream;
    state.localStream = processed.outputStream;
    state.audioContext = processed.audioContext;
    state.joined = true;
    state.muted = false;
    state.localStream.getAudioTracks().forEach((track) => { track.enabled = true; });
    const presenceRef = ref(db, `${VOICE_ROOT}/rooms/${state.roomId}/presence/${state.clientId}`);
    onDisconnect(presenceRef).remove().catch(() => {});
    await writePresence({ rnnoise: processed.rnnoiseActive });
    state.heartbeat = setInterval(() => writePresence().catch(console.warn), HEARTBEAT_MS);
    watchRoom();
    startSpeakingMeter();
    setText(elements.status, processed.rnnoiseActive ? "Vocal actif. RNNoise actif." : "Vocal actif. RNNoise indisponible.");
    await refreshMicrophones().catch(console.warn);
    render();
  }

  function syncMonitor() {
    if (state.monitorAudio) {
      state.monitorAudio.pause();
      state.monitorAudio.srcObject = null;
      state.monitorAudio.remove();
      state.monitorAudio = null;
    }
    if (!state.joined || !state.monitorEnabled || !state.localStream) return;
    state.monitorAudio = new Audio();
    state.monitorAudio.autoplay = true;
    state.monitorAudio.muted = false;
    state.monitorAudio.srcObject = state.localStream;
    state.monitorAudio.play?.().catch(console.warn);
  }

  async function leave() {
    state.joined = false;
    clearInterval(state.heartbeat);
    cancelAnimationFrame(state.speakingRaf);
    state.unsubPresence?.(); state.unsubSignals?.(); state.unsubSignalRemoved?.();
    for (const peerId of [...state.peers.keys()]) closePeer(peerId, true);
    await remove(ref(db, `${VOICE_ROOT}/rooms/${state.roomId}/presence/${state.clientId}`)).catch(() => {});
    state.monitorEnabled = false;
    syncMonitor();
    stopStream(state.rawStream); stopStream(state.localStream);
    await state.audioContext?.close?.().catch(() => {});
    state.rawStream = null; state.localStream = null; state.audioContext = null; state.participants = {};
    if (elements.level) elements.level.style.transform = "scaleX(0)";
    setText(elements.status, "Vocal déconnecté.");
    render();
  }

  function toggleMute() {
    if (!state.joined) return;
    state.muted = !state.muted;
    state.localStream.getAudioTracks().forEach((track) => { track.enabled = !state.muted; });
    writePresence({ speaking: false }).catch(console.warn);
    render();
  }

  async function changeMicrophone() {
    state.selectedDeviceId = elements.deviceSelect?.value || "";
    if (!state.joined) return;
    await leave();
    await join();
  }

  function toggleMonitor() {
    if (!state.joined) return;
    state.monitorEnabled = !state.monitorEnabled;
    syncMonitor();
    render();
  }

  elements.joinButton?.addEventListener("click", join);
  elements.muteButton?.addEventListener("click", toggleMute);
  elements.deviceSelect?.addEventListener("change", () => changeMicrophone().catch(console.warn));
  elements.monitorButton?.addEventListener("click", toggleMonitor);
  navigator.mediaDevices?.addEventListener?.("devicechange", () => refreshMicrophones().catch(console.warn));
  refreshMicrophones().catch(console.warn);
  window.addEventListener("beforeunload", () => { if (state.joined) remove(ref(db, `${VOICE_ROOT}/rooms/${state.roomId}/presence/${state.clientId}`)); });
  render();
  return { join, leave, toggleMute };
}
