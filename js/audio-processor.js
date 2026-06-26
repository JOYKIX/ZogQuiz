const DEFAULTS = {
  gateThreshold: 0.012,
};

const GATE_FLOOR_GAIN = 0.015;
const GATE_HYSTERESIS_RATIO = 0.58;
const GATE_HOLD_MS = 430;
const GATE_ATTACK_SECONDS = 0.003;
const GATE_RELEASE_SECONDS = 0.14;
const TARGET_RMS = 0.095;
const MIN_AUTO_GAIN = 1;
const MAX_AUTO_GAIN = 4.4;
const AUTO_GAIN_ATTACK = 0.04;
const AUTO_GAIN_RELEASE = 0.6;
const LEVEL_NORMALIZER = 0.18;
const FLOOR_LEARN_RATE = 0.018;
const FLOOR_MIN = 0.0035;
const FLOOR_MAX = 0.04;
const TRANSIENT_PEAK_RATIO = 8.5;
const TRANSIENT_RMS_LIMIT = 0.06;
const TRANSIENT_MUTE_MS = 90;
const VOICE_BAND_LOW_HZ = 110;
const VOICE_BAND_HIGH_HZ = 3600;
const SIBILANCE_HIGH_HZ = 7800;
const VOICE_RATIO_OPEN = 0.46;
const VOICE_RATIO_CLOSE = 0.31;
const NOISE_GATE_MULTIPLIER = 2.6;
const NOISE_GATE_OFFSET = 0.004;
const LOW_SHELF_CUT_DB = -9;
const HIGH_SHELF_CUT_DB = -4;

function setFilter(filter, type, frequency, q = 0.7, gain = 0) {
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  filter.gain.value = gain;
}

export class AudioProcessor {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.context = null;
    this.source = null;
    this.highpass = null;
    this.lowShelf = null;
    this.presence = null;
    this.highShelf = null;
    this.notchFilters = [];
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
    this.noiseFloor = FLOOR_MIN;
    this.lastTransientAt = 0;
    this.frequencyData = null;
  }

  static getMicrophoneConstraints(deviceId = "") {
    const audio = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
      latency: { ideal: 0.02 },
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
    setFilter(this.highpass, "highpass", 115, 0.85);

    this.lowShelf = this.context.createBiquadFilter();
    setFilter(this.lowShelf, "lowshelf", 180, 0.7, LOW_SHELF_CUT_DB);

    this.notchFilters = [60, 120, 240, 480].map((frequency) => {
      const filter = this.context.createBiquadFilter();
      setFilter(filter, "notch", frequency, frequency === 60 ? 18 : 12);
      return filter;
    });

    this.presence = this.context.createBiquadFilter();
    setFilter(this.presence, "peaking", 2300, 0.95, 2.2);

    this.highShelf = this.context.createBiquadFilter();
    setFilter(this.highShelf, "highshelf", SIBILANCE_HIGH_HZ, 0.65, HIGH_SHELF_CUT_DB);

    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -30;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.012;
    this.compressor.release.value = 0.18;

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
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.22;
    this.levelData = new Float32Array(this.analyser.fftSize);
    this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
    this.destination = this.context.createMediaStreamDestination();

    let previousNode = this.source;
    [
      this.highpass,
      this.lowShelf,
      ...this.notchFilters,
      this.presence,
      this.highShelf,
      this.compressor,
    ].forEach((node) => {
      previousNode.connect(node);
      previousNode = node;
    });
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
    this.lowShelf = null;
    this.presence = null;
    this.highShelf = null;
    this.notchFilters = [];
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
    this.noiseFloor = FLOOR_MIN;
    this.lastTransientAt = 0;

    const tick = () => {
      if (!this.analyser || !this.gate || !this.context) return;
      this.analyser.getFloatTimeDomainData(this.levelData);
      this.analyser.getFloatFrequencyData(this.frequencyData);
      let sum = 0;
      let peak = 0;
      for (const sample of this.levelData) {
        const absSample = Math.abs(sample);
        sum += sample * sample;
        if (absSample > peak) peak = absSample;
      }
      const rms = Math.sqrt(sum / this.levelData.length);
      const now = performance.now();
      const voiceRatio = this.getVoiceRatio();
      const isTransient = peak > rms * TRANSIENT_PEAK_RATIO && rms < TRANSIENT_RMS_LIMIT;
      if (isTransient) this.lastTransientAt = now;
      const transientMuted = now - this.lastTransientAt < TRANSIENT_MUTE_MS;
      const userThreshold = this.options.gateThreshold;
      const adaptiveThreshold = Math.max(userThreshold, this.noiseFloor * NOISE_GATE_MULTIPLIER + NOISE_GATE_OFFSET);
      const openThreshold = adaptiveThreshold;
      const closeThreshold = openThreshold * GATE_HYSTERESIS_RATIO;
      const voiceLike = voiceRatio >= (this.gateOpen ? VOICE_RATIO_CLOSE : VOICE_RATIO_OPEN);

      if (this.autoGain) {
        const desiredGain = voiceLike && !transientMuted && rms > 0.002 ? TARGET_RMS / rms : MIN_AUTO_GAIN;
        const nextGain = Math.max(MIN_AUTO_GAIN, Math.min(MAX_AUTO_GAIN, desiredGain));
        const isBoosting = nextGain > this.autoGain.gain.value;
        this.autoGain.gain.setTargetAtTime(nextGain, this.context.currentTime, isBoosting ? AUTO_GAIN_ATTACK : AUTO_GAIN_RELEASE);
      }

      if (!this.gateOpen && !voiceLike && rms < adaptiveThreshold * 1.8) {
        this.noiseFloor = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, this.noiseFloor + (rms - this.noiseFloor) * FLOOR_LEARN_RATE));
      }

      if (!transientMuted && voiceLike && (rms >= openThreshold || (this.gateOpen && rms >= closeThreshold))) {
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

  getVoiceRatio() {
    if (!this.frequencyData?.length || !this.context?.sampleRate) return 1;
    const nyquist = this.context.sampleRate / 2;
    const binHz = nyquist / this.frequencyData.length;
    let totalEnergy = 0;
    let voiceEnergy = 0;
    for (let index = 1; index < this.frequencyData.length; index += 1) {
      const frequency = index * binHz;
      if (frequency > SIBILANCE_HIGH_HZ) break;
      const db = this.frequencyData[index];
      if (!Number.isFinite(db)) continue;
      const energy = 10 ** (db / 10);
      totalEnergy += energy;
      if (frequency >= VOICE_BAND_LOW_HZ && frequency <= VOICE_BAND_HIGH_HZ) voiceEnergy += energy;
    }
    return totalEnergy > 0 ? voiceEnergy / totalEnergy : 0;
  }
}
