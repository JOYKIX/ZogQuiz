import { db, ref, onValue } from "./firebase.js";

export const CAMERA_CONFIGS_PATH = "cameraOverlayConfigs";
export const CAMERA_PRESENCE_PATH = "guestCameras/presence";
export const CAMERA_SIGNALING_PATH = "guestCameras/signaling";
export const CAMERA_ROUNDS = ["round1", "round2", "round3", "round4", "round5", "round6"];
export const ADMIN_CAMERA_ID = "admin-host";
export const ADMIN_CAMERA_LABEL = "Admin";
export const ROUND_KEY_TO_ROOM = {
  round1: "manche1",
  round2: "manche2",
  round3: "manche3",
  round4: "manche4",
  round5: "manche5",
  round6: "manche6",
};
export const ROOM_TO_ROUND_KEY = Object.fromEntries(Object.entries(ROUND_KEY_TO_ROOM).map(([roundKey, roomKey]) => [roomKey, roundKey]));

export const CAMERA_ROLE_OPTIONS = [
  { value: "auto", label: "Auto / non assignée" },
  { value: "admin", label: "Cam admin" },
  { value: "participant", label: "Participant à la manche" },
  { value: "viewer", label: "Viewer / Twitch" },
  { value: "duel-1", label: "Duel attaquant (manche 5)" },
  { value: "duel-2", label: "Duel cible (manche 5)" },
  { value: "host", label: "Host / animateur" },
  { value: "custom", label: "Libellé personnalisé" },
];

export const CAMERA_ROUND_STATE_PATHS = {
  round3: ["rooms/manche3/state"],
  round5: ["rounds/round5"],
  round6: ["rooms/manche6/state"],
};

export const CAMERA_SLOT_DEFAULT = {
  enabled: true,
  x: 0,
  y: 0,
  width: 260,
  height: 146,
  borderRadius: 18,
  zIndex: 1,
  fit: "cover",
  role: "auto",
  label: "",
  guestId: "",
  participantId: "",
};

