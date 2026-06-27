class VoiceGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.thresholdDb = -45;
    this.attackMs = 6;
    this.releaseMs = 90;
    this.floor = 0;
    this.gain = 0;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type !== "settings") return;
      if (Number.isFinite(data.thresholdDb)) this.thresholdDb = Math.max(-80, Math.min(-10, data.thresholdDb));
      if (Number.isFinite(data.attackMs)) this.attackMs = Math.max(1, Math.min(80, data.attackMs));
      if (Number.isFinite(data.releaseMs)) this.releaseMs = Math.max(20, Math.min(400, data.releaseMs));
    };
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
    const targetGain = levelDb >= this.thresholdDb ? 1 : this.floor;
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
