import { db, ref, set, onValue, onChildAdded, onChildRemoved, onDisconnect, update, remove } from "./firebase.js";

const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
const VOICE_PATH = "voice";
const PRESENCE_STALE_MS = 45000;
const HEARTBEAT_MS = 12000;
const SIGNAL_TTL_MS = 120000;
const DEFAULT_MUTE_KEYBIND = { type: "keyboard", code: "KeyM" };
const STORAGE_KEY = "zogquiz.voiceMuteKeybind.v1";
const COMPRESSOR_SETTINGS = { threshold: -30, knee: 18, ratio: 5.5, attack: 0.0015, release: 0.09, outputGain: 1.18 };
const LOW_CUT_FREQUENCY = 95;
const HIGH_CUT_FREQUENCY = 7600;
const NOTCH_Q = 18;

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

function createProcessedAudioGraph(rawStream) {
  const audioContext = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
  const source = audioContext.createMediaStreamSource(rawStream);
  const highpass = audioContext.createBiquadFilter();
  const mainsNotch50 = audioContext.createBiquadFilter();
  const mainsNotch60 = audioContext.createBiquadFilter();
  const presence = audioContext.createBiquadFilter();
  const lowpass = audioContext.createBiquadFilter();
  const compressor = createVoiceCompressor(audioContext);
  const limiter = audioContext.createDynamicsCompressor();
  const outputGain = audioContext.createGain();
  const destination = audioContext.createMediaStreamDestination();
  highpass.type = "highpass";
  highpass.frequency.value = LOW_CUT_FREQUENCY;
  highpass.Q.value = 0.9;
  mainsNotch50.type = "notch";
  mainsNotch50.frequency.value = 50;
  mainsNotch50.Q.value = NOTCH_Q;
  mainsNotch60.type = "notch";
  mainsNotch60.frequency.value = 60;
  mainsNotch60.Q.value = NOTCH_Q;
  presence.type = "peaking";
  presence.frequency.value = 3200;
  presence.Q.value = 0.75;
  presence.gain.value = 1.6;
  lowpass.type = "lowpass";
  lowpass.frequency.value = HIGH_CUT_FREQUENCY;
  lowpass.Q.value = 0.72;
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.045;
  outputGain.gain.value = COMPRESSOR_SETTINGS.outputGain;
  return {
    audioContext,
    source,
    destination,
    input: source,
    connectToOutput(node) { node.connect(highpass).connect(mainsNotch50).connect(mainsNotch60).connect(presence).connect(lowpass).connect(compressor).connect(limiter).connect(outputGain).connect(destination); },
    cleanup: () => { stopStream(destination.stream); stopStream(rawStream); audioContext.close(); },
  };
}

function microphoneConstraints(deviceId = "") {
  const constraints = {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: false },
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 24 },
    latency: { ideal: 0.02 },
    googEchoCancellation: true,
    googAutoGainControl: false,
    googNoiseSuppression: true,
    googHighpassFilter: true,
  };
  return deviceId ? { ...constraints, deviceId: { exact: deviceId } } : constraints;
}

async function createProcessedMicrophoneStream({ deviceId = "", onStatus }) {
  const rawStream = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(deviceId) });
  if (!window.AudioContext) return { stream: rawStream, rawStream, rnnoiseActive: false, cleanup: () => stopStream(rawStream) };
  const audio = createProcessedAudioGraph(rawStream);
  if (!window.AudioWorkletNode) {
    audio.connectToOutput(audio.input);
    return { stream: audio.destination.stream, rawStream, rnnoiseActive: false, cleanup: audio.cleanup };
  }
  try {
    await audio.audioContext.audioWorklet.addModule("./js/voice-rnnoise-worklet.js");
    await audio.audioContext.audioWorklet.addModule("./js/voice-gate-worklet.js");
    const gate = new AudioWorkletNode(audio.audioContext, "voice-gate-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const worklet = new AudioWorkletNode(audio.audioContext, "rnnoise-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("RNNoise timeout")), 3000);
      worklet.port.onmessage = (event) => {
        if (event.data?.type === "ready") { clearTimeout(timer); resolve(); }
        if (event.data?.type === "error") { clearTimeout(timer); reject(new Error(event.data.message)); }
      };
    });
    worklet.port.postMessage({ type: "init", moduleUrl: new URL("../vendor/rnnoise/rnnoise.js", import.meta.url).href, wasmUrl: "./vendor/rnnoise/rnnoise.wasm" });
    await ready;
    audio.input.connect(worklet).connect(gate);
    audio.connectToOutput(gate);
    onStatus?.("rnnoise");
    return { stream: audio.destination.stream, rawStream, rnnoiseActive: true, cleanup: audio.cleanup };
  } catch (error) {
    audio.input.disconnect();
    await audio.audioContext.audioWorklet.addModule("./js/voice-gate-worklet.js");
    const gate = new AudioWorkletNode(audio.audioContext, "voice-gate-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    audio.input.connect(gate);
    audio.connectToOutput(gate);
    onStatus?.("fallback");
    return { stream: audio.destination.stream, rawStream, rnnoiseActive: false, cleanup: audio.cleanup };
  }
}