export const CAMERA_DEFAULT_CONFIG = {
  enabled: false,
  cameraCount: 1,
  x: 0,
  y: 0,
  width: 260,
  height: 146,
  gap: 14,
  perRow: 3,
  borderRadius: 18,
  showNames: false,
  preview: false,
  cameras: [{ ...CAMERA_SLOT_DEFAULT }],
};

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function clampPx(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.max(min, Math.min(max, numeric));
  return Number(clamped.toFixed(1));
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

export function getCameraRoleLabel(role) {
  return CAMERA_ROLE_OPTIONS.find((option) => option.value === role)?.label || "Auto / non assignée";
}

export function getCameraSlotPreviewLabel(slot = {}, index = 0) {
  return normalizeText(slot.label, 80) || getCameraRoleLabel(normalizeRole(slot.role)) || `Cam ${index + 1}`;
}

function defaultSlotFromLegacy(raw, index) {
  const perRow = clampInt(raw.perRow, CAMERA_DEFAULT_CONFIG.perRow, 1, 12);
  const width = clampPx(raw.width, CAMERA_DEFAULT_CONFIG.width, 80, 1920);
  const height = clampPx(raw.height, CAMERA_DEFAULT_CONFIG.height, 60, 1080);
  const gap = clampPx(raw.gap, CAMERA_DEFAULT_CONFIG.gap, 0, 300);
  return {
    ...CAMERA_SLOT_DEFAULT,
    x: clampPx(clampPx(raw.x, CAMERA_DEFAULT_CONFIG.x, -4000, 4000) + (index % perRow) * (width + gap), CAMERA_DEFAULT_CONFIG.x, -4000, 4000),
    y: clampPx(clampPx(raw.y, CAMERA_DEFAULT_CONFIG.y, -4000, 4000) + Math.floor(index / perRow) * (height + gap), CAMERA_DEFAULT_CONFIG.y, -4000, 4000),
    width,
    height,
    borderRadius: clampPx(raw.borderRadius, CAMERA_DEFAULT_CONFIG.borderRadius, 0, 240),
    zIndex: index + 1,
  };
}

export function normalizeCameraSlot(raw = {}, fallback = CAMERA_SLOT_DEFAULT) {
  return {
    enabled: Boolean(raw.enabled ?? fallback.enabled),
    x: clampPx(raw.x, fallback.x, -4000, 4000),
    y: clampPx(raw.y, fallback.y, -4000, 4000),
    width: clampPx(raw.width, fallback.width, 80, 1920),
    height: clampPx(raw.height, fallback.height, 60, 1080),
    borderRadius: clampPx(raw.borderRadius, fallback.borderRadius, 0, 240),
    zIndex: clampInt(raw.zIndex, fallback.zIndex, 0, 999),
    fit: normalizeFit(raw.fit ?? fallback.fit),
    role: normalizeRole(raw.role ?? fallback.role),
    label: normalizeText(raw.label ?? fallback.label, 80),
    guestId: normalizeText(raw.guestId ?? fallback.guestId, 120),
    participantId: normalizeText(raw.participantId ?? fallback.participantId, 120),
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
    x: clampPx(raw.x, CAMERA_DEFAULT_CONFIG.x, -4000, 4000),
    y: clampPx(raw.y, CAMERA_DEFAULT_CONFIG.y, -4000, 4000),
    width: clampPx(raw.width, CAMERA_DEFAULT_CONFIG.width, 80, 1920),
    height: clampPx(raw.height, CAMERA_DEFAULT_CONFIG.height, 60, 1080),
    gap: clampPx(raw.gap, CAMERA_DEFAULT_CONFIG.gap, 0, 300),
    perRow: clampInt(raw.perRow, CAMERA_DEFAULT_CONFIG.perRow, 1, 12),
    borderRadius: clampPx(raw.borderRadius, CAMERA_DEFAULT_CONFIG.borderRadius, 0, 240),
    showNames: Boolean(raw.showNames ?? CAMERA_DEFAULT_CONFIG.showNames),
    preview: Boolean(raw.preview ?? CAMERA_DEFAULT_CONFIG.preview),
    cameras,
  };
}

export function watchCameraConfig(roundKey, callback) {
  callback(normalizeCameraConfig(CAMERA_DEFAULT_CONFIG));
  return onValue(ref(db, `${CAMERA_CONFIGS_PATH}/${roundKey}`), (snap) => {
    callback(normalizeCameraConfig(snap.val() || CAMERA_DEFAULT_CONFIG));
  });
}


function uniqueIds(values) {
  const ids = [];
  const seen = new Set();
  values.forEach((value) => {
    const id = normalizeText(value, 120);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function collectRound5Ids(rawState = {}) {
  const state = rawState?.state || rawState || {};
  const participants = rawState?.participants || state.participants || {};
  const duel = rawState?.duel || state.duel || {};
  const turn = rawState?.turn || state.turn || {};
  const aliveFromParticipants = Object.entries(participants)
    .filter(([, participant]) => participant?.active !== false && participant?.eliminated !== true && participant?.alive !== false && Number(participant?.hp ?? 1) > 0)
    .map(([id]) => id);
  return uniqueIds([duel.attackerId, duel.targetId, turn.currentPlayerId, state.currentTurnPlayerId, state.targetPlayerId, ...(turn.order || []), ...(state.turnOrder || []), ...aliveFromParticipants]);
}

export function getActiveParticipantIdsForRound(roundKey, roundState = {}) {
  if (roundKey === "round3") return uniqueIds([roundState?.activePlayerId]);
  if (roundKey === "round5") return collectRound5Ids(roundState);
  if (roundKey === "round6") {
    return uniqueIds([
      roundState?.participantId,
      roundState?.viewerId,
      roundState?.players?.participantId,
      roundState?.players?.viewerId,
      roundState?.players?.participant?.id,
      roundState?.players?.viewer?.id,
      roundState?.duel?.participantId,
      roundState?.duel?.viewerId,
    ]);
  }
  return [];
}

export function getCameraRoleParticipantIds(roundKey, roundState = {}) {
  if (roundKey === "round5") {
    const state = roundState?.state || roundState || {};
    const duel = roundState?.duel || state.duel || {};
    return {
      "duel-1": uniqueIds([duel.attackerId]),
      "duel-2": uniqueIds([duel.targetId]),
      participant: collectRound5Ids(roundState),
    };
  }

  if (roundKey === "round6") {
    return {
      participant: uniqueIds([roundState?.participantId, roundState?.players?.participantId, roundState?.players?.participant?.id, roundState?.duel?.participantId]),
      viewer: uniqueIds([roundState?.viewerId, roundState?.players?.viewerId, roundState?.players?.viewer?.id, roundState?.duel?.viewerId]),
    };
  }

  return { participant: getActiveParticipantIdsForRound(roundKey, roundState) };
}

export function resolveCameraSlotGuestId(slot, { activeEntries = [], activeParticipantIds = [], roleParticipantIds = {}, used = new Set(), includeAdmin = true } = {}) {
  if (!slot?.enabled) return "";
  const activeById = new Map(activeEntries);
  if (slot.participantId) return activeById.has(slot.participantId) && !used.has(slot.participantId) ? slot.participantId : "";
  if (slot.role === "admin") return includeAdmin && activeById.has(ADMIN_CAMERA_ID) ? ADMIN_CAMERA_ID : "";
  if (slot.guestId && activeById.has(slot.guestId) && !used.has(slot.guestId)) return slot.guestId;
  if (["participant", "viewer", "duel-1", "duel-2"].includes(slot.role)) {
    const fallbackIndex = slot.role === "duel-2" || slot.role === "viewer" ? 1 : 0;
    const orderedIds = roleParticipantIds[slot.role]?.length
      ? roleParticipantIds[slot.role]
      : (slot.role === "participant" ? activeParticipantIds : [activeParticipantIds[fallbackIndex]]);
    const participantId = orderedIds.find((id) => activeById.has(id) && !used.has(id));
    if (participantId) return participantId;
  }
  if (slot.role === "host") return includeAdmin && activeById.has(ADMIN_CAMERA_ID) && !used.has(ADMIN_CAMERA_ID) ? ADMIN_CAMERA_ID : "";
  const next = activeEntries.find(([candidateId]) => !used.has(candidateId) && candidateId !== ADMIN_CAMERA_ID);
  return next?.[0] || "";
}
