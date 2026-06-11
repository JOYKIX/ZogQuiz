class CleanVoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "gateFloor", defaultValue: 0.075, minValue: 0.02, maxValue: 0.3, automationRate: "k-rate" },
      { name: "attack", defaultValue: 0.16, minValue: 0.02, maxValue: 0.8, automationRate: "k-rate" },
      { name: "release", defaultValue: 0.045, minValue: 0.01, maxValue: 0.4, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.noiseFloor = 0.008;
    this.gain = 1;
    this.previousRms = 0.008;
    this.clickDuckFrames = 0;
    this.framesSinceVoice = 48000;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const channelCount = Math.min(input.length, output.length);
    if (!channelCount) return true;

    let sumSquares = 0;
    let peak = 0;
    let sampleCount = 0;
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const channel = input[channelIndex];
      for (let index = 0; index < channel.length; index += 1) {
        const sample = channel[index] || 0;
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
        sampleCount += 1;
      }
    }

    const rms = Math.sqrt(sumSquares / Math.max(sampleCount, 1));
    const noiseLearnRate = rms < Math.max(this.noiseFloor * 1.7, 0.018) ? 0.018 : 0.0015;
    this.noiseFloor = (this.noiseFloor * (1 - noiseLearnRate)) + (rms * noiseLearnRate);

    const voiceThreshold = Math.max(this.noiseFloor * 2.6, 0.016);
    const strongVoiceThreshold = Math.max(this.noiseFloor * 4.3, 0.035);
    const isVoice = rms > voiceThreshold || peak > strongVoiceThreshold;
    this.framesSinceVoice = isVoice ? 0 : this.framesSinceVoice + (input[0]?.length || 128);

    const suddenTransient = rms > Math.max(this.previousRms * 4.5, this.noiseFloor * 5.8, 0.05)
      && peak > 0.16
      && this.framesSinceVoice > sampleRate * 0.09;
    if (suddenTransient) this.clickDuckFrames = Math.max(this.clickDuckFrames, Math.round(sampleRate * 0.055));

    const gateFloor = parameters.gateFloor[0];
    const attack = parameters.attack[0];
    const release = parameters.release[0];
    const targetGain = isVoice ? 1 : gateFloor;
    const smoothing = targetGain > this.gain ? attack : release;
    this.gain += (targetGain - this.gain) * smoothing;

    let duckGain = 1;
    if (this.clickDuckFrames > 0) {
      duckGain = 0.32;
      this.clickDuckFrames = Math.max(0, this.clickDuckFrames - (input[0]?.length || 128));
    }

    const finalGain = this.gain * duckGain;
    for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
      const source = input[Math.min(channelIndex, channelCount - 1)] || [];
      const target = output[channelIndex];
      for (let index = 0; index < target.length; index += 1) {
        target[index] = (source[index] || 0) * finalGain;
      }
    }

    this.previousRms = (this.previousRms * 0.7) + (rms * 0.3);
    return true;
  }
}

registerProcessor("clean-voice-processor", CleanVoiceProcessor);