export function createVoiceChatController({ getSessionId, getNickname, elements }) {
  const state = { sessionId: "", joined: false, muted: false, monitoring: false, monitorAudio: null, stream: null, cleanupAudio: null, peers: new Map(), presence: {}, unsubPresence: null, unsubSignals: null, unsubSignalRemovals: null, heartbeat: null, roomId: "main", keybind: readKeybind(), capturing: false, selectedDeviceId: "" };
  function render(text = "") {
    elements.panel?.classList.toggle("hidden", !getSessionId());
    elements.join.textContent = state.joined ? "Quitter" : "Rejoindre";
    elements.join.disabled = false;
    elements.mute.disabled = !state.joined;
    elements.mute.textContent = state.muted ? "Unmute" : "Mute";
    elements.mute.classList.toggle("is-muted", state.muted);
    if (elements.monitor) {
      elements.monitor.disabled = !state.joined;
      elements.monitor.textContent = state.monitoring ? "Retour voix ON" : "Retour voix";
      elements.monitor.setAttribute("aria-pressed", String(state.monitoring));
      elements.monitor.classList.toggle("is-active", state.monitoring);
    }
    if (elements.deviceSelect) elements.deviceSelect.disabled = state.joined && !state.stream;
    elements.keyLabel.textContent = keyLabel(state.keybind);
    elements.status.textContent = text || (state.joined ? "Salon vocal actif." : "Salon vocal quitté.");
    renderUsers();
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
      parameters.encodings[0].maxBitrate = 256000;
      parameters.encodings[0].priority = "high";
      parameters.encodings[0].networkPriority = "high";
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
    try { state.sessionId = safeKey(getSessionId()); const audio = await createProcessedMicrophoneStream({ deviceId: state.selectedDeviceId, onStatus: () => {} }); state.stream = audio.stream; state.cleanupAudio = audio.cleanup; state.joined = true; state.muted = false; await refreshDeviceList(); await writePresence(); await onDisconnect(ref(db, `${VOICE_PATH}/rooms/${state.roomId}/presence/${safeKey(state.sessionId || getSessionId())}`)).remove(); watch(); state.heartbeat = setInterval(() => writePresence().catch(console.warn), HEARTBEAT_MS); render(audio.rnnoiseActive ? "RNNoise actif." : "RNNoise indisponible : fallback micro."); } catch (error) { render(error?.name === "NotAllowedError" ? "Permission micro refusée." : "Erreur micro."); }
  }
  function stopMonitor() { state.monitorAudio?.pause(); if (state.monitorAudio) state.monitorAudio.srcObject = null; state.monitorAudio = null; state.monitoring = false; }
  function startMonitor() { if (!state.stream) return; const audio = state.monitorAudio || new Audio(); state.monitorAudio = audio; audio.autoplay = true; audio.playsInline = true; audio.srcObject = state.stream; audio.play?.().catch(() => {}); }
  function toggleMonitor() { if (!state.joined) return; state.monitoring = !state.monitoring; if (state.monitoring) startMonitor(); else stopMonitor(); render(); }
  async function leave() { clearInterval(state.heartbeat); state.heartbeat = null; state.unsubPresence?.(); state.unsubSignals?.(); state.unsubSignalRemovals?.(); for (const id of [...state.peers.keys()]) closePeer(id, true); stopMonitor(); state.cleanupAudio?.(); state.stream = null; state.cleanupAudio = null; state.joined = false; await removePresence().catch(() => {}); state.sessionId = ""; render(); }
  async function toggleMute() { if (!state.joined) return; state.muted = !state.muted; state.stream?.getAudioTracks().forEach((track) => { track.enabled = !state.muted; }); await writePresence().catch(() => {}); render(); }
  function beginCapture() { state.capturing = true; elements.keyHint.classList.remove("hidden"); }
  function setBinding(binding) { const conflict = binding.type === "keyboard" && ["Space", "Enter"].includes(binding.code); elements.keyConflict.classList.toggle("hidden", !conflict); state.keybind = binding; writeKeybind(binding); state.capturing = false; elements.keyHint.classList.add("hidden"); render(); }
  function handleShortcut(event) { if (isEditableTarget(event.target)) return; if (state.capturing) { const binding = eventToBinding(event); if (binding) { event.preventDefault(); setBinding(binding); } return; } if (bindingEquals(state.keybind, event)) { event.preventDefault(); toggleMute(); } }
  elements.join.addEventListener("click", () => state.joined ? leave() : join()); elements.mute.addEventListener("click", toggleMute); elements.monitor?.addEventListener("click", toggleMonitor); elements.keyChange.addEventListener("click", beginCapture); elements.keyReset.addEventListener("click", () => setBinding(DEFAULT_MUTE_KEYBIND)); elements.deviceSelect?.addEventListener("change", async () => { state.selectedDeviceId = elements.deviceSelect.value; if (state.joined) { await leave(); await join(); } }); navigator.mediaDevices?.addEventListener?.("devicechange", () => refreshDeviceList().catch(console.warn)); window.addEventListener("keydown", handleShortcut); window.addEventListener("mouseup", handleShortcut); window.addEventListener("beforeunload", () => { state.cleanupAudio?.(); removePresence(); }); render(); refreshDeviceList().catch(console.warn);
  return { join, leave, refreshIdentity: writePresence, isJoined: () => state.joined };
}
