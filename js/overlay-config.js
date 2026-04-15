import { db, ref, onValue } from "./firebase.js";

export const OVERLAY_CONFIGS_PATH = "overlayConfigs";

export const OVERLAY_DEFAULTS = {
  round1: {
    questionFontSizePx: 72,
    questionColor: "#ffffff",
    questionFontWeight: 800,
    questionAlign: "center",
    maxWidthPx: 1600,
  },
  round2: {
    maxWidthPx: 1400,
    maxHeightPx: 820,
    borderRadiusPx: 0,
  },
  round3: {
    questionFontSizePx: 74,
    themeFontSizePx: 34,
    timerFontSizePx: 72,
    questionColor: "#ffffff",
    themeColor: "#cfe6ff",
    timerColor: "#8cf5dc",
    fontWeight: 800,
    align: "center",
    blockGapPx: 14,
    maxWidthPx: 1600,
  },
  round4: {
    clueFontSizePx: 40,
    clueColor: "#ffffff",
    wordFontSizePx: 28,
    cellRadiusPx: 14,
    markerSizePx: 18,
    markerOpacity: 0.95,
    gridMaxWidthPx: 1500,
    gridGapPx: 10,
  },
  round5: {
    primaryFontSizePx: 52,
    secondaryFontSizePx: 30,
    primaryColor: "#ffffff",
    secondaryColor: "#b5cef0",
    playingColor: "#57e389",
    pausedColor: "#ffd166",
    stoppedColor: "#ff6b6b",
    progressHeightPx: 10,
    cornerRadiusPx: 12,
    maxWidthPx: 1000,
    decorationOpacity: 0.2,
    progressMaxSeconds: 180,
  },
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const ALIGN_VALUES = new Set(["left", "center", "right"]);

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function clampFloat(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function asColor(value, fallback) {
  return typeof value === "string" && HEX_RE.test(value) ? value : fallback;
}

function asAlign(value, fallback) {
  return ALIGN_VALUES.has(value) ? value : fallback;
}

export function normalizeOverlayConfig(roundKey, raw = {}) {
  const defaults = OVERLAY_DEFAULTS[roundKey] || {};

  if (roundKey === "round1") {
    return {
      questionFontSizePx: clampInt(raw.questionFontSizePx, defaults.questionFontSizePx, 24, 200),
      questionColor: asColor(raw.questionColor, defaults.questionColor),
      questionFontWeight: clampInt(raw.questionFontWeight, defaults.questionFontWeight, 300, 900),
      questionAlign: asAlign(raw.questionAlign, defaults.questionAlign),
      maxWidthPx: clampInt(raw.maxWidthPx, defaults.maxWidthPx, 400, 2200),
    };
  }

  if (roundKey === "round2") {
    return {
      maxWidthPx: clampInt(raw.maxWidthPx, defaults.maxWidthPx, 200, 2400),
      maxHeightPx: clampInt(raw.maxHeightPx, defaults.maxHeightPx, 200, 1400),
      borderRadiusPx: clampInt(raw.borderRadiusPx, defaults.borderRadiusPx, 0, 120),
    };
  }

  if (roundKey === "round3") {
    return {
      questionFontSizePx: clampInt(raw.questionFontSizePx, defaults.questionFontSizePx, 20, 200),
      themeFontSizePx: clampInt(raw.themeFontSizePx, defaults.themeFontSizePx, 14, 120),
      timerFontSizePx: clampInt(raw.timerFontSizePx, defaults.timerFontSizePx, 20, 220),
      questionColor: asColor(raw.questionColor, defaults.questionColor),
      themeColor: asColor(raw.themeColor, defaults.themeColor),
      timerColor: asColor(raw.timerColor, defaults.timerColor),
      fontWeight: clampInt(raw.fontWeight, defaults.fontWeight, 300, 900),
      align: asAlign(raw.align, defaults.align),
      blockGapPx: clampInt(raw.blockGapPx, defaults.blockGapPx, 0, 120),
      maxWidthPx: clampInt(raw.maxWidthPx, defaults.maxWidthPx, 400, 2200),
    };
  }

  if (roundKey === "round4") {
    return {
      clueFontSizePx: clampInt(raw.clueFontSizePx, defaults.clueFontSizePx, 16, 140),
      clueColor: asColor(raw.clueColor, defaults.clueColor),
      wordFontSizePx: clampInt(raw.wordFontSizePx, defaults.wordFontSizePx, 12, 92),
      cellRadiusPx: clampInt(raw.cellRadiusPx, defaults.cellRadiusPx, 0, 60),
      markerSizePx: clampInt(raw.markerSizePx, defaults.markerSizePx, 8, 42),
      markerOpacity: clampFloat(raw.markerOpacity, defaults.markerOpacity, 0.1, 1),
      gridMaxWidthPx: clampInt(raw.gridMaxWidthPx, defaults.gridMaxWidthPx, 500, 2200),
      gridGapPx: clampInt(raw.gridGapPx, defaults.gridGapPx, 0, 40),
    };
  }

  if (roundKey === "round5") {
    return {
      primaryFontSizePx: clampInt(raw.primaryFontSizePx, defaults.primaryFontSizePx, 18, 140),
      secondaryFontSizePx: clampInt(raw.secondaryFontSizePx, defaults.secondaryFontSizePx, 12, 96),
      primaryColor: asColor(raw.primaryColor, defaults.primaryColor),
      secondaryColor: asColor(raw.secondaryColor, defaults.secondaryColor),
      playingColor: asColor(raw.playingColor, defaults.playingColor),
      pausedColor: asColor(raw.pausedColor, defaults.pausedColor),
      stoppedColor: asColor(raw.stoppedColor, defaults.stoppedColor),
      progressHeightPx: clampInt(raw.progressHeightPx, defaults.progressHeightPx, 2, 40),
      cornerRadiusPx: clampInt(raw.cornerRadiusPx, defaults.cornerRadiusPx, 0, 40),
      maxWidthPx: clampInt(raw.maxWidthPx, defaults.maxWidthPx, 300, 2200),
      decorationOpacity: clampFloat(raw.decorationOpacity, defaults.decorationOpacity, 0, 1),
      progressMaxSeconds: clampInt(raw.progressMaxSeconds, defaults.progressMaxSeconds, 30, 600),
    };
  }

  return { ...defaults };
}

export function watchOverlayConfig(roundKey, callback) {
  const defaults = OVERLAY_DEFAULTS[roundKey];
  const legacyPath = roundKey === "round1"
    ? "rooms/manche1/overlaySettings"
    : roundKey === "round3"
      ? "rooms/manche3/overlaySettings"
      : null;

  let legacyConfig = defaults;
  let newConfig = defaults;

  const emit = () => {
    const selected = newConfig || legacyConfig || defaults;
    callback(normalizeOverlayConfig(roundKey, selected));
  };

  const unsubscribers = [];

  if (legacyPath) {
    unsubscribers.push(onValue(ref(db, legacyPath), (snap) => {
      legacyConfig = normalizeOverlayConfig(roundKey, snap.val() || defaults);
      emit();
    }));
  }

  unsubscribers.push(onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/${roundKey}`), (snap) => {
    const value = snap.val();
    newConfig = value ? normalizeOverlayConfig(roundKey, value) : legacyConfig;
    emit();
  }));

  emit();

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") unsubscribe();
    });
  };
}
