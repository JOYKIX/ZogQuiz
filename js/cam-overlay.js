import { initCameraOverlay } from "./guest-camera-webrtc.js";

const roundKey = document.body.dataset.round || new URLSearchParams(window.location.search).get("round") || "round1";
initCameraOverlay(roundKey);
