Place `rnnoise.wasm` here.

The client tries to load `wasm/rnnoise.wasm` from the static server. If the file is missing or cannot be instantiated, the voice chat keeps WebRTC audio active with the native echo cancellation and gain control settings, but without RNNoise.
