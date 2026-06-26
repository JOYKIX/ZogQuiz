const LEVEL_NORMALIZER = 0.18;
const DEFAULT_MIC_GAIN = 1;
const MIN_MIC_GAIN = 1;
const MAX_MIC_GAIN = 3;
export class AudioProcessor {
  constructor(options = {}) {
    this.context = null;
    this.source = null;
    this.rnnoiseNode = null;
    this.highPassFilter = null;
    this.lowPassFilter = null;
    this.compressor = null;
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
    this.rnnoiseReady = false;
    this.gainValue = AudioProcessor.normalizeGain(options.gain ?? DEFAULT_MIC_GAIN);
  }

  static getMicrophoneConstraints(deviceId = "") {
    const audio = {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: false },
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
      latency: { ideal: 0.04 },
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
    this.highPassFilter = this.context.createBiquadFilter();
    this.highPassFilter.type = "highpass";
    this.highPassFilter.frequency.value = 110;
    this.highPassFilter.Q.value = 0.85;
    this.lowPassFilter = this.context.createBiquadFilter();
    this.lowPassFilter.type = "lowpass";
    this.lowPassFilter.frequency.value = 7600;
    this.lowPassFilter.Q.value = 0.65;
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 2;
    this.compressor.attack.value = 0.012;
    this.compressor.release.value = 0.22;
    this.microphoneGain = this.context.createGain();
    this.setGain(gain);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.22;
    this.levelData = new Float32Array(this.analyser.fftSize);
    this.destination = this.context.createMediaStreamDestination();

    const processedNode = await this.createProcessedNode();
    this.source.connect(this.highPassFilter);
    this.highPassFilter.connect(processedNode);
    processedNode.connect(this.lowPassFilter);
    this.lowPassFilter.connect(this.compressor);
    this.compressor.connect(this.microphoneGain);
    this.microphoneGain.connect(this.analyser);
    this.microphoneGain.connect(this.destination);

    this.monitorGain = this.context.createGain();
    this.monitorGain.gain.value = 0.65;
    this.setMonitorEnabled(this.monitorEnabled);

    this.outputTrack = this.destination.stream.getAudioTracks()[0] || null;
    this.startLevelMeter();
    return this.outputTrack;
  }

  async createProcessedNode() {
    try {
      await this.context.audioWorklet.addModule(new URL("./rnnoise-worklet.js", import.meta.url));
      const node = new AudioWorkletNode(this.context, "rnnoise-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = (event) => {
        if (event.data?.type === "ready") this.rnnoiseReady = true;
        if (event.data?.type === "error") this.rnnoiseReady = false;
      };
      node.onprocessorerror = () => { this.rnnoiseReady = false; };
      this.rnnoiseNode = node;
      return node;
    } catch {
      return this.createBypassNode();
    }
  }

  createBypassNode() {
    const node = this.context.createGain();
    node.gain.value = 1;
    this.rnnoiseNode = node;
    this.rnnoiseReady = false;
    return node;
  }

  setMonitorEnabled(enabled) {
    this.monitorEnabled = Boolean(enabled);
    if (!this.rnnoiseNode || !this.monitorGain || !this.context?.destination) return;
    try { this.microphoneGain?.disconnect(this.monitorGain); } catch {}
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
    this.rnnoiseNode?.port?.postMessage?.({ type: "destroy" });
    this.outputTrack?.stop();
    this.inputStream?.getTracks?.().forEach((track) => track.stop());
    await this.context?.close?.().catch(() => {});
    this.context = null;
    this.source = null;
    this.rnnoiseNode = null;
    this.highPassFilter = null;
    this.lowPassFilter = null;
    this.compressor = null;
    this.microphoneGain = null;
    this.analyser = null;
    this.destination = null;
    this.monitorGain = null;
    this.inputStream = null;
    this.outputTrack = null;
    this.rnnoiseReady = false;
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
