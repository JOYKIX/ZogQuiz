const DEFAULTS = {
  gateThreshold: 0.02,
};

const GATE_FLOOR_GAIN = 0.12;
const GATE_HYSTERESIS_RATIO = 0.72;
const GATE_HOLD_MS = 420;
const GATE_ATTACK_SECONDS = 0.008;
const GATE_RELEASE_SECONDS = 0.22;

export class AudioProcessor {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.context = null;
    this.source = null;
    this.gate = null;
    this.analyser = null;
    this.destination = null;
    this.inputStream = null;
    this.outputTrack = null;
    this.animationFrame = 0;
    this.levelData = null;
    this.onLevel = null;
    this.gateOpen = false;
    this.lastVoiceAt = 0;
  }

  static getMicrophoneConstraints(deviceId = "") {
    const audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    return { audio };
  }

  async start({ onLevel, deviceId = "" } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Micro indisponible sur ce navigateur ou sans HTTPS.");
    await this.stop();
    this.onLevel = onLevel || null;
    this.inputStream = await navigator.mediaDevices.getUserMedia(AudioProcessor.getMicrophoneConstraints(deviceId));
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    await this.context.resume();

    this.source = this.context.createMediaStreamSource(this.inputStream);

    // Le noise gate est piloté par le niveau RMS analysé dans le navigateur.
    this.gate = this.context.createGain();
    this.gate.gain.value = 1;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.levelData = new Float32Array(this.analyser.fftSize);
    this.destination = this.context.createMediaStreamDestination();

    this.source.connect(this.analyser);
    this.source.connect(this.gate);
    this.gate.connect(this.destination);

    this.setGateThreshold(this.options.gateThreshold);
    this.outputTrack = this.destination.stream.getAudioTracks()[0] || null;
    this.startLevelMeter();
    return this.outputTrack;
  }

  setGateThreshold(value) {
    this.options.gateThreshold = Math.max(0.005, Math.min(0.12, Number(value) || DEFAULTS.gateThreshold));
  }

  getOutputTrack() {
    return this.outputTrack;
  }

  async stop() {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.outputTrack?.stop();
    this.inputStream?.getTracks?.().forEach((track) => track.stop());
    await this.context?.close?.().catch(() => {});
    this.context = null;
    this.inputStream = null;
    this.outputTrack = null;
  }

  startLevelMeter() {
    this.gateOpen = true;
    this.lastVoiceAt = performance.now();

    const tick = () => {
      if (!this.analyser || !this.gate || !this.context) return;
      this.analyser.getFloatTimeDomainData(this.levelData);
      let sum = 0;
      for (const sample of this.levelData) sum += sample * sample;
      const rms = Math.sqrt(sum / this.levelData.length);
      const now = performance.now();
      const openThreshold = this.options.gateThreshold;
      const closeThreshold = openThreshold * GATE_HYSTERESIS_RATIO;

      if (rms >= openThreshold || (this.gateOpen && rms >= closeThreshold)) {
        this.gateOpen = true;
        this.lastVoiceAt = now;
      } else if (now - this.lastVoiceAt > GATE_HOLD_MS) {
        this.gateOpen = false;
      }

      const gateGain = this.gateOpen ? 1 : GATE_FLOOR_GAIN;
      this.gate.gain.setTargetAtTime(
        gateGain,
        this.context.currentTime,
        gateGain === 1 ? GATE_ATTACK_SECONDS : GATE_RELEASE_SECONDS,
      );
      this.onLevel?.(Math.min(1, rms / 0.22));
      this.animationFrame = requestAnimationFrame(tick);
    };
    tick();
  }
}
