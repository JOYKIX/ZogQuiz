export const GUEST_SESSIONS_PATH = "rooms/manche1/guestSessions";

export const PARTICIPANT_COLOR_PALETTE = [
  "#ff6b6b",
  "#4ecdc4",
  "#ffd166",
  "#6aa9ff",
  "#c77dff",
  "#7bd389",
  "#ff8fab",
  "#ff9f1c",
  "#2ec4b6",
  "#a0c4ff",
];

const HEX_COLOR_PATTERN = /^#([0-9a-f]{6})$/i;

export function normalizeParticipantColor(rawColor, fallbackColor = PARTICIPANT_COLOR_PALETTE[0]) {
  const value = String(rawColor || "").trim();
  if (HEX_COLOR_PATTERN.test(value)) return value.toLowerCase();
  return String(fallbackColor || PARTICIPANT_COLOR_PALETTE[0]).toLowerCase();
}

function hashString(value) {
  return Array.from(String(value || "")).reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
}

export function getDefaultParticipantColor(participantId, takenColors = []) {
  const normalizedTaken = new Set((takenColors || []).map((color) => normalizeParticipantColor(color)));
  const baseIndex = Math.abs(hashString(participantId)) % PARTICIPANT_COLOR_PALETTE.length;
  for (let offset = 0; offset < PARTICIPANT_COLOR_PALETTE.length; offset += 1) {
    const candidate = PARTICIPANT_COLOR_PALETTE[(baseIndex + offset) % PARTICIPANT_COLOR_PALETTE.length];
    if (!normalizedTaken.has(candidate)) return candidate;
  }
  return PARTICIPANT_COLOR_PALETTE[baseIndex];
}

export function resolveParticipantColor({ participantId, rawColor, fallbackColor, takenColors = [] }) {
  const fallback = fallbackColor || getDefaultParticipantColor(participantId, takenColors);
  return normalizeParticipantColor(rawColor, fallback);
}

export function groupParticipantsByColor(sessionsById = {}) {
  const map = new Map();
  Object.entries(sessionsById).forEach(([participantId, session]) => {
    const color = resolveParticipantColor({ participantId, rawColor: session?.color });
    const list = map.get(color) || [];
    list.push(participantId);
    map.set(color, list);
  });
  return map;
}

export function computeReadableTextColor(hexColor) {
  const color = normalizeParticipantColor(hexColor);
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 150 ? "#0f1320" : "#f6f8ff";
}

export function buildMarkerBorderColor(hexColor) {
  return computeReadableTextColor(hexColor) === "#0f1320"
    ? "rgba(8, 12, 20, 0.72)"
    : "rgba(248, 250, 255, 0.95)";
}
