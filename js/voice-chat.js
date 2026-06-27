import { db, ref, set, onValue, onChildAdded, onChildRemoved, onDisconnect, update, remove } from "./firebase.js";

const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
const VOICE_PATH = "voice";
const PRESENCE_STALE_MS = 45000;
const HEARTBEAT_MS = 12000;
const SIGNAL_TTL_MS = 120000;
const DEFAULT_MUTE_KEYBIND = { type: "keyboard", code: "KeyM" };
const STORAGE_KEY = "zogquiz.voiceMuteKeybind.v1";
const DEVICE_STORAGE_KEY = "zogquiz.voiceMicrophoneDevice.v1";
const VOLUME_STORAGE_KEY = "zogquiz.voiceMicrophoneVolume.v1";
const THRESHOLD_STORAGE_KEY = "zogquiz.voiceMicrophoneThresholdDb.v1";
const COMPRESSOR_SETTINGS = { threshold: -20, knee: 18, ratio: 3, attack: 0.003, release: 0.08, outputGain: 1 };
const DEFAULT_VOLUME = 100;
const DEFAULT_THRESHOLD_DB = -45;
function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function safeKey(value) { return String(value || "").replace(/[.#$\[\]/]/g, "_").slice(0, 120); }
function plainDescription(description) { return description ? { type: description.type, sdp: description.sdp } : null; }
function plainCandidate(candidate) { return candidate?.toJSON ? candidate.toJSON() : candidate; }
function stopStream(stream) { stream?.getTracks?.().forEach((track) => track.stop()); }
function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "textarea" || tag === "select" || (tag === "input" && !["button", "checkbox", "radio", "range", "submit", "reset"].includes(String(target.type || "text").toLowerCase()));
}
function readKeybind() {
  try { return { ...DEFAULT_MUTE_KEYBIND, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}) }; } catch { return DEFAULT_MUTE_KEYBIND; }
}
function writeKeybind(binding) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(binding)); } catch {} }
function readDeviceId() { try { return localStorage.getItem(DEVICE_STORAGE_KEY) || ""; } catch { return ""; } }
function writeDeviceId(deviceId) { try { deviceId ? localStorage.setItem(DEVICE_STORAGE_KEY, deviceId) : localStorage.removeItem(DEVICE_STORAGE_KEY); } catch {} }
function readVolume() { try { return clampNumber(localStorage.getItem(VOLUME_STORAGE_KEY), 0, 200, DEFAULT_VOLUME); } catch { return DEFAULT_VOLUME; } }
function writeVolume(volume) { try { localStorage.setItem(VOLUME_STORAGE_KEY, String(clampNumber(volume, 0, 200, DEFAULT_VOLUME))); } catch {} }
function readThresholdDb() { try { return clampNumber(localStorage.getItem(THRESHOLD_STORAGE_KEY), -80, -10, DEFAULT_THRESHOLD_DB); } catch { return DEFAULT_THRESHOLD_DB; } }
function writeThresholdDb(thresholdDb) { try { localStorage.setItem(THRESHOLD_STORAGE_KEY, String(clampNumber(thresholdDb, -80, -10, DEFAULT_THRESHOLD_DB))); } catch {} }
function keyLabel(binding) {
  if (!binding) return "—";
  if (binding.type === "mouse") return ({ 1: "Clic molette", 3: "Souris 4", 4: "Souris 5" }[binding.button] || `Souris ${binding.button}`);
  const code = binding.code || "";
  const names = { Space: "Espace", Enter: "Entrée", Escape: "Échap", KeyM: "M" };
  if (names[code]) return names[code];
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  return code || "—";
}
function eventToBinding(event) {
  if (event instanceof MouseEvent) return event.button > 0 ? { type: "mouse", button: event.button } : null;
  if (event instanceof KeyboardEvent) return event.code ? { type: "keyboard", code: event.code } : null;
  return null;
}
function bindingEquals(binding, event) {
  if (!binding) return false;
  if (binding.type === "mouse" && event instanceof MouseEvent) return event.button === binding.button;
  if (binding.type === "keyboard" && event instanceof KeyboardEvent) return event.code === binding.code;
  return false;
}

