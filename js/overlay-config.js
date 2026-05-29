import { db, ref, onValue } from "./firebase.js";
import { normalizeTimerFormat } from "./timer-format.js";

export const OVERLAY_CONFIGS_PATH = "overlayConfigs";

export const OVERLAY_DEFAULTS = {
  round1: {
    maxFontSizePx: 80,
    minFontSizePx: 24,
    textColor: "#ffffff",
    fontWeight: 800,
    textShadow: true,
    horizontalAlign: "center",
    verticalAlign: "center",
    safePaddingPx: 40,
    lineHeight: 1.2,
    maxWidthPx: 1600,
  },
  round2: {
    maxWidthPx: 1400,
    maxHeightPx: 820,
    borderRadiusPx: 0,
  },
  round3: {
    questionFontSizePx: 74,
    questionMaxFontSizePx: 80,
    questionMinFontSizePx: 24,
    questionPaddingPx: 40,
    questionLineHeight: 1.2,
    themeColor: "#cfe6ff",
    fontWeight: 800,
    align: "center",
    maxWidthPx: 1600,
  },
  round3Timer: {
    timerFontSizePx: 72,
    timerColor: "#8cf5dc",
    timerFormat: "minutes-seconds",
    fontWeight: 950,
    align: "center",
    paddingPx: 40,
    lineHeight: 0.9,
    maxWidthPx: 2200,
  },
  round3ThemeOverlay: {
    textColor: "#cfe6ff",
    backgroundColor: "#10233f",
    activeBorderColor: "#ffda6b",
    fontSizePx: 34,
    fontWeight: 800,
    align: "center",
    columns: 2,
    maxWidthPx: 1600,
    paddingPx: 40,
    columnGapPx: 36,
    rowGapPx: 16,
    itemBackgroundWidthPercent: 100,
    itemPaddingYPx: 13,
    itemPaddingXPx: 21,
    borderRadiusPx: 14,
    borderWidthPx: 2,
    lineHeight: 1.08,
    letterSpacingEm: -0.035,
  },
  round4: {
    maxFontSizePx: 220,
    minFontSizePx: 36,
    textColor: "#ffffff",
    fontWeight: 950,
    textShadow: true,
    align: "center",
    paddingPx: 40,
    lineHeight: 1.04,
    maxWidthPx: 1800,
  },
  round5: {
    nameFontSizePx: 38,
    hpFontSizePx: 44,
    textColor: "#ffffff",
    healthColor: "#ffd54f",
    dangerColor: "#ff3d57",
    barHeightPx: 54,
    cornerRadiusPx: 12,
    maxWidthPx: 790,
    screenPaddingPx: 44,
    barGapPx: 34,
    frameOpacity: 0.92,
    dimmedOpacity: 0.34,
    maxHp: 0,
  },
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const ALIGN_VALUES = new Set(["left", "center", "right"]);
const V_ALIGN_VALUES = new Set(["top", "center", "bottom"]);

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
    const textColor = asColor(raw.textColor ?? raw.questionColor, defaults.textColor);
    const fontWeight = clampInt(raw.fontWeight ?? raw.questionFontWeight, defaults.fontWeight, 300, 900);
    const horizontalAlign = asAlign(raw.horizontalAlign ?? raw.questionAlign, defaults.horizontalAlign);
    const verticalAlign = V_ALIGN_VALUES.has(raw.verticalAlign) ? raw.verticalAlign : defaults.verticalAlign;
    const maxFontSizePx = clampInt(raw.maxFontSizePx ?? raw.questionFontSizePx, defaults.maxFontSizePx, 36, 320);
    const minFontSizePx = clampInt(raw.minFontSizePx, defaults.minFontSizePx, 14, 140);
    const lineHeight = clampFloat(raw.lineHeight ?? raw.questionLineHeight, defaults.lineHeight, 1, 2);
    return {
      maxFontSizePx: Math.max(minFontSizePx, maxFontSizePx),
      minFontSizePx: Math.min(minFontSizePx, maxFontSizePx),
      textColor,
      fontWeight,
      textShadow: Boolean(raw.textShadow ?? true),
      horizontalAlign,
      verticalAlign,
      safePaddingPx: clampInt(raw.safePaddingPx ?? raw.paddingPx, defaults.safePaddingPx, 8, 220),
      lineHeight,
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
    const questionMaxFontSizePx = clampInt(
      raw.questionMaxFontSizePx ?? raw.maxFontSizePx ?? raw.questionFontSizePx,
      defaults.questionMaxFontSizePx,
      20,
      220,
    );
    const questionMinFontSizePx = clampInt(
      raw.questionMinFontSizePx ?? raw.minFontSizePx,
      defaults.questionMinFontSizePx,
      14,
      140,
    );
    return {
      questionFontSizePx: clampInt(raw.questionFontSizePx, defaults.questionFontSizePx, 20, 200),
      questionMaxFontSizePx: Math.max(questionMinFontSizePx, questionMaxFontSizePx),
      questionMinFontSizePx: Math.min(questionMinFontSizePx, questionMaxFontSizePx),
      questionPaddingPx: clampInt(raw.questionPaddingPx ?? raw.paddingPx, defaults.questionPaddingPx, 0, 220),
      questionLineHeight: clampFloat(raw.questionLineHeight ?? raw.lineHeight, defaults.questionLineHeight, 1, 2),
      themeColor: asColor(raw.themeColor, defaults.themeColor),
      fontWeight: clampInt(raw.fontWeight, defaults.fontWeight, 300, 900),
      align: asAlign(raw.align, defaults.align),
      maxWidthPx: clampInt(raw.maxWidthPx, defaults.maxWidthPx, 400, 2200),
    };
  }

  if (roundKey === "round3Timer") {
    return {
      timerFontSizePx: clampInt(raw.timerFontSizePx, defaults.timerFontSizePx, 20, 260),
      timerColor: asColor(raw.timerColor, defaults.timerColor),
      timerFormat: normalizeTimerFormat(raw.timerFormat, defaults.timerFormat),
      fontWeight: clampInt(raw.fontWeight, defaults.fontWeight, 300, 1000),
      align: asAlign(raw.align, defaults.align),
      paddingPx: clampInt(raw.paddingPx ?? raw.questionPaddingPx, defaults.paddingPx, 0, 220),
      lineHeight: clampFloat(raw.lineHeight, defaults.lineHeight, 0.7, 1.4),
      maxWidthPx: clampInt(raw.maxWidthPx, defaults.maxWidthPx, 200, 2600),
    };
  }

  if (roundKey === "round3ThemeOverlay") {
    return {
      textColor: asColor(raw.textColor ?? raw.themeOverlayTextColor ?? raw.themeColor, defaults.textColor),
      backgroundColor: asColor(raw.backgroundColor ?? raw.themeOverlayBackgroundColor, defaults.backgroundColor),
      activeBorderColor: asColor(raw.activeBorderColor, defaults.activeBorderColor),
      fontSizePx: clampInt(raw.fontSizePx ?? raw.themeFontSizePx, defaults.fontSizePx, 12, 160),
      fontWeight: clampInt(raw.fontWeight, defaults.fontWeight, 300, 1000),
      align: asAlign(raw.align, defaults.align),
      columns: clampInt(raw.columns ?? raw.themeOverlayColumns, defaults.columns, 1, 12),
      maxWidthPx: clampInt(raw.maxWidthPx, defaults.maxWidthPx, 200, 2600),
      paddingPx: clampInt(raw.paddingPx ?? raw.questionPaddingPx, defaults.paddingPx, 0, 220),
      columnGapPx: clampInt(raw.columnGapPx ?? raw.blockGapPx, defaults.columnGapPx, 0, 160),
      rowGapPx: clampInt(raw.rowGapPx ?? raw.blockGapPx, defaults.rowGapPx, 0, 120),
      itemBackgroundWidthPercent: clampInt(raw.itemBackgroundWidthPercent, defaults.itemBackgroundWidthPercent, 20, 100),
      itemPaddingYPx: clampInt(raw.itemPaddingYPx, defaults.itemPaddingYPx, 0, 80),
      itemPaddingXPx: clampInt(raw.itemPaddingXPx, defaults.itemPaddingXPx, 0, 120),
      borderRadiusPx: clampInt(raw.borderRadiusPx, defaults.borderRadiusPx, 0, 80),
      borderWidthPx: clampInt(raw.borderWidthPx, defaults.borderWidthPx, 0, 12),
      lineHeight: clampFloat(raw.lineHeight, defaults.lineHeight, 0.8, 1.8),
      letterSpacingEm: clampFloat(raw.letterSpacingEm, defaults.letterSpacingEm, -0.12, 0.08),
    };
  }

  if (roundKey === "round4") {
    const maxFontSizePx = clampInt(raw.maxFontSizePx, defaults.maxFontSizePx, 36, 320);
    const minFontSizePx = clampInt(raw.minFontSizePx, defaults.minFontSizePx, 14, 140);
    return {
      maxFontSizePx: Math.max(minFontSizePx, maxFontSizePx),
      minFontSizePx: Math.min(minFontSizePx, maxFontSizePx),
      textColor: asColor(raw.textColor ?? raw.clueColor, defaults.textColor),
      fontWeight: clampInt(raw.fontWeight, defaults.fontWeight, 300, 1000),
      textShadow: Boolean(raw.textShadow ?? defaults.textShadow),
      align: asAlign(raw.align, defaults.align),
      paddingPx: clampInt(raw.paddingPx, defaults.paddingPx, 0, 220),
      lineHeight: clampFloat(raw.lineHeight, defaults.lineHeight, 0.8, 1.8),
      maxWidthPx: clampInt(raw.maxWidthPx, defaults.maxWidthPx, 400, 2600),
    };
  }

  if (roundKey === "round5") {
    return {
      nameFontSizePx: clampInt(raw.nameFontSizePx, defaults.nameFontSizePx, 14, 120),
      hpFontSizePx: clampInt(raw.hpFontSizePx, defaults.hpFontSizePx, 16, 150),
      textColor: asColor(raw.textColor, defaults.textColor),
      healthColor: asColor(raw.healthColor, defaults.healthColor),
      dangerColor: asColor(raw.dangerColor, defaults.dangerColor),
      barHeightPx: clampInt(raw.barHeightPx, defaults.barHeightPx, 10, 140),
      cornerRadiusPx: clampInt(raw.cornerRadiusPx, defaults.cornerRadiusPx, 0, 70),
      maxWidthPx: clampInt(raw.maxWidthPx, defaults.maxWidthPx, 260, 1400),
      screenPaddingPx: clampInt(raw.screenPaddingPx, defaults.screenPaddingPx, 0, 180),
      barGapPx: clampInt(raw.barGapPx, defaults.barGapPx, 0, 180),
      frameOpacity: clampFloat(raw.frameOpacity, defaults.frameOpacity, 0, 1),
      dimmedOpacity: clampFloat(raw.dimmedOpacity, defaults.dimmedOpacity, 0, 1),
      maxHp: clampInt(raw.maxHp, defaults.maxHp, 0, 10000),
    };
  }

  return { ...defaults };
}

