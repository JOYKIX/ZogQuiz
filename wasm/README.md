Place `rnnoise.wasm` here.

The voice chat first captures the microphone with browser noise suppression disabled when RNNoise is selected, then routes the signal through `AudioContext`, `js/rnnoise-worklet.js`, light voice shaping, and `MediaStreamDestination` before sending the processed track through WebRTC.

If `wasm/rnnoise.wasm` is missing or cannot be instantiated, the client keeps WebRTC voice active and falls back to the non-RNNoise path with native echo cancellation.