function createVoiceCompressor(audioContext) {
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = COMPRESSOR_SETTINGS.threshold;
  compressor.knee.value = COMPRESSOR_SETTINGS.knee;
  compressor.ratio.value = COMPRESSOR_SETTINGS.ratio;
  compressor.attack.value = COMPRESSOR_SETTINGS.attack;
  compressor.release.value = COMPRESSOR_SETTINGS.release;
  return compressor;
}

function createCompressedMicrophoneStream(rawStream, settings) {
  const audioContext = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
  const source = audioContext.createMediaStreamSource(rawStream);
  const compressor = createVoiceCompressor(audioContext);
  const outputGain = audioContext.createGain();
  const destination = audioContext.createMediaStreamDestination();
  outputGain.gain.value = COMPRESSOR_SETTINGS.outputGain * (settings.volume / 100);
  return {
    audioContext,
    source,
    compressor,
    destination,
    input: source,
    output: outputGain,
    connectToOutput(node) { node.connect(compressor).connect(outputGain).connect(destination); },
    setVolume(volume) { outputGain.gain.value = COMPRESSOR_SETTINGS.outputGain * (clampNumber(volume, 0, 200, DEFAULT_VOLUME) / 100); },
    cleanup: () => { stopStream(destination.stream); stopStream(rawStream); audioContext.close(); },
  };
}

function microphoneConstraints(deviceId = "") {
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1, sampleRate: 48000, sampleSize: 16 };
  return deviceId ? { ...audio, deviceId: { exact: deviceId } } : audio;
}

async function createProcessedMicrophoneStream({ onStatus, deviceId = "", settings }) {
  const rawStream = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(deviceId) });
  if (!window.AudioContext) return { stream: rawStream, rawStream, rnnoiseActive: false, setVolume: () => {}, setThresholdDb: () => {}, cleanup: () => stopStream(rawStream) };
  const audio = createCompressedMicrophoneStream(rawStream, settings);
  if (!window.AudioWorkletNode) {
    audio.connectToOutput(audio.input);
    return { stream: audio.destination.stream, rawStream, rnnoiseActive: false, setVolume: audio.setVolume, setThresholdDb: () => {}, cleanup: audio.cleanup };
  }
  try {
    await audio.audioContext.audioWorklet.addModule("./js/voice-rnnoise-worklet.js");
    await audio.audioContext.audioWorklet.addModule("./js/voice-gate-worklet.js");
    const gate = new AudioWorkletNode(audio.audioContext, "voice-gate-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    gate.port.postMessage({ type: "settings", thresholdDb: settings.thresholdDb });
    const worklet = new AudioWorkletNode(audio.audioContext, "rnnoise-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("RNNoise timeout")), 3000);
      worklet.port.onmessage = (event) => {
        if (event.data?.type === "ready") { clearTimeout(timer); resolve(); }
        if (event.data?.type === "error") { clearTimeout(timer); reject(new Error(event.data.message)); }
      };
    });
    worklet.port.postMessage({ type: "init", wasmUrl: "./vendor/rnnoise/rnnoise.wasm" });
    await ready;
    audio.input.connect(worklet).connect(gate);
    audio.connectToOutput(gate);
    onStatus?.("rnnoise");
    return { stream: audio.destination.stream, rawStream, rnnoiseActive: true, setVolume: audio.setVolume, setThresholdDb: (thresholdDb) => gate.port.postMessage({ type: "settings", thresholdDb }), cleanup: audio.cleanup };
  } catch (error) {
    audio.input.disconnect();
    await audio.audioContext.audioWorklet.addModule("./js/voice-gate-worklet.js");
    const gate = new AudioWorkletNode(audio.audioContext, "voice-gate-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    gate.port.postMessage({ type: "settings", thresholdDb: settings.thresholdDb });
    audio.input.connect(gate);
    audio.connectToOutput(gate);
    onStatus?.("fallback");
    return { stream: audio.destination.stream, rawStream, rnnoiseActive: false, setVolume: audio.setVolume, setThresholdDb: (thresholdDb) => gate.port.postMessage({ type: "settings", thresholdDb }), cleanup: audio.cleanup };
  }
}

