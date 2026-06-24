const DEFAULTS = {
  gateThreshold: 0.035,
  outputGain: 1,
  bypass: false,
  monitoring: false,
};

export class AudioProcessor {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.context = null;
    this.source = null;
    this.highPass = null;
    this.gate = null;
    this.compressor = null;
    this.outputGain = null;
    this.analyser = null;
    this.destination = null;
    this.monitorGain = null;
    this.inputStream = null;
    this.outputTrack = null;
    this.animationFrame = 0;
    this.levelData = null;
    this.onLevel = null;
    this.rnnoise = null;
  }

  static getMicrophoneConstraints() {
    return {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
  }

  async start({ onLevel } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Micro indisponible sur ce navigateur ou sans HTTPS.");
    await this.stop();
    this.onLevel = onLevel || null;
    this.inputStream = await navigator.mediaDevices.getUserMedia(AudioProcessor.getMicrophoneConstraints());
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    await this.context.resume();

    this.source = this.context.createMediaStreamSource(this.inputStream);
    this.highPass = this.context.createBiquadFilter();
    this.highPass.type = "highpass";
    this.highPass.frequency.value = 90;
    this.highPass.Q.value = 0.7;

    // Le noise gate est piloté par le niveau RMS analysé dans le navigateur.
    this.gate = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.18;

    this.outputGain = this.context.createGain();
    this.monitorGain = this.context.createGain();
    this.monitorGain.gain.value = 0;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.levelData = new Float32Array(this.analyser.fftSize);
    this.destination = this.context.createMediaStreamDestination();

    this.source.connect(this.highPass);
    this.highPass.connect(this.analyser);
    this.highPass.connect(this.gate);
    this.gate.connect(this.compressor);
    this.compressor.connect(this.outputGain);
    this.outputGain.connect(this.destination);
    this.outputGain.connect(this.monitorGain);
    this.monitorGain.connect(this.context.destination);

    this.setGateThreshold(this.options.gateThreshold);
    this.setOutputGain(this.options.outputGain);
    this.setBypass(this.options.bypass);
    this.setMonitoring(this.options.monitoring);
    this.outputTrack = this.destination.stream.getAudioTracks()[0] || null;
    this.startLevelMeter();
    this.prepareRnnoiseHook();
    return this.outputTrack;
  }

  setGateThreshold(value) {
    this.options.gateThreshold = Math.max(0.005, Math.min(0.12, Number(value) || DEFAULTS.gateThreshold));
  }

  setOutputGain(value) {
    this.options.outputGain = Math.max(0, Math.min(2, Number(value) || DEFAULTS.outputGain));
    if (this.outputGain) this.outputGain.gain.setTargetAtTime(this.options.outputGain, this.context.currentTime, 0.015);
  }

  setBypass(enabled) {
    this.options.bypass = Boolean(enabled);
  }

  setMonitoring(enabled) {
    this.options.monitoring = Boolean(enabled);
    if (this.monitorGain) this.monitorGain.gain.setTargetAtTime(this.options.monitoring ? 1 : 0, this.context.currentTime, 0.015);
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
    const tick = () => {
      if (!this.analyser || !this.gate || !this.context) return;
      this.analyser.getFloatTimeDomainData(this.levelData);
      let sum = 0;
      for (const sample of this.levelData) sum += sample * sample;
      const rms = Math.sqrt(sum / this.levelData.length);
      const gateGain = this.options.bypass || rms >= this.options.gateThreshold ? 1 : 0.06;
      this.gate.gain.setTargetAtTime(gateGain, this.context.currentTime, gateGain === 1 ? 0.01 : 0.06);
      this.onLevel?.(Math.min(1, rms / 0.22));
      this.animationFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  async prepareRnnoiseHook() {
    // Hook optionnel : un futur module RNNoise WASM peut exposer window.createRnnoiseProcessor.
    if (typeof window.createRnnoiseProcessor !== "function") return;
    try {
      this.rnnoise = await window.createRnnoiseProcessor(this.context);
    } catch (error) {
      console.warn("RNNoise WASM indisponible", error);
    }
  }
}
