import { db, ref, onValue } from "./firebase.js";

export const CAMERA_CONFIGS_PATH = "cameraOverlayConfigs";
export const CAMERA_PRESENCE_PATH = "guestCameras/presence";
export const CAMERA_SIGNALING_PATH = "guestCameras/signaling";
export const CAMERA_ROUNDS = ["round1", "round2", "round3", "round4", "round5", "round6"];

export const CAMERA_ROLE_OPTIONS = [
  { value: "auto", label: "Auto / non assignée" },
  { value: "participant", label: "Participant à la manche" },
  { value: "viewer", label: "Viewer / Twitch" },
  { value: "duel-1", label: "Duel joueur 1" },
  { value: "duel-2", label: "Duel joueur 2" },
  { value: "host", label: "Host / animateur" },
  { value: "custom", label: "Libellé personnalisé" },
];

export const CAMERA_SLOT_DEFAULT = {
  enabled: true,
  x: 40,
  y: 40,
  width: 260,
  height: 146,
  borderRadius: 18,
  zIndex: 1,
  fit: "cover",
  role: "auto",
  label: "",
  guestId: "",
};

export const CAMERA_DEFAULT_CONFIG = {
  enabled: false,
  cameraCount: 1,
  x: 40,
  y: 40,
  width: 260,
  height: 146,
  gap: 14,
  perRow: 3,
  borderRadius: 18,
  showNames: true,
  cameras: [{ ...CAMERA_SLOT_DEFAULT }],
};

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeText(value, max = 80) {
  return String(value || "").trim().slice(0, max);
}

function normalizeRole(value) {
  const role = normalizeText(value, 32);
  return CAMERA_ROLE_OPTIONS.some((option) => option.value === role) ? role : "auto";
}

function normalizeFit(value) {
  return value === "contain" ? "contain" : "cover";
}

function defaultSlotFromLegacy(raw, index) {
  const perRow = clampInt(raw.perRow, CAMERA_DEFAULT_CONFIG.perRow, 1, 12);
  const width = clampInt(raw.width, CAMERA_DEFAULT_CONFIG.width, 80, 1920);
  const height = clampInt(raw.height, CAMERA_DEFAULT_CONFIG.height, 60, 1080);
  const gap = clampInt(raw.gap, CAMERA_DEFAULT_CONFIG.gap, 0, 300);
  return {
    ...CAMERA_SLOT_DEFAULT,
    x: clampInt(raw.x, CAMERA_DEFAULT_CONFIG.x, -4000, 4000) + (index % perRow) * (width + gap),
    y: clampInt(raw.y, CAMERA_DEFAULT_CONFIG.y, -4000, 4000) + Math.floor(index / perRow) * (height + gap),
    width,
    height,
    borderRadius: clampInt(raw.borderRadius, CAMERA_DEFAULT_CONFIG.borderRadius, 0, 240),
    zIndex: index + 1,
  };
}

export function normalizeCameraSlot(raw = {}, fallback = CAMERA_SLOT_DEFAULT) {
  return {
    enabled: Boolean(raw.enabled ?? fallback.enabled),
    x: clampInt(raw.x, fallback.x, -4000, 4000),
    y: clampInt(raw.y, fallback.y, -4000, 4000),
    width: clampInt(raw.width, fallback.width, 80, 1920),
    height: clampInt(raw.height, fallback.height, 60, 1080),
    borderRadius: clampInt(raw.borderRadius, fallback.borderRadius, 0, 240),
    zIndex: clampInt(raw.zIndex, fallback.zIndex, 0, 999),
    fit: normalizeFit(raw.fit ?? fallback.fit),
    role: normalizeRole(raw.role ?? fallback.role),
    label: normalizeText(raw.label ?? fallback.label, 80),
    guestId: normalizeText(raw.guestId ?? fallback.guestId, 120),
  };
}

export function normalizeCameraConfig(raw = {}) {
  const legacyCount = raw.cameraCount ?? raw.count ?? (Array.isArray(raw.cameras) ? raw.cameras.length : 1);
  const cameraCount = clampInt(legacyCount, CAMERA_DEFAULT_CONFIG.cameraCount, 0, 12);
  const cameras = Array.from({ length: cameraCount }, (_, index) => {
    const legacyFallback = defaultSlotFromLegacy(raw, index);
    return normalizeCameraSlot(Array.isArray(raw.cameras) ? raw.cameras[index] : {}, legacyFallback);
  });

  return {
    enabled: Boolean(raw.enabled),
    cameraCount,
    x: clampInt(raw.x, CAMERA_DEFAULT_CONFIG.x, -4000, 4000),
    y: clampInt(raw.y, CAMERA_DEFAULT_CONFIG.y, -4000, 4000),
    width: clampInt(raw.width, CAMERA_DEFAULT_CONFIG.width, 80, 1920),
    height: clampInt(raw.height, CAMERA_DEFAULT_CONFIG.height, 60, 1080),
    gap: clampInt(raw.gap, CAMERA_DEFAULT_CONFIG.gap, 0, 300),
    perRow: clampInt(raw.perRow, CAMERA_DEFAULT_CONFIG.perRow, 1, 12),
    borderRadius: clampInt(raw.borderRadius, CAMERA_DEFAULT_CONFIG.borderRadius, 0, 240),
    showNames: Boolean(raw.showNames ?? CAMERA_DEFAULT_CONFIG.showNames),
    cameras,
  };
}

export function watchCameraConfig(roundKey, callback) {
  callback(normalizeCameraConfig(CAMERA_DEFAULT_CONFIG));
  return onValue(ref(db, `${CAMERA_CONFIGS_PATH}/${roundKey}`), (snap) => {
    callback(normalizeCameraConfig(snap.val() || CAMERA_DEFAULT_CONFIG));
  });
}
