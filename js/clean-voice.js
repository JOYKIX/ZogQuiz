const WORKLET_URL = new URL("./clean-voice-worklet.js", import.meta.url);
const CLEAN_VOICE_SETTINGS = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 },
});

function createNotchFilter(context, frequency) {
  const filter = new BiquadFilterNode(context, { type: "notch", frequency, Q: 18 });
  return filter;
}

function connectNodes(...nodes) {
  nodes.slice(0, -1).forEach((node, index) => node.connect(nodes[index + 1]));
}

export function cleanVoiceConstraints(deviceId = "") {
  const constraints = { ...CLEAN_VOICE_SETTINGS };
  if (deviceId) constraints.deviceId = { exact: deviceId };
  return constraints;
}

export async function createCleanVoiceStream(inputStream) {
  const [sourceTrack] = inputStream.getAudioTracks();
  if (!sourceTrack) {
    return { stream: inputStream, cleanup: () => {}, enhanced: false, reason: "no-audio-track" };
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !window.AudioWorkletNode) {
    return { stream: inputStream, cleanup: () => {}, enhanced: false, reason: "audio-worklet-unavailable" };
  }

  const context = new AudioContextClass({ latencyHint: "interactive" });
  try {
    if (context.state === "suspended") await context.resume();
    await context.audioWorklet.addModule(WORKLET_URL.href);

    const source = new MediaStreamAudioSourceNode(context, { mediaStream: inputStream });
    const highPass = new BiquadFilterNode(context, { type: "highpass", frequency: 95, Q: 0.7 });
    const lowShelf = new BiquadFilterNode(context, { type: "lowshelf", frequency: 180, gain: -5 });
    const presence = new BiquadFilterNode(context, { type: "peaking", frequency: 3200, Q: 0.85, gain: 2.4 });
    const lowPass = new BiquadFilterNode(context, { type: "lowpass", frequency: 8200, Q: 0.7 });
    const mains50 = createNotchFilter(context, 50);
    const mains60 = createNotchFilter(context, 60);
    const worklet = new AudioWorkletNode(context, "clean-voice-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: { gateFloor: 0.07, attack: 0.2, release: 0.055 },
    });
    const compressor = new DynamicsCompressorNode(context, {
      threshold: -31,
      knee: 18,
      ratio: 4,
      attack: 0.004,
      release: 0.19,
    });
    const limiter = new DynamicsCompressorNode(context, {
      threshold: -8,
      knee: 2,
      ratio: 16,
      attack: 0.001,
      release: 0.06,
    });
    const destination = new MediaStreamAudioDestinationNode(context);

    connectNodes(source, highPass, lowShelf, mains50, mains60, presence, lowPass, worklet, compressor, limiter, destination);

    const [cleanTrack] = destination.stream.getAudioTracks();
    cleanTrack.enabled = sourceTrack.enabled;
    cleanTrack.contentHint = "speech";

    const cleanup = () => {
      [source, highPass, lowShelf, mains50, mains60, presence, lowPass, worklet, compressor, limiter, destination].forEach((node) => {
        try { node.disconnect(); } catch {}
      });
      inputStream.getTracks().forEach((track) => track.stop());
      destination.stream.getTracks().forEach((track) => track.stop());
      context.close().catch(() => {});
    };

    return { stream: destination.stream, cleanup, enhanced: true, reason: "clean-voice-active" };
  } catch (error) {
    await context.close().catch(() => {});
    console.warn("CleanVoice fallback:", error);
    return { stream: inputStream, cleanup: () => {}, enhanced: false, reason: "clean-voice-fallback" };
  }
}
