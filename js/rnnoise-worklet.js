class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    const processorOptions = options.processorOptions || {};
    this.ready = false;
    this.wasmReady = false;
    this.mode = processorOptions.mode || "standard";
    this.strength = Number(processorOptions.strength) || 0.62;
    this.attenuation = Number(processorOptions.attenuation) || 0.18;
    this.micSensitivity = Number(processorOptions.micSensitivity) || 1;
    this.noiseFloor = 0.007;
    this.gateGain = 1;
    this.hangoverFrames = 0;
    this.lastInput = 0;
    this.lastOutput = 0;
    this.port.onmessage = async (event) => {
      if (event.data?.type !== "load") return;
      this.mode = event.data.mode || this.mode;
      this.wasmReady = await this.loadWasm(event.data.wasmUrl || "wasm/rnnoise.wasm");
      this.ready = this.wasmReady;
      this.port.postMessage({ type: this.wasmReady ? "ready" : "fallback", active: this.wasmReady });
    };
  }

  async loadWasm(wasmUrl) {
    try {
      const response = await fetch(wasmUrl, { cache: "force-cache" });
      if (!response.ok) return false;
      const imports = { env: { memory: new WebAssembly.Memory({ initial: 32 }) } };
      const result = await WebAssembly.instantiate(await response.arrayBuffer(), imports);
      this.wasm = result.instance || result;
      return true;
    } catch (error) {
      return false;
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const channels = Math.min(input?.length || 0, output?.length || 0);
    for (let channel = 0; channel < channels; channel += 1) {
      const source = input[channel];
      const target = output[channel];
      if (!source) {
        target.fill(0);
        continue;
      }

      let sum = 0;
      let peak = 0;
      let zeroCrossings = 0;
      let previous = this.lastInput;
      for (let i = 0; i < source.length; i += 1) {
        const sample = source[i];
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
        if ((sample >= 0 && previous < 0) || (sample < 0 && previous >= 0)) zeroCrossings += 1;
        previous = sample;
      }
      this.lastInput = previous;

      const rms = Math.sqrt(sum / Math.max(1, source.length));
      const zcr = zeroCrossings / Math.max(1, source.length);
      const transientLikely = peak > Math.max(0.04, rms * 7) && zcr > 0.18;
      const voiceLikely = rms > Math.max(0.011, this.noiseFloor * 2.15) && zcr > 0.015 && zcr < 0.24 && !transientLikely;
      const floorRate = voiceLikely ? 0.00025 : 0.012;
      this.noiseFloor = (this.noiseFloor * (1 - floorRate)) + (Math.min(rms, 0.07) * floorRate);
      this.noiseFloor = Math.min(0.04, Math.max(0.0025, this.noiseFloor));

      if (voiceLikely) this.hangoverFrames = 26;
      else this.hangoverFrames = Math.max(0, this.hangoverFrames - 1);

      const openAt = Math.max(0.012, this.noiseFloor * (this.mode === "strong" ? 1.95 : 2.15));
      const closeAt = Math.max(0.007, this.noiseFloor * 1.25);
      const inRelease = this.hangoverFrames > 0;
      let targetGate = 1;
      if (rms < closeAt && !inRelease) targetGate = this.attenuation;
      else if (rms < openAt && !inRelease) targetGate = this.attenuation + ((1 - this.attenuation) * ((rms - closeAt) / Math.max(0.0001, openAt - closeAt)));
      if (transientLikely && !inRelease) targetGate *= this.mode === "strong" ? 0.36 : 0.52;
      targetGate = Math.max(this.mode === "strong" ? 0.08 : 0.14, Math.min(1, targetGate));

      const attack = targetGate > this.gateGain ? 0.55 : 0.045;
      this.gateGain = (this.gateGain * (1 - attack)) + (targetGate * attack);

      for (let i = 0; i < source.length; i += 1) {
        const sample = source[i];
        const clickReduced = transientLikely && !inRelease && Math.abs(sample) > rms * 5.2 ? sample * 0.45 : sample;
        const shaped = clickReduced * this.gateGain;
        const smoothed = (0.992 * shaped) + (0.008 * this.lastOutput);
        target[i] = Math.max(-1, Math.min(1, smoothed));
        this.lastOutput = target[i];
      }
    }
    return true;
  }
}

registerProcessor("rnnoise-processor", RNNoiseProcessor);
