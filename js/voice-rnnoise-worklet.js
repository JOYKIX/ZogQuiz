class RnnoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.denoise = null;
    this.inputBuffer = new Float32Array(480);
    this.outputBuffer = new Float32Array(480);
    this.outputOffset = 480;
    this.inputOffset = 0;
    this.cleanup = null;
    this.vadProbability = 0;
    this.noiseFloor = 0.000003;
    this.residualGain = 1;
    this.previousOutput = 0;
    this.port.onmessage = async (event) => {
      if (event.data?.type !== "init") return;
      try {
        await this.init(event.data);
        this.ready = true;
        this.port.postMessage({ type: "ready" });
      } catch (error) {
        this.ready = false;
        this.port.postMessage({ type: "error", message: error?.message || String(error) });
      }
    };
  }

  async init({ moduleUrl, wasmUrl }) {
    if (moduleUrl) {
      const { Rnnoise } = await import(moduleUrl);
      const rnnoise = await Rnnoise.load();
      const state = rnnoise.createDenoiseState();
      this.denoise = (frame) => {
        const pcmFrame = new Float32Array(480);
        for (let index = 0; index < frame.length; index += 1) {
          pcmFrame[index] = Math.max(-1, Math.min(1, frame[index])) * 32768;
        }
        const vad = state.processFrame(pcmFrame);
        for (let index = 0; index < pcmFrame.length; index += 1) {
          pcmFrame[index] = Math.max(-1, Math.min(1, pcmFrame[index] / 32768));
        }
        return { samples: pcmFrame, vad };
      };
      this.cleanup = () => state.destroy();
      return;
    }

    if (!wasmUrl) throw new Error("RNNoise WASM manquant");
    const response = await fetch(wasmUrl);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const exports = instance.exports || {};
    const create = exports.rnnoise_create || exports._rnnoise_create;
    const process = exports.rnnoise_process_frame || exports._rnnoise_process_frame;
    const malloc = exports.malloc || exports._malloc;
    const free = exports.free || exports._free;
    const memory = exports.memory;
    if (!create || !process || !malloc || !memory) throw new Error("Exports RNNoise incompatibles");
    const state = create(0);
    const inputPtr = malloc(480 * 4);
    const outputPtr = malloc(480 * 4);
    const heap = new Float32Array(memory.buffer);
    this.denoise = (frame) => {
      for (let index = 0; index < frame.length; index += 1) {
        heap[(inputPtr / 4) + index] = Math.max(-1, Math.min(1, frame[index])) * 32768;
      }
      const vad = process(state, outputPtr, inputPtr);
      const output = new Float32Array(480);
      for (let index = 0; index < output.length; index += 1) {
        output[index] = Math.max(-1, Math.min(1, heap[(outputPtr / 4) + index] / 32768));
      }
      return { samples: output, vad };
    };
    this.cleanup = () => {
      free?.(inputPtr);
      free?.(outputPtr);
      const destroy = exports.rnnoise_destroy || exports._rnnoise_destroy;
      destroy?.(state);
    };
  }

  suppressResidualNoise(frame, vad) {
    let squareSum = 0;
    let peak = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const sample = frame[i] || 0;
      squareSum += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    const rms = Math.sqrt(squareSum / Math.max(1, frame.length));
    const voiceProbability = Number.isFinite(vad) ? Math.max(0, Math.min(1, vad)) : 0.5;
    this.vadProbability += (voiceProbability - this.vadProbability) * (voiceProbability > this.vadProbability ? 0.55 : 0.18);
    if (this.vadProbability < 0.38 && peak < 0.08) {
      this.noiseFloor = (this.noiseFloor * 0.985) + (rms * 0.015);
    }
    const noiseRatio = rms / Math.max(this.noiseFloor * 3.2, 0.000001);
    const wantedGain = this.vadProbability >= 0.62 || noiseRatio >= 3.8 ? 1 : Math.max(0.018, Math.min(0.45, noiseRatio * 0.16 + this.vadProbability * 0.18));
    this.residualGain += (wantedGain - this.residualGain) * (wantedGain > this.residualGain ? 0.28 : 0.08);
    const cleaned = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i += 1) {
      const current = frame[i] * this.residualGain;
      const smoothed = (current * 0.86) + (this.previousOutput * 0.14);
      this.previousOutput = smoothed;
      cleaned[i] = Math.max(-1, Math.min(1, smoothed));
    }
    return cleaned;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;
    if (!input || !this.ready || !this.denoise) {
      if (input) output.set(input);
      else output.fill(0);
      return true;
    }
    for (let i = 0; i < output.length; i += 1) {
      this.inputBuffer[this.inputOffset] = input[i] || 0;
      this.inputOffset += 1;
      if (this.inputOffset === 480) {
        const denoised = this.denoise(this.inputBuffer);
        this.outputBuffer = this.suppressResidualNoise(denoised.samples, denoised.vad);
        this.outputOffset = 0;
        this.inputOffset = 0;
      }
      output[i] = this.outputOffset < this.outputBuffer.length ? this.outputBuffer[this.outputOffset++] : 0;
    }
    return true;
  }
}

registerProcessor("rnnoise-processor", RnnoiseProcessor);
