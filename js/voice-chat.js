import { db, ref, set, onValue, onChildAdded, onChildRemoved, onDisconnect, update, remove } from "./firebase.js";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceCandidatePoolSize: 4,
};
const VOICE_ROOT = "voiceChat";
const HEARTBEAT_MS = 10000;
const STALE_MS = 35000;
const SIGNAL_TTL_MS = 120000;
const RECONNECT_DELAY_MS = 1200;
const DEFAULT_ROOM_ID = "main";
const SETTINGS_KEY = "zogquiz.voice.settings";

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

function normalizeKeyCode(code) {
  return String(code || DEFAULT_MUTE_KEY).trim() || DEFAULT_MUTE_KEY;
}

function formatKeyLabel(code) {
  const normalized = normalizeKeyCode(code);
  if (normalized === "Space") return "Espace";
  if (normalized.startsWith("Key")) return normalized.slice(3).toUpperCase();
  if (normalized.startsWith("Digit")) return normalized.slice(5);
  return normalized;
}

function preferContinuousOpus(sdp = "") {
  return sdp.replace(/a=fmtp:(\d+) ([^\r\n]*useinbandfec=1[^\r\n]*)/g, (line) => {
    let next = line;
    if (!/maxaveragebitrate=/.test(next)) next += ";maxaveragebitrate=128000";
    if (!/stereo=/.test(next)) next += ";stereo=0";
    if (!/usedtx=/.test(next)) next += ";usedtx=0";
    return next;
  });
}

const NOISE_REDUCTION_MODES = {
  off: { label: "Off", rnnoise: false, strength: 0, attenuation: 1, sensitivity: 1, highPass: 80, lowPass: 16000, rumbleCut: 0, hissCut: 0 },
  standard: { label: "Standard", rnnoise: true, strength: 0.46, attenuation: 0.42, sensitivity: 1, highPass: 85, lowPass: 14000, rumbleCut: -2.5, hissCut: -1.5 },
  strong: { label: "Forte", rnnoise: true, strength: 0.62, attenuation: 0.3, sensitivity: 0.96, highPass: 95, lowPass: 12000, rumbleCut: -4, hissCut: -2.5 },
};

const DEFAULT_MUTE_KEY = "KeyM";
const DEFAULT_VOICE_SETTINGS = {
  noiseReduction: "standard",
  micSensitivity: 1,
  muteKeyCode: DEFAULT_MUTE_KEY,
};

function getNoiseMode(value) {
  return NOISE_REDUCTION_MODES[value] ? value : "standard";
}

function clampMicSensitivity(value) {
  return Math.min(1.4, Math.max(0.7, Number(value) || 1));
}

function clampRemoteVolume(value) {
  return Math.min(2.5, Math.max(0, Number(value) || 0));
}

function loadVoiceSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      noiseReduction: getNoiseMode(saved.noiseReduction),
      micSensitivity: clampMicSensitivity(saved.micSensitivity),
      selectedDeviceId: String(saved.selectedDeviceId || ""),
      muteKeyCode: normalizeKeyCode(saved.muteKeyCode || DEFAULT_MUTE_KEY),
      remoteVolumes: Object.fromEntries(Object.entries(saved.remoteVolumes || {}).map(([key, value]) => [safeKey(key), clampRemoteVolume(value)])),
    };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS, selectedDeviceId: "", remoteVolumes: {} };
  }
}

function saveVoiceSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function voiceStatus(processed, settings) {
  if (settings.noiseReduction === "off") return "Vocal actif.";
  return processed.rnnoiseActive ? "Vocal actif. Traitement actif." : "Vocal actif. Traitement indisponible.";
}

