class VoiceGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.noiseFloorDb = -72;
    this.openOffsetDb = 12;
    this.closeOffsetDb = 7;
    this.attackMs = 4;
    this.releaseMs = 130;
    this.floor = 0.015;
    this.gain = 0;
    this.holdFrames = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;
    if (!input) {
      output.fill(0);
      return true;
    }

    let squareSum = 0;
    for (let i = 0; i < input.length; i += 1) squareSum += input[i] * input[i];
    const rms = Math.sqrt(squareSum / Math.max(1, input.length));
    const levelDb = 20 * Math.log10(Math.max(rms, 0.000001));
    const isLikelyNoise = levelDb < this.noiseFloorDb + this.openOffsetDb;
    const floorSmoothing = isLikelyNoise ? 0.995 : 0.9997;
    this.noiseFloorDb = (this.noiseFloorDb * floorSmoothing) + (Math.min(levelDb, -25) * (1 - floorSmoothing));

    const openThresholdDb = Math.max(-62, Math.min(-28, this.noiseFloorDb + this.openOffsetDb));
    const closeThresholdDb = Math.max(-68, openThresholdDb - this.closeOffsetDb);
    if (levelDb >= openThresholdDb) this.holdFrames = Math.ceil((sampleRate * 0.18) / input.length);
    else if (levelDb < closeThresholdDb && this.holdFrames > 0) this.holdFrames -= 1;
    const targetGain = this.holdFrames > 0 || levelDb >= openThresholdDb ? 1 : this.floor;
    const timeMs = targetGain > this.gain ? this.attackMs : this.releaseMs;
    const step = 1 - Math.exp(-1000 / (sampleRate * timeMs));

    for (let i = 0; i < input.length; i += 1) {
      this.gain += (targetGain - this.gain) * step;
      output[i] = input[i] * this.gain;
    }
    return true;
  }
}

registerProcessor("voice-gate-processor", VoiceGateProcessor);
