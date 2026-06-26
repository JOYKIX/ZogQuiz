class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.ready = false;
    this.module = null;
    this.exports = null;
    this.port.onmessage = async (event) => {
      if (event.data?.type !== "load" || !event.data?.wasm) return;
      try {
        this.module = await WebAssembly.instantiate(event.data.wasm, {});
        this.exports = this.module.instance?.exports || null;
        this.ready = Boolean(this.exports);
        this.port.postMessage({ type: "ready", active: this.ready });
      } catch (error) {
        this.ready = false;
        this.port.postMessage({ type: "fallback", message: error?.message || "RNNoise indisponible" });
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const channels = Math.min(input?.length || 0, output?.length || 0);
    for (let channel = 0; channel < channels; channel += 1) {
      output[channel].set(input[channel]);
    }
    return true;
  }
}

registerProcessor("rnnoise-processor", RNNoiseProcessor);