async function createProcessedMicrophoneStream({ status, deviceId, settings = DEFAULT_VOICE_SETTINGS }) {
  const noiseReduction = getNoiseMode(settings.noiseReduction);
  const mode = NOISE_REDUCTION_MODES[noiseReduction];
  const micSensitivity = clampMicSensitivity(settings.micSensitivity);
  const audioConstraints = {
    echoCancellation: { ideal: true },
    autoGainControl: { ideal: false },
    noiseSuppression: mode.rnnoise ? false : { ideal: true },
    channelCount: { ideal: 1, max: 1 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    latency: { ideal: 0.02 },
  };
  if (deviceId) audioConstraints.deviceId = { exact: deviceId };
  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
    video: false,
  });

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return { rawStream, outputStream: rawStream, audioContext: null, rnnoiseActive: false };

  const audioContext = new AudioContextCtor({ latencyHint: "interactive", sampleRate: 48000 });
  rawStream.getAudioTracks().forEach((track) => { track.contentHint = "speech"; });
  const source = audioContext.createMediaStreamSource(rawStream);
  let currentNode = source;
  let rnnoiseActive = false;

  if (mode.rnnoise && audioContext.audioWorklet) {
    try {
      await audioContext.audioWorklet.addModule("js/rnnoise-worklet.js");
      const rnnoiseNode = new AudioWorkletNode(audioContext, "rnnoise-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          mode: noiseReduction,
          strength: mode.strength,
          attenuation: mode.attenuation,
          micSensitivity,
        },
      });
      const rnnoiseReady = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 1500);
        rnnoiseNode.port.onmessage = (event) => {
          if (!["ready", "fallback"].includes(event.data?.type)) return;
          clearTimeout(timeout);
          resolve(Boolean(event.data?.active));
        };
      });
      rnnoiseNode.port.postMessage({ type: "load", wasmUrl: "wasm/rnnoise.wasm", mode: noiseReduction });
      rnnoiseActive = await rnnoiseReady;
      if (!rnnoiseActive) throw new Error("RNNoise indisponible");
      currentNode.connect(rnnoiseNode);
      currentNode = rnnoiseNode;
    } catch (error) {
      setText(status, "Vocal actif. Traitement indisponible.");
    }
  }

  const highPass = audioContext.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = rnnoiseActive ? mode.highPass : 105;
  highPass.Q.value = 0.82;

  const rumbleCut = audioContext.createBiquadFilter();
  rumbleCut.type = "lowshelf";
  rumbleCut.frequency.value = 180;
  rumbleCut.Q.value = 0.7;
  rumbleCut.gain.value = rnnoiseActive ? mode.rumbleCut : -3.5;

  const keyboardCut = audioContext.createBiquadFilter();
  keyboardCut.type = "peaking";
  keyboardCut.frequency.value = 2800;
  keyboardCut.Q.value = 3.8;
  keyboardCut.gain.value = rnnoiseActive ? -2.2 : -4.2;

  const mouseCut = audioContext.createBiquadFilter();
  mouseCut.type = "peaking";
  mouseCut.frequency.value = 5600;
  mouseCut.Q.value = 4.2;
  mouseCut.gain.value = rnnoiseActive ? -2.4 : -4.8;

  const hissCut = audioContext.createBiquadFilter();
  hissCut.type = "highshelf";
  hissCut.frequency.value = 6200;
  hissCut.Q.value = 0.7;
  hissCut.gain.value = rnnoiseActive ? mode.hissCut : -3;

  const lowPass = audioContext.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = rnnoiseActive ? mode.lowPass : 9500;
  lowPass.Q.value = 0.72;

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 30;
  compressor.ratio.value = 1.55;
  compressor.attack.value = 0.018;
  compressor.release.value = 0.22;

  const gain = audioContext.createGain();
  gain.gain.value = micSensitivity;

  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -2.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.0015;
  limiter.release.value = 0.08;

  const destination = audioContext.createMediaStreamDestination();
  currentNode.connect(highPass).connect(rumbleCut).connect(keyboardCut).connect(mouseCut).connect(hissCut).connect(lowPass).connect(compressor).connect(gain).connect(limiter).connect(destination);
  destination.stream.getAudioTracks().forEach((track) => { track.contentHint = "speech"; });
  return { rawStream, outputStream: destination.stream, audioContext, rnnoiseActive };
}

