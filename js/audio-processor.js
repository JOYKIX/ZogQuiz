const DEFAULTS = {
  gateThreshold: 0.01,
};

const GATE_FLOOR_GAIN = 0.08;
const GATE_HYSTERESIS_RATIO = 0.62;
const GATE_HOLD_MS = 520;
const GATE_ATTACK_SECONDS = 0.004;
const GATE_RELEASE_SECONDS = 0.18;
const TARGET_RMS = 0.095;
const MIN_AUTO_GAIN = 1;
const MAX_AUTO_GAIN = 5.5;
const AUTO_GAIN_ATTACK = 0.025;
const AUTO_GAIN_RELEASE = 0.45;
const LEVEL_NORMALIZER = 0.18;

export class AudioProcessor {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.context = null;
    this.source = null;
    this.highpass = null;
    this.compressor = null;
    this.autoGain = null;
    this.limiter = null;
    this.gate = null;
    this.analyser = null;
    this.destination = null;
    this.monitorGain = null;
    this.monitorEnabled = false;
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
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    return { audio };
  }

  async start({ onLevel, deviceId = "" } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Micro indisponible sur ce navigateur ou sans HTTPS.");
    await this.stop();
    this.onLevel = onLevel || null;
    this.inputStream = await navigator.mediaDevices.getUserMedia(AudioProcessor.getMicrophoneConstraints(deviceId));
    this.context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    await this.context.resume();

    this.source = this.context.createMediaStreamSource(this.inputStream);

    this.highpass = this.context.createBiquadFilter();
    this.highpass.type = "highpass";
    this.highpass.frequency.value = 85;
    this.highpass.Q.value = 0.7;

    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -28;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.16;

    this.autoGain = this.context.createGain();
    this.autoGain.gain.value = 1.8;

    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.08;

    this.gate = this.context.createGain();
    this.gate.gain.value = 1;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.35;
    this.levelData = new Float32Array(this.analyser.fftSize);
    this.destination = this.context.createMediaStreamDestination();

    this.source.connect(this.highpass);
    this.highpass.connect(this.compressor);
    this.compressor.connect(this.autoGain);
    this.autoGain.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.limiter.connect(this.gate);
    this.gate.connect(this.destination);
    this.monitorGain = this.context.createGain();
    this.monitorGain.gain.value = 0.85;
    this.setMonitorEnabled(this.monitorEnabled);

    this.setGateThreshold(this.options.gateThreshold);
    this.outputTrack = this.destination.stream.getAudioTracks()[0] || null;
    this.startLevelMeter();
    return this.outputTrack;
  }

  setGateThreshold(value) {
    this.options.gateThreshold = Math.max(0.003, Math.min(0.12, Number(value) || DEFAULTS.gateThreshold));
  }

  setMonitorEnabled(enabled) {
    this.monitorEnabled = Boolean(enabled);
    if (!this.gate || !this.monitorGain || !this.context?.destination) return;
    try { this.gate.disconnect(this.monitorGain); } catch {}
    try { this.monitorGain.disconnect(this.context.destination); } catch {}
    if (this.monitorEnabled) {
      this.gate.connect(this.monitorGain);
      this.monitorGain.connect(this.context.destination);
    }
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
    this.source = null;
    this.highpass = null;
    this.compressor = null;
    this.autoGain = null;
    this.limiter = null;
    this.gate = null;
    this.analyser = null;
    this.destination = null;
    this.monitorGain = null;
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

      if (this.autoGain) {
        const desiredGain = rms > 0.002 ? TARGET_RMS / rms : MAX_AUTO_GAIN;
        const nextGain = Math.max(MIN_AUTO_GAIN, Math.min(MAX_AUTO_GAIN, desiredGain));
        const isBoosting = nextGain > this.autoGain.gain.value;
        this.autoGain.gain.setTargetAtTime(nextGain, this.context.currentTime, isBoosting ? AUTO_GAIN_ATTACK : AUTO_GAIN_RELEASE);
      }

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
      this.onLevel?.(Math.min(1, rms / LEVEL_NORMALIZER));
      this.animationFrame = requestAnimationFrame(tick);
    };
    tick();
  }
}
