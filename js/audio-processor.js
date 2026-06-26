const LEVEL_NORMALIZER = 0.18;
const DEFAULT_MIC_GAIN = 1;
const MIN_MIC_GAIN = 1;
const MAX_MIC_GAIN = 3;

export class AudioProcessor {
  constructor(options = {}) {
    this.context = null;
    this.source = null;
    this.microphoneGain = null;
    this.analyser = null;
    this.destination = null;
    this.monitorGain = null;
    this.monitorEnabled = false;
    this.inputStream = null;
    this.outputTrack = null;
    this.animationFrame = 0;
    this.levelData = null;
    this.onLevel = null;
    this.gainValue = AudioProcessor.normalizeGain(options.gain ?? DEFAULT_MIC_GAIN);
  }

  static getMicrophoneConstraints(deviceId = "") {
    const audio = {
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: false },
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      latency: { ideal: 0.02 },
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    return { audio };
  }

  static normalizeGain(value) {
    const gain = Number(value);
    if (!Number.isFinite(gain)) return DEFAULT_MIC_GAIN;
    return Math.max(MIN_MIC_GAIN, Math.min(MAX_MIC_GAIN, gain));
  }

  setGain(value) {
    this.gainValue = AudioProcessor.normalizeGain(value);
    if (this.microphoneGain) this.microphoneGain.gain.value = this.gainValue;
  }

  async start({ onLevel, deviceId = "", gain = this.gainValue } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Micro indisponible sur ce navigateur ou sans HTTPS.");
    await this.stop();
    this.onLevel = onLevel || null;
    this.inputStream = await navigator.mediaDevices.getUserMedia(AudioProcessor.getMicrophoneConstraints(deviceId));
    this.inputStream.getAudioTracks().forEach((track) => { track.contentHint = "speech"; });
    this.context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    await this.context.resume();

    this.source = this.context.createMediaStreamSource(this.inputStream);
    this.microphoneGain = this.context.createGain();
    this.setGain(gain);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.22;
    this.levelData = new Float32Array(this.analyser.fftSize);
    this.destination = this.context.createMediaStreamDestination();

    this.source.connect(this.microphoneGain);
    this.microphoneGain.connect(this.analyser);
    this.microphoneGain.connect(this.destination);

    this.monitorGain = this.context.createGain();
    this.monitorGain.gain.value = 0.65;
    this.setMonitorEnabled(this.monitorEnabled);

    this.outputTrack = this.destination.stream.getAudioTracks()[0] || null;
    this.startLevelMeter();
    return this.outputTrack;
  }

  setMonitorEnabled(enabled) {
    this.monitorEnabled = Boolean(enabled);
    if (!this.microphoneGain || !this.monitorGain || !this.context?.destination) return;
    try { this.microphoneGain.disconnect(this.monitorGain); } catch {}
    try { this.monitorGain.disconnect(this.context.destination); } catch {}
    if (this.monitorEnabled) {
      this.microphoneGain.connect(this.monitorGain);
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
    this.microphoneGain = null;
    this.analyser = null;
    this.destination = null;
    this.monitorGain = null;
    this.inputStream = null;
    this.outputTrack = null;
  }

  startLevelMeter() {
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.levelData);
      let sum = 0;
      for (const sample of this.levelData) sum += sample * sample;
      const rms = Math.sqrt(sum / this.levelData.length);
      this.onLevel?.(Math.min(1, rms / LEVEL_NORMALIZER));
      this.animationFrame = requestAnimationFrame(tick);
    };
    tick();
  }
}