export function createVoiceChatController({ elements, getUserId, getDisplayName, getRoomId = () => DEFAULT_ROOM_ID }) {
  const initialSettings = loadVoiceSettings();
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
    analyserSource: null,
    speakingRaf: 0,
    levelRaf: 0,
    selectedDeviceId: initialSettings.selectedDeviceId,
    monitorEnabled: false,
    monitorAudio: null,
    voiceSettings: { noiseReduction: initialSettings.noiseReduction, micSensitivity: initialSettings.micSensitivity },
    remoteVolumes: { ...(initialSettings.remoteVolumes || {}) },
    muteKeyCode: normalizeKeyCode(initialSettings.muteKeyCode),
    capturingMuteKey: false,
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
    if (elements.noiseReductionSelect) elements.noiseReductionSelect.value = state.voiceSettings.noiseReduction;
    if (elements.micSensitivity) elements.micSensitivity.value = String(state.voiceSettings.micSensitivity);
    if (elements.muteKeyButton) elements.muteKeyButton.textContent = state.capturingMuteKey ? "Appuyez sur une touche…" : formatKeyLabel(state.muteKeyCode);
    setHidden(elements.panel, false);
    const activePeople = Object.values(state.participants).filter((p) => Date.now() - Number(p.updatedAt || 0) < STALE_MS);
    elements.list.replaceChildren(...activePeople.map((participant) => {
      const item = document.createElement("li");
      item.className = participant.speaking ? "speaking" : "";
      const name = document.createElement("span");
      name.textContent = `${participant.nickname || "Invité"}${participant.muted ? " · mute" : ""}`;
      item.append(name);
      if (participant.id !== state.clientId) {
        const volume = document.createElement("input");
        volume.type = "range";
        volume.min = "0";
        volume.max = "2.5";
        volume.step = "0.05";
        volume.value = String(getRemoteVolume(participant.id));
        volume.className = "voice-volume-control";
        volume.setAttribute("aria-label", `Volume ${participant.nickname || "Invité"}`);
        volume.addEventListener("input", () => setRemoteVolume(participant.id, volume.value));
        item.append(volume);
      }
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
      persistSettings();
    }
    setHidden(elements.deviceField, microphones.length === 0);
  }


  function persistSettings() {
    saveVoiceSettings({ ...state.voiceSettings, selectedDeviceId: state.selectedDeviceId, muteKeyCode: state.muteKeyCode, remoteVolumes: state.remoteVolumes });
  }

  function getRemoteVolume(peerId) {
    return clampRemoteVolume(state.remoteVolumes[safeKey(peerId)] ?? 1);
  }

  function applyRemoteVolume(peerId) {
    const entry = state.peers.get(peerId);
    if (entry?.gainNode) entry.gainNode.gain.value = getRemoteVolume(peerId);
    else if (entry?.audio) entry.audio.volume = Math.min(1, getRemoteVolume(peerId));
  }

  function setRemoteVolume(peerId, value) {
    state.remoteVolumes[safeKey(peerId)] = clampRemoteVolume(value);
    applyRemoteVolume(peerId);
    persistSettings();
  }

  function currentLocalTrack() {
    return state.localStream?.getAudioTracks?.()[0] || null;
  }

  async function rebuildLocalAudio() {
    const previousRaw = state.rawStream;
    const previousLocal = state.localStream;
    const previousContext = state.audioContext;
    const processed = await createProcessedMicrophoneStream({
      status: elements.status,
      deviceId: state.selectedDeviceId,
      settings: state.voiceSettings,
    });
    state.rawStream = processed.rawStream;
    state.localStream = processed.outputStream;
    state.audioContext = processed.audioContext;
    state.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !state.muted;
      track.contentHint = "speech";
    });
    stopStream(previousRaw);
    stopStream(previousLocal);
    await previousContext?.close?.().catch(() => {});
    startSpeakingMeter();
    syncMonitor();
    return processed;
  }

  async function replacePeerTracks() {
    const track = currentLocalTrack();
    if (!track) return;
    for (const entry of state.peers.values()) {
      const sender = entry.pc.getSenders?.().find((rtcSender) => rtcSender.track?.kind === "audio");
      await sender?.replaceTrack?.(track).catch(console.warn);
    }
  }

  async function writePresence(extra = {}) {
    if (!state.joined) return;
    const presenceRef = ref(db, `${VOICE_ROOT}/rooms/${state.roomId}/presence/${state.clientId}`);
    const payload = {
      id: state.clientId,
      userId: safeKey(getUserId() || state.clientId),
      nickname: String(getDisplayName() || "Invité").slice(0, 40),
      muted: state.muted,
      speaking: typeof extra.speaking === "boolean" ? extra.speaking : Boolean(state.participants[state.clientId]?.speaking),
      updatedAt: Date.now(),
      ...extra,
    };
    await set(presenceRef, payload);
  }

  function startSpeakingMeter() {
    cancelAnimationFrame(state.speakingRaf);
    cancelAnimationFrame(state.levelRaf);
    state.analyserSource?.disconnect?.();
    const track = state.localStream?.getAudioTracks?.()[0];
    if (!state.audioContext || !track) return;
    state.analyserSource = state.audioContext.createMediaStreamSource(new MediaStream([track]));
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 1024;
    state.analyser.smoothingTimeConstant = 0.72;
    state.analyserSource.connect(state.analyser);
    const data = new Uint8Array(state.analyser.fftSize);
    let noiseFloor = 0.012;
    let holdUntil = 0;
    let lastSpeaking = false;
    let lastWrite = 0;
    const tick = () => {
      state.analyser.getByteTimeDomainData(data);
      let sum = 0;
      let peak = 0;
      let zeroCrossings = 0;
      let previous = 0;
      for (let i = 0; i < data.length; i += 1) {
        const normalized = (data[i] - 128) / 128;
        sum += normalized * normalized;
        peak = Math.max(peak, Math.abs(normalized));
        if ((normalized >= 0 && previous < 0) || (normalized < 0 && previous >= 0)) zeroCrossings += 1;
        previous = normalized;
      }
      const level = Math.sqrt(sum / data.length);
      const zcr = zeroCrossings / data.length;
      const transientOnly = peak > Math.max(0.045, level * 6.5) && zcr > 0.2;
      const floorRate = level > noiseFloor * 2.4 && !transientOnly ? 0.002 : 0.04;
      noiseFloor = Math.min(0.05, Math.max(0.004, (noiseFloor * (1 - floorRate)) + (Math.min(level, 0.08) * floorRate)));
      const voiceLevel = level > Math.max(0.018, noiseFloor * 2.15);
      const voiceShape = zcr > 0.018 && zcr < 0.24;
      const voiceDetected = !state.muted && voiceLevel && voiceShape && !transientOnly;
      const now = Date.now();
      if (voiceDetected) holdUntil = now + 520;
      const speaking = !state.muted && (voiceDetected || now < holdUntil);
      if (elements.level) elements.level.style.transform = `scaleX(${Math.min(1, level * 7).toFixed(3)})`;
      if (speaking !== lastSpeaking || now - lastWrite > 2500) {
        lastSpeaking = speaking;
        lastWrite = now;
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
    entry?.remoteSource?.disconnect?.();
    entry?.gainNode?.disconnect?.();
    try { entry?.remoteContext?.close?.(); } catch {}
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
    audio.playsInline = true;
    const entry = { pc, audio, pendingCandidates: [] };
    state.peers.set(remoteId, entry);
    state.localStream?.getAudioTracks().forEach((track) => {
      track.contentHint = "speech";
      const sender = pc.addTrack(track, state.localStream);
      const parameters = sender.getParameters?.() || {};
      parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      parameters.encodings[0] = { ...parameters.encodings[0], maxBitrate: 128000, priority: "high", networkPriority: "high", dtx: false };
      sender.setParameters?.(parameters).catch(() => {});
    });
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioContextCtor) {
        try {
          entry.remoteContext = entry.remoteContext || new AudioContextCtor({ latencyHint: "interactive" });
          entry.remoteSource?.disconnect?.();
          entry.gainNode?.disconnect?.();
          entry.remoteSource = entry.remoteContext.createMediaStreamSource(stream);
          entry.gainNode = entry.remoteContext.createGain();
          const destination = entry.remoteContext.createMediaStreamDestination();
          entry.remoteSource.connect(entry.gainNode).connect(destination);
          audio.srcObject = destination.stream;
          applyRemoteVolume(remoteId);
        } catch {
          audio.srcObject = stream;
          applyRemoteVolume(remoteId);
        }
      } else {
        audio.srcObject = stream;
        applyRemoteVolume(remoteId);
      }
      audio.play?.().catch(() => setText(elements.status, "Vocal actif. Cliquez sur la page si l'écoute est bloquée."));
    };
    pc.onicecandidate = async (event) => {
      const candidate = toPlainCandidate(event.candidate);
      if (!candidate) return;
      await set(ref(db, `${signalPath}/${initiator ? "offerCandidates" : "answerCandidates"}/${safeKey(`${Date.now()}_${Math.random()}`)}`), candidate);
    };
    pc.onconnectionstatechange = () => {
      if (["connected", "completed"].includes(pc.connectionState)) setText(elements.status, "Vocal actif.");
      if (["failed", "disconnected"].includes(pc.connectionState)) {
        setText(elements.status, "Reconnexion vocal…");
        setTimeout(() => {
          if (!state.joined) return;
          closePeer(remoteId, true);
          ensurePeer(remoteId, state.clientId < remoteId).catch(console.warn);
        }, RECONNECT_DELAY_MS);
      }
      if (pc.connectionState === "closed") closePeer(remoteId, true);
    };

    async function flushPendingCandidates() {
      if (!pc.remoteDescription) return;
      const candidates = entry.pendingCandidates.splice(0);
      for (const candidate of candidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
      }
    }

    function addRemoteCandidate(candidate) {
      if (!candidate) return;
      if (!pc.remoteDescription) {
        entry.pendingCandidates.push(candidate);
        return;
      }
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
    }

    if (initiator) {
      entry.unsubAnswer = onValue(ref(db, `${signalPath}/answer`), async (snap) => {
        const answer = snap.val();
        if (!answer || pc.remoteDescription || pc.signalingState === "closed") return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.warn);
        await flushPendingCandidates();
      });
      entry.unsubCandidates = onChildAdded(ref(db, `${signalPath}/answerCandidates`), (snap) => addRemoteCandidate(snap.val()));
      pc.getTransceivers?.().forEach((transceiver) => {
        if (transceiver.sender?.track?.kind === "audio") transceiver.direction = "sendrecv";
      });
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      offer.sdp = preferContinuousOpus(offer.sdp);
      await pc.setLocalDescription(offer);
      await update(ref(db, signalPath), { from: state.clientId, to: remoteId, offer: toPlainDescription(pc.localDescription), createdAt: Date.now() });
    } else {
      entry.unsubOffer = onValue(ref(db, signalPath), async (snap) => {
        const signal = snap.val();
        if (!signal?.offer || Date.now() - Number(signal.createdAt || 0) > SIGNAL_TTL_MS || pc.remoteDescription) return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
        await flushPendingCandidates();
        const answer = await pc.createAnswer();
        answer.sdp = preferContinuousOpus(answer.sdp);
        await pc.setLocalDescription(answer);
        await update(ref(db, signalPath), { answer: toPlainDescription(pc.localDescription), answeredAt: Date.now() });
      });
      entry.unsubCandidates = onChildAdded(ref(db, `${signalPath}/offerCandidates`), (snap) => addRemoteCandidate(snap.val()));
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
      for (const peerId of state.peers.keys()) {
        const participant = state.participants[peerId];
        if (!participant || Date.now() - Number(participant.updatedAt || 0) >= STALE_MS) closePeer(peerId, true);
      }
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
    let processed;
    try {
      processed = await rebuildLocalAudio();
    } catch (error) {
      elements.joinButton.disabled = false;
      const denied = ["NotAllowedError", "SecurityError"].includes(error?.name);
      const missing = ["NotFoundError", "OverconstrainedError"].includes(error?.name);
      setText(elements.status, denied ? "Micro refusé." : missing ? "Micro introuvable." : "Erreur micro.");
      render();
      return;
    }
    state.joined = true;
    state.muted = false;
    state.localStream?.getAudioTracks().forEach((track) => { track.enabled = true; });
    const presenceRef = ref(db, `${VOICE_ROOT}/rooms/${state.roomId}/presence/${state.clientId}`);
    onDisconnect(presenceRef).remove().catch(() => {});
    await writePresence({ voiceProcessing: processed.rnnoiseActive, noiseReduction: state.voiceSettings.noiseReduction });
    state.heartbeat = setInterval(() => writePresence().catch(console.warn), HEARTBEAT_MS);
    watchRoom();
    startSpeakingMeter();
    setText(elements.status, voiceStatus(processed, state.voiceSettings));
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
    state.analyserSource?.disconnect?.();
    state.analyserSource = null;
    state.analyser = null;
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
    state.localStream?.getAudioTracks().forEach((track) => { track.enabled = !state.muted; });
    writePresence({ speaking: false }).catch(console.warn);
    render();
  }

  async function changeMicrophone() {
    state.selectedDeviceId = elements.deviceSelect?.value || "";
    persistSettings();
    if (!state.joined) return;
    const processed = await rebuildLocalAudio();
    await replacePeerTracks();
    await writePresence({ voiceProcessing: processed.rnnoiseActive, noiseReduction: state.voiceSettings.noiseReduction });
    setText(elements.status, voiceStatus(processed, state.voiceSettings));
  }

  async function changeVoiceSettings() {
    state.voiceSettings.noiseReduction = getNoiseMode(elements.noiseReductionSelect?.value || state.voiceSettings.noiseReduction);
    state.voiceSettings.micSensitivity = clampMicSensitivity(elements.micSensitivity?.value || state.voiceSettings.micSensitivity);
    persistSettings();
    if (!state.joined) return;
    const processed = await rebuildLocalAudio();
    await replacePeerTracks();
    await writePresence({ voiceProcessing: processed.rnnoiseActive, noiseReduction: state.voiceSettings.noiseReduction });
    setText(elements.status, voiceStatus(processed, state.voiceSettings));
  }

  function toggleMonitor() {
    if (!state.joined) return;
    state.monitorEnabled = !state.monitorEnabled;
    syncMonitor();
    render();
  }

  function startMuteKeyCapture() {
    state.capturingMuteKey = true;
    render();
  }

  function handleMuteKeyDown(event) {
    const pressedCode = normalizeKeyCode(event.code || event.key);
    if (state.capturingMuteKey) {
      event.preventDefault();
      state.muteKeyCode = pressedCode;
      state.capturingMuteKey = false;
      persistSettings();
      render();
      return;
    }
    const target = event.target;
    const isTyping = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "");
    if (isTyping || event.ctrlKey || event.altKey || event.metaKey || pressedCode !== state.muteKeyCode) return;
    event.preventDefault();
    toggleMute();
  }

  elements.joinButton?.addEventListener("click", join);
  elements.muteButton?.addEventListener("click", toggleMute);
  elements.muteKeyButton?.addEventListener("click", startMuteKeyCapture);
  elements.deviceSelect?.addEventListener("change", () => changeMicrophone().catch(console.warn));
  elements.monitorButton?.addEventListener("click", toggleMonitor);
  elements.noiseReductionSelect?.addEventListener("change", () => changeVoiceSettings().catch(console.warn));
  elements.micSensitivity?.addEventListener("change", () => changeVoiceSettings().catch(console.warn));
  document.addEventListener("keydown", handleMuteKeyDown);
  navigator.mediaDevices?.addEventListener?.("devicechange", () => refreshMicrophones().catch(console.warn));
  refreshMicrophones().catch(console.warn);
  window.addEventListener("beforeunload", () => { if (state.joined) remove(ref(db, `${VOICE_ROOT}/rooms/${state.roomId}/presence/${state.clientId}`)); });
  render();
  return { join, leave, toggleMute };
}
