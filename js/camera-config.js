import { db, ref, onValue } from "./firebase.js";

export const CAMERA_CONFIGS_PATH = "cameraOverlayConfigs";
export const CAMERA_PRESENCE_PATH = "guestCameras/presence";
export const CAMERA_SIGNALING_PATH = "guestCameras/signaling";
export const CAMERA_ROUNDS = ["round1", "round2", "round3", "round4", "round5", "round6"];

export const CAMERA_DEFAULT_CONFIG = {
  enabled: false,
  x: 40,
  y: 40,
  width: 260,
  height: 146,
  gap: 14,
  perRow: 3,
  borderRadius: 18,
  showNames: true,
};

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

export function normalizeCameraConfig(raw = {}) {
  return {
    enabled: Boolean(raw.enabled),
    x: clampInt(raw.x, CAMERA_DEFAULT_CONFIG.x, -4000, 4000),
    y: clampInt(raw.y, CAMERA_DEFAULT_CONFIG.y, -4000, 4000),
    width: clampInt(raw.width, CAMERA_DEFAULT_CONFIG.width, 80, 1920),
    height: clampInt(raw.height, CAMERA_DEFAULT_CONFIG.height, 60, 1080),
    gap: clampInt(raw.gap, CAMERA_DEFAULT_CONFIG.gap, 0, 300),
    perRow: clampInt(raw.perRow, CAMERA_DEFAULT_CONFIG.perRow, 1, 12),
    borderRadius: clampInt(raw.borderRadius, CAMERA_DEFAULT_CONFIG.borderRadius, 0, 240),
    showNames: Boolean(raw.showNames ?? CAMERA_DEFAULT_CONFIG.showNames),
  };
}

export function watchCameraConfig(roundKey, callback) {
  callback(normalizeCameraConfig(CAMERA_DEFAULT_CONFIG));
  return onValue(ref(db, `${CAMERA_CONFIGS_PATH}/${roundKey}`), (snap) => {
    callback(normalizeCameraConfig(snap.val() || CAMERA_DEFAULT_CONFIG));
  });
}