export function createVoiceChatController({ getSessionId, getNickname, elements }) {
  const state = { sessionId: "", joined: false, muted: false, stream: null, cleanupAudio: null, setAudioVolume: null, setAudioThresholdDb: null, peers: new Map(), presence: {}, unsubPresence: null, unsubSignals: null, unsubSignalRemovals: null, heartbeat: null, roomId: "main", keybind: readKeybind(), selectedDeviceId: readDeviceId(), volume: readVolume(), thresholdDb: readThresholdDb(), capturing: false };
  function render(text = "") {
    elements.panel?.classList.toggle("hidden", !getSessionId());
    elements.join.textContent = state.joined ? "Quitter" : "Rejoindre";
    elements.join.disabled = false;
    elements.mute.disabled = !state.joined;
    elements.mute.textContent = state.muted ? "Unmute" : "Mute";
    elements.mute.classList.toggle("is-muted", state.muted);
    elements.keyLabel.textContent = keyLabel(state.keybind);
    if (elements.volumeInput) elements.volumeInput.value = String(state.volume);
    if (elements.volumeValue) elements.volumeValue.textContent = `${state.volume}%`;
    if (elements.thresholdInput) elements.thresholdInput.value = String(state.thresholdDb);
    if (elements.thresholdValue) elements.thresholdValue.textContent = `${state.thresholdDb} dB`;
    elements.status.textContent = text || (state.joined ? "Salon vocal actif." : "Salon vocal quitté.");
    renderUsers();
  }
  async function refreshDeviceList() {
    if (!elements.deviceSelect || !navigator.mediaDevices?.enumerateDevices) return;
    const currentValue = state.selectedDeviceId || elements.deviceSelect.value;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const microphones = devices.filter((device) => device.kind === "audioinput");
    elements.deviceSelect.replaceChildren();
    microphones.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Micro ${index + 1}`;
      elements.deviceSelect.append(option);
    });
    const hasCurrent = microphones.some((device) => device.deviceId === currentValue);
    state.selectedDeviceId = hasCurrent ? currentValue : (microphones[0]?.deviceId || "");
    elements.deviceSelect.value = state.selectedDeviceId;
    elements.deviceSelect.hidden = microphones.length <= 1;
    elements.deviceField?.classList.toggle("hidden", microphones.length <= 1);
    writeDeviceId(state.selectedDeviceId);
  }

  function renderUsers() {
    elements.users.replaceChildren();
    Object.entries(state.presence).filter(([, user]) => user?.active && Date.now() - Number(user.updatedAt || 0) < PRESENCE_STALE_MS).forEach(([id, user]) => {
      const li = document.createElement("li");
      li.textContent = `${user.nickname || "Invité"}${user.muted ? " · mute" : ""}`;
      if (id === safeKey(state.sessionId || getSessionId())) li.classList.add("self");
      elements.users.append(li);
    });
  }
  async function writePresence() {
    const sessionId = state.sessionId || getSessionId(); if (!sessionId || !state.joined) return;
    await set(ref(db, `${VOICE_PATH}/rooms/${state.roomId}/presence/${safeKey(sessionId)}`), { sessionId: safeKey(sessionId), nickname: String(getNickname() || "Invité").slice(0, 40), active: true, muted: state.muted, updatedAt: Date.now() });
  }
  async function removePresence() { const id = state.sessionId || getSessionId(); if (id) await remove(ref(db, `${VOICE_PATH}/rooms/${state.roomId}/presence/${safeKey(id)}`)); }
  function closePeer(id, removeSignal = false) { const entry = state.peers.get(id); entry?.unsubscribe?.(); entry?.unsubscribeCandidates?.(); try { entry?.pc?.close(); } catch {} entry?.audio?.remove(); if (removeSignal && entry?.signalPath) remove(ref(db, entry.signalPath)).catch(() => {}); state.peers.delete(id); }
  async function makePeer(remoteId, initiator) {
    if (!state.stream || remoteId === state.sessionId || remoteId === getSessionId() || state.peers.has(remoteId)) return;
    const signalPath = `${VOICE_PATH}/rooms/${state.roomId}/signals/${initiator ? safeKey(state.sessionId || getSessionId()) : safeKey(remoteId)}_${initiator ? safeKey(remoteId) : safeKey(state.sessionId || getSessionId())}`;
    const pc = new RTCPeerConnection(RTC_CONFIG); const entry = { pc, signalPath }; state.peers.set(remoteId, entry);
    state.stream.getAudioTracks().forEach((track) => {
      const sender = pc.addTrack(track, state.stream);
      const parameters = sender.getParameters();
      parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      parameters.encodings[0].maxBitrate = 128000;
      sender.setParameters(parameters).catch(() => {});
    });
    pc.ontrack = (event) => { const audio = entry.audio || new Audio(); entry.audio = audio; audio.autoplay = true; audio.playsInline = true; audio.srcObject = event.streams[0]; audio.play?.().catch(() => {}); };
    pc.onicecandidate = (event) => { const candidate = plainCandidate(event.candidate); if (!candidate) return; set(ref(db, `${signalPath}/${initiator ? "callerCandidates" : "calleeCandidates"}/${safeKey(`${Date.now()}_${Math.random()}`)}`), candidate); };
    pc.onconnectionstatechange = () => { if (["failed", "closed", "disconnected"].includes(pc.connectionState)) setTimeout(() => closePeer(remoteId, true), 2500); };
    if (initiator) {
      entry.unsubscribe = onValue(ref(db, `${signalPath}/answer`), async (snap) => { if (snap.val() && !pc.remoteDescription) await pc.setRemoteDescription(new RTCSessionDescription(snap.val())).catch(console.warn); });
      entry.unsubscribeCandidates = onChildAdded(ref(db, `${signalPath}/calleeCandidates`), (snap) => pc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(console.warn));
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false }); await pc.setLocalDescription(offer);
      await set(ref(db, signalPath), { callerId: safeKey(state.sessionId || getSessionId()), calleeId: safeKey(remoteId), offer: plainDescription(pc.localDescription), createdAt: Date.now() }); await onDisconnect(ref(db, signalPath)).remove();
    } else {
      entry.unsubscribe = onValue(ref(db, `${signalPath}/offer`), async (snap) => { const offer = snap.val(); if (!offer || pc.remoteDescription) return; await pc.setRemoteDescription(new RTCSessionDescription(offer)); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await update(ref(db, signalPath), { answer: plainDescription(pc.localDescription), answeredAt: Date.now() }); });
      entry.unsubscribeCandidates = onChildAdded(ref(db, `${signalPath}/callerCandidates`), (snap) => pc.addIceCandidate(new RTCIceCandidate(snap.val())).catch(console.warn));
    }
  }
  function watch() {
    state.unsubPresence = onValue(ref(db, `${VOICE_PATH}/rooms/${state.roomId}/presence`), (snap) => { state.presence = snap.val() || {}; renderUsers(); Object.keys(state.presence).forEach((id) => { if (id > safeKey(state.sessionId || getSessionId())) makePeer(id, true).catch(console.warn); }); });
    state.unsubSignals = onChildAdded(ref(db, `${VOICE_PATH}/rooms/${state.roomId}/signals`), (snap) => { const sig = snap.val(); if (sig?.calleeId === safeKey(state.sessionId || getSessionId()) && Date.now() - Number(sig.createdAt || 0) < SIGNAL_TTL_MS) makePeer(sig.callerId, false).catch(console.warn); });
    state.unsubSignalRemovals = onChildRemoved(ref(db, `${VOICE_PATH}/rooms/${state.roomId}/signals`), (snap) => { const sig = snap.val(); const other = sig?.callerId === safeKey(state.sessionId || getSessionId()) ? sig.calleeId : sig?.calleeId; if (other) closePeer(other, false); });
  }
  async function join() {
    if (state.joined) return; if (!navigator.mediaDevices?.getUserMedia) return render("Micro indisponible.");
    elements.join.disabled = true; render("Micro…");
    try { await refreshDeviceList(); state.sessionId = safeKey(getSessionId()); const audio = await createProcessedMicrophoneStream({ onStatus: () => {}, deviceId: state.selectedDeviceId, settings: state }); state.stream = audio.stream; state.cleanupAudio = audio.cleanup; state.setAudioVolume = audio.setVolume; state.setAudioThresholdDb = audio.setThresholdDb; state.joined = true; state.muted = false; await refreshDeviceList(); await writePresence(); await onDisconnect(ref(db, `${VOICE_PATH}/rooms/${state.roomId}/presence/${safeKey(state.sessionId || getSessionId())}`)).remove(); watch(); state.heartbeat = setInterval(() => writePresence().catch(console.warn), HEARTBEAT_MS); render(audio.rnnoiseActive ? "RNNoise actif." : "RNNoise indisponible : fallback micro."); } catch (error) { render(error?.name === "NotAllowedError" ? "Permission micro refusée." : "Erreur micro."); }
  }
  async function leave() { clearInterval(state.heartbeat); state.heartbeat = null; state.unsubPresence?.(); state.unsubSignals?.(); state.unsubSignalRemovals?.(); for (const id of [...state.peers.keys()]) closePeer(id, true); state.cleanupAudio?.(); state.stream = null; state.cleanupAudio = null; state.setAudioVolume = null; state.setAudioThresholdDb = null; state.joined = false; await removePresence().catch(() => {}); state.sessionId = ""; render(); }
  async function toggleMute() { if (!state.joined) return; state.muted = !state.muted; state.stream?.getAudioTracks().forEach((track) => { track.enabled = !state.muted; }); await writePresence().catch(() => {}); render(); }
  function beginCapture() { state.capturing = true; elements.keyHint.classList.remove("hidden"); }
  function setBinding(binding) { const conflict = binding.type === "keyboard" && ["Space", "Enter"].includes(binding.code); elements.keyConflict.classList.toggle("hidden", !conflict); state.keybind = binding; writeKeybind(binding); state.capturing = false; elements.keyHint.classList.add("hidden"); render(); }
  function setVolume(volume) { state.volume = Math.round(clampNumber(volume, 0, 200, DEFAULT_VOLUME)); writeVolume(state.volume); state.setAudioVolume?.(state.volume); render(); }
  function setThresholdDb(thresholdDb) { state.thresholdDb = Math.round(clampNumber(thresholdDb, -80, -10, DEFAULT_THRESHOLD_DB)); writeThresholdDb(state.thresholdDb); state.setAudioThresholdDb?.(state.thresholdDb); render(); }
  function handleShortcut(event) { if (isEditableTarget(event.target)) return; if (state.capturing) { const binding = eventToBinding(event); if (binding) { event.preventDefault(); setBinding(binding); } return; } if (bindingEquals(state.keybind, event)) { event.preventDefault(); toggleMute(); } }
  elements.join.addEventListener("click", () => state.joined ? leave() : join()); elements.mute.addEventListener("click", toggleMute); elements.keyChange.addEventListener("click", beginCapture); elements.keyReset.addEventListener("click", () => setBinding(DEFAULT_MUTE_KEYBIND)); elements.deviceSelect?.addEventListener("change", async () => { state.selectedDeviceId = elements.deviceSelect.value; writeDeviceId(state.selectedDeviceId); if (!state.joined) return; await leave(); await join(); }); elements.volumeInput?.addEventListener("input", () => setVolume(elements.volumeInput.value)); elements.thresholdInput?.addEventListener("input", () => setThresholdDb(elements.thresholdInput.value)); navigator.mediaDevices?.addEventListener?.("devicechange", () => refreshDeviceList().catch(console.warn)); window.addEventListener("keydown", handleShortcut); window.addEventListener("mouseup", handleShortcut); window.addEventListener("beforeunload", () => { state.cleanupAudio?.(); removePresence(); }); render(); refreshDeviceList().catch(console.warn);
  return { join, leave, refreshIdentity: writePresence, isJoined: () => state.joined };
}
