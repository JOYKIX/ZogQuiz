class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.noiseFloor = 0.006;
    this.envelope = 0;
    this.gateGain = 1;
    this.lastInput = 0;
    this.lastOutput = 0;
    this.port.onmessage = async (event) => {
      if (event.data?.type !== "load") return;
      this.ready = true;
      this.port.postMessage({ type: "ready", active: true });
    };
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
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
        if ((sample >= 0 && previous < 0) || (sample < 0 && previous >= 0)) zeroCrossings += 1;
        previous = sample;
      }
      this.lastInput = previous;

      const rms = Math.sqrt(sum / Math.max(1, source.length));
      const zcr = zeroCrossings / Math.max(1, source.length);
      const voiceLikely = rms > this.noiseFloor * 2.8 && zcr < 0.23;
      const transientLikely = peak > Math.max(0.035, rms * 7.5) && zcr > 0.18;
      const floorRate = voiceLikely ? 0.00035 : 0.018;
      this.noiseFloor = (this.noiseFloor * (1 - floorRate)) + (Math.min(rms, 0.08) * floorRate);
      this.noiseFloor = Math.min(0.045, Math.max(0.0025, this.noiseFloor));

      const openAt = this.noiseFloor * 2.35;
      const closeAt = this.noiseFloor * 1.45;
      let targetGate = 1;
      if (rms < closeAt) targetGate = 0.08;
      else if (rms < openAt) targetGate = 0.08 + (0.92 * ((rms - closeAt) / Math.max(0.0001, openAt - closeAt)));
      if (transientLikely && !voiceLikely) targetGate *= 0.34;

      const attack = targetGate > this.gateGain ? 0.42 : 0.08;
      this.gateGain = (this.gateGain * (1 - attack)) + (targetGate * attack);

      for (let i = 0; i < source.length; i += 1) {
        const sample = source[i];
        const deClicked = transientLikely && Math.abs(sample) > rms * 5.5 ? sample * 0.55 : sample;
        const shaped = deClicked * this.gateGain;
        const smoothed = (0.985 * shaped) + (0.015 * this.lastOutput);
        target[i] = Math.max(-1, Math.min(1, smoothed));
        this.lastOutput = target[i];
      }
    }
    return true;
  }
}

registerProcessor("rnnoise-processor", RNNoiseProcessor);
