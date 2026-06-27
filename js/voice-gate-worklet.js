class VoiceGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.noiseFloorDb = -74;
    this.openOffsetDb = 16;
    this.closeOffsetDb = 8;
    this.attackMs = 3;
    this.releaseMs = 190;
    this.floor = 0.008;
    this.gain = 0;
    this.holdFrames = 0;
    this.clickSuppressFrames = 0;
    this.previousSample = 0;
    this.previousRms = 0.000001;
    this.transientEnergy = 0;
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
    let diffSum = 0;
    let peak = 0;
    let zeroCrossings = 0;
    let previous = this.previousSample;
    for (let i = 0; i < input.length; i += 1) {
      const sample = input[i] || 0;
      squareSum += sample * sample;
      diffSum += Math.abs(sample - previous);
      peak = Math.max(peak, Math.abs(sample));
      if ((sample >= 0 && previous < 0) || (sample < 0 && previous >= 0)) zeroCrossings += 1;
      previous = sample;
    }
    this.previousSample = previous;

    const rms = Math.sqrt(squareSum / Math.max(1, input.length));
    const levelDb = 20 * Math.log10(Math.max(rms, 0.000001));
    const zcr = zeroCrossings / Math.max(1, input.length);
    const crest = peak / Math.max(rms, 0.000001);
    const diffRatio = diffSum / Math.max(rms * input.length, 0.000001);
    const riseRatio = rms / Math.max(this.previousRms, 0.000001);

    const openThresholdDb = Math.max(-60, Math.min(-30, this.noiseFloorDb + this.openOffsetDb));
    const closeThresholdDb = Math.max(-68, openThresholdDb - this.closeOffsetDb);
    const aboveOpen = levelDb >= openThresholdDb;
    const keyboardLikeTransient = aboveOpen && crest > 9 && riseRatio > 2.8 && (zcr > 0.18 || diffRatio > 2.6);
    const mouseLikeClick = levelDb > closeThresholdDb && crest > 12 && riseRatio > 3.5;
    const isParasiteTransient = keyboardLikeTransient || mouseLikeClick;
    const isLikelyVoice = aboveOpen && !isParasiteTransient;
    const isLikelyNoise = levelDb < openThresholdDb && this.holdFrames === 0;
    const floorSmoothing = isLikelyNoise ? 0.993 : 0.9998;
    this.noiseFloorDb = (this.noiseFloorDb * floorSmoothing) + (Math.min(levelDb, -28) * (1 - floorSmoothing));

    if (isParasiteTransient && this.holdFrames === 0) {
      this.clickSuppressFrames = Math.max(this.clickSuppressFrames, Math.ceil((sampleRate * 0.055) / input.length));
    }
    if (isLikelyVoice) this.holdFrames = Math.ceil((sampleRate * 0.24) / input.length);
    else if (levelDb < closeThresholdDb && this.holdFrames > 0) this.holdFrames -= 1;

    if (this.clickSuppressFrames > 0) this.clickSuppressFrames -= 1;
    const voiceHeld = this.holdFrames > 0 || isLikelyVoice;
    const transientTarget = this.clickSuppressFrames > 0 && !voiceHeld ? 0.18 : 1;
    this.transientEnergy += (transientTarget - this.transientEnergy) * (transientTarget < this.transientEnergy ? 0.45 : 0.18);
    const targetGain = (voiceHeld ? 1 : this.floor) * this.transientEnergy;
    const timeMs = targetGain > this.gain ? this.attackMs : this.releaseMs;
    const step = 1 - Math.exp(-1000 / (sampleRate * timeMs));

    for (let i = 0; i < input.length; i += 1) {
      this.gain += (targetGain - this.gain) * step;
      output[i] = input[i] * this.gain;
    }
    this.previousRms = (this.previousRms * 0.7) + (rms * 0.3);
    return true;
  }
}

registerProcessor("voice-gate-processor", VoiceGateProcessor);
