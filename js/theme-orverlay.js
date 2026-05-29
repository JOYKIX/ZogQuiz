import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";

const rootNode = document.querySelector(".theme-overlay-root");
const panelNode = document.querySelector(".theme-overlay-panel");
const listNode = document.getElementById("m3-theme-overlay-list");

let themes = {};
let state = null;
let overlayConfig = null;

function getSortedThemes() {
  return Object.entries(themes || {})
    .map(([id, theme]) => ({ id, ...theme }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function chunkThemes(themeList, columnCount) {
  const themesPerColumn = Math.ceil(themeList.length / columnCount) || 1;
  return Array.from({ length: columnCount }, (_, index) => (
    themeList.slice(index * themesPerColumn, (index + 1) * themesPerColumn)
  )).filter((column) => column.length > 0);
}

function applyOverlayConfig() {
  if (!overlayConfig || !rootNode || !panelNode || !listNode) return;

  const columnCount = Math.max(1, Math.min(12, overlayConfig.columns));
  rootNode.style.padding = `${overlayConfig.paddingPx}px`;
  panelNode.style.width = `min(100%, ${overlayConfig.maxWidthPx}px)`;
  listNode.style.setProperty("--theme-columns", String(columnCount));
  listNode.style.setProperty("--theme-color", overlayConfig.textColor);
  listNode.style.setProperty("--theme-background-color", overlayConfig.backgroundColor);
  listNode.style.setProperty("--theme-font-size", `${overlayConfig.fontSizePx}px`);
  listNode.style.setProperty("--theme-font-weight", String(overlayConfig.fontWeight));
  listNode.style.setProperty("--theme-align", overlayConfig.align);
  listNode.style.setProperty("--theme-item-self", { left: "flex-start", center: "center", right: "flex-end" }[overlayConfig.align] || "center");
  listNode.style.setProperty("--theme-active-border-color", overlayConfig.activeBorderColor);
  listNode.style.setProperty("--theme-column-gap", `${overlayConfig.columnGapPx}px`);
  listNode.style.setProperty("--theme-row-gap", `${overlayConfig.rowGapPx}px`);
  listNode.style.setProperty("--theme-item-width", `${overlayConfig.itemBackgroundWidthPercent}%`);
  listNode.style.setProperty("--theme-padding-y", `${overlayConfig.itemPaddingYPx}px`);
  listNode.style.setProperty("--theme-padding-x", `${overlayConfig.itemPaddingXPx}px`);
  listNode.style.setProperty("--theme-radius", `${overlayConfig.borderRadiusPx}px`);
  listNode.style.setProperty("--theme-border-width", `${overlayConfig.borderWidthPx}px`);
  listNode.style.setProperty("--theme-line-height", String(overlayConfig.lineHeight));
  listNode.style.setProperty("--theme-letter-spacing", `${overlayConfig.letterSpacingEm}em`);
}

function renderEmpty() {
  listNode.innerHTML = "";
  const emptyNode = document.createElement("p");
  emptyNode.className = "theme-overlay-empty";
  emptyNode.textContent = "Aucun thème disponible.";
  listNode.appendChild(emptyNode);
}

function render() {
  if (!listNode) return;

  const themeList = getSortedThemes();
  const columnCount = Math.max(1, Math.min(12, overlayConfig?.columns || 2));

  applyOverlayConfig();

  if (!themeList.length) {
    renderEmpty();
    return;
  }

  listNode.innerHTML = "";
  for (const columnThemes of chunkThemes(themeList, columnCount)) {
    const columnNode = document.createElement("div");
    columnNode.className = "theme-overlay-column";

    for (const theme of columnThemes) {
      const itemNode = document.createElement("p");
      itemNode.className = "theme-overlay-item";
      itemNode.classList.toggle("is-active", theme.id === state?.activeThemeId);
      itemNode.textContent = theme.name || "Thème";
      columnNode.appendChild(itemNode);
    }

    listNode.appendChild(columnNode);
  }
}

onValue(ref(db, "rooms/manche3/state"), (snap) => {
  state = snap.val() || {};
  render();
});

onValue(ref(db, "rooms/manche3/themes"), (snap) => {
  themes = snap.val() || {};
  render();
});

watchOverlayConfig("round3ThemeOverlay", (config) => {
  overlayConfig = config;
  render();
});