export function watchOverlayConfig(roundKey, callback) {
  const defaults = OVERLAY_DEFAULTS[roundKey];
  const legacyPath = roundKey === "round1" || ["round3", "round3Timer", "round3ThemeOverlay"].includes(roundKey)
    ? `rooms/${roundKey === "round1" ? "manche1" : "manche3"}/overlaySettings`
    : null;
  const legacyRoundKey = ["round3Timer", "round3ThemeOverlay"].includes(roundKey) ? "round3" : null;

  let legacyConfig = defaults;
  let legacyRoundConfig = null;
  let newConfig = null;

  const emit = () => {
    const selected = newConfig || legacyRoundConfig || legacyConfig || defaults;
    callback(normalizeOverlayConfig(roundKey, selected));
  };

  const unsubscribers = [];

  if (legacyPath) {
    unsubscribers.push(onValue(ref(db, legacyPath), (snap) => {
      legacyConfig = normalizeOverlayConfig(roundKey, snap.val() || defaults);
      emit();
    }));
  }

  if (legacyRoundKey) {
    unsubscribers.push(onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/${legacyRoundKey}`), (snap) => {
      legacyRoundConfig = snap.val() || null;
      emit();
    }));
  }

  unsubscribers.push(onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/${roundKey}`), (snap) => {
    const value = snap.val();
    newConfig = value ? normalizeOverlayConfig(roundKey, value) : null;
    emit();
  }));

  emit();

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") unsubscribe();
    });
  };
}
