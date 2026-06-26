import { Rnnoise } from "./vendor/rnnoise/rnnoise.js";

const FRAME_SIZE = 480;
const INPUT_SCALE = 32768;
const OUTPUT_SCALE = 1 / INPUT_SCALE;
const VAD_FLOOR = 0.24;
const VAD_MUTE = 0.08;
const NOISE_FLOOR_ATTENUATION = 0.015;
const GATE_ATTACK = 0.35;
const GATE_RELEASE = 0.08;

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.denoiseState = null;
    this.inputFrame = new Float32Array(FRAME_SIZE);
    this.outputFrame = new Float32Array(FRAME_SIZE);
    this.frameOffset = 0;
    this.outputQueue = [];
    this.noiseGateGain = 0;
    this.closed = false;
    this.port.onmessage = (event) => {
      if (event.data?.type === "destroy") this.destroy();
    };
    Rnnoise.load()
      .then((rnnoise) => {
        if (this.closed) return;
        this.denoiseState = rnnoise.createDenoiseState();
        this.ready = true;
        this.port.postMessage({ type: "ready" });
      })
      .catch((error) => {
        this.ready = false;
        this.port.postMessage({ type: "error", message: error?.message || "RNNoise indisponible" });
      });
  }

  destroy() {
    this.closed = true;
    this.ready = false;
    this.denoiseState?.destroy?.();
    this.denoiseState = null;
    this.outputQueue.length = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return !this.closed;
    if (!input || !this.ready || !this.denoiseState) {
      if (input) output.set(input);
      else output.fill(0);
      return !this.closed;
    }

    for (let inputIndex = 0; inputIndex < input.length;) {
      const copyLength = Math.min(FRAME_SIZE - this.frameOffset, input.length - inputIndex);
      this.inputFrame.set(input.subarray(inputIndex, inputIndex + copyLength), this.frameOffset);
      this.frameOffset += copyLength;
      inputIndex += copyLength;

      if (this.frameOffset !== FRAME_SIZE) continue;

      for (let i = 0; i < FRAME_SIZE; i += 1) {
        this.outputFrame[i] = Math.max(-1, Math.min(1, this.inputFrame[i])) * INPUT_SCALE;
      }
      const voiceProbability = this.denoiseState.processFrame(this.outputFrame);
      const targetGain = voiceProbability <= VAD_MUTE ? 0 : (voiceProbability < VAD_FLOOR ? NOISE_FLOOR_ATTENUATION : 1);
      const smoothing = targetGain > this.noiseGateGain ? GATE_ATTACK : GATE_RELEASE;
      for (let i = 0; i < FRAME_SIZE; i += 1) {
        this.noiseGateGain += (targetGain - this.noiseGateGain) * smoothing;
        this.outputFrame[i] = Math.max(-1, Math.min(1, this.outputFrame[i] * OUTPUT_SCALE * this.noiseGateGain));
      }
      this.outputQueue.push(this.outputFrame.slice());
      this.frameOffset = 0;
    }

    let outputIndex = 0;
    while (outputIndex < output.length && this.outputQueue.length) {
      const chunk = this.outputQueue[0];
      const copyLength = Math.min(chunk.length, output.length - outputIndex);
      output.set(chunk.subarray(0, copyLength), outputIndex);
      outputIndex += copyLength;
      if (copyLength === chunk.length) this.outputQueue.shift();
      else this.outputQueue[0] = chunk.subarray(copyLength);
    }

    if (outputIndex < output.length) output.fill(0, outputIndex);
    return !this.closed;
  }
}

registerProcessor("rnnoise-processor", RNNoiseProcessor);
