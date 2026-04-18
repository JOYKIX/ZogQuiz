import { db, ref, onValue } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";
import {
  buildMarkerBorderColor,
  computeReadableTextColor,
  getDefaultParticipantColor,
  normalizeParticipantColor,
} from "./participants.js";

const clueNode = document.getElementById("m4-overlay-clue");
const gridNode = document.getElementById("m4-overlay-grid");
const legendNode = document.getElementById("m4-overlay-legend");

let state = {};
let gridsById = {};
let sessionsById = {};
let overlayConfig = null;

function participantColor(sessionId) {
  return normalizeParticipantColor(sessionsById[sessionId]?.color, getDefaultParticipantColor(sessionId));
}

function buildSelectionsByWord() {
  const byWord = {};
  Object.entries(state.playerProgress || {}).forEach(([sessionId, progress]) => {
    const selected = Array.isArray(progress?.selectedWords) ? progress.selectedWords : [];
    selected.forEach((wordId) => {
      if (!byWord[wordId]) byWord[wordId] = [];
      byWord[wordId].push(sessionId);
    });
  });
  return byWord;
}

function playerName(sessionId) {
  return sessionsById[sessionId]?.nickname || sessionsById[sessionId]?.loginId || sessionId;
}

function renderLegend(players) {
  legendNode.innerHTML = "";
  players.forEach((sessionId) => {
    const color = participantColor(sessionId);
    const li = document.createElement("li");
    const marker = document.createElement("span");
    marker.className = "m4-marker";
    marker.style.width = `${overlayConfig.markerSizePx}px`;
    marker.style.height = `${overlayConfig.markerSizePx}px`;
    marker.style.opacity = String(overlayConfig.markerOpacity);
    marker.style.backgroundColor = color;
    marker.style.borderColor = buildMarkerBorderColor(color);

    const name = document.createElement("span");
    name.textContent = playerName(sessionId);
    name.style.color = computeReadableTextColor(color);
    name.style.textShadow = "0 1px 2px rgba(0, 0, 0, 0.75), 0 0 10px rgba(0, 0, 0, 0.45)";

    li.append(marker, name);
    legendNode.appendChild(li);
  });
}

function render() {
  const activeGrid = gridsById[state.currentGridId] || null;
  clueNode.textContent = `Indice : ${state.currentClue || "—"}`;
  clueNode.style.fontSize = `${overlayConfig?.clueFontSizePx || 40}px`;
  clueNode.style.color = overlayConfig?.clueColor || "#ffffff";

  gridNode.innerHTML = "";
  if (!activeGrid || !overlayConfig) return;

  const players = Object.keys(state.playerProgress || {}).sort((a, b) => playerName(a).localeCompare(playerName(b), "fr"));
  const selectionsByWord = buildSelectionsByWord();

  gridNode.style.maxWidth = `${overlayConfig.gridMaxWidthPx}px`;
  gridNode.style.gap = `${overlayConfig.gridGapPx}px`;

  activeGrid.words.forEach((word) => {
    const cell = document.createElement("article");
    cell.className = "m4-cell";
    cell.style.borderRadius = `${overlayConfig.cellRadiusPx}px`;

    const text = document.createElement("span");
    text.className = "m4-cell-word";
    text.style.fontSize = `${overlayConfig.wordFontSizePx}px`;
    text.textContent = word.text;

    const markers = document.createElement("div");
    markers.className = "m4-cell-markers";

    const selectors = selectionsByWord[word.id] || [];
    selectors.forEach((sessionId, index) => {
      const color = participantColor(sessionId);
      const marker = document.createElement("span");
      marker.className = "m4-marker";
      marker.title = playerName(sessionId);
      marker.style.width = `${overlayConfig.markerSizePx}px`;
      marker.style.height = `${overlayConfig.markerSizePx}px`;
      marker.style.opacity = String(overlayConfig.markerOpacity);
      marker.style.backgroundColor = color;
      marker.style.borderColor = buildMarkerBorderColor(color);
      marker.style.transform = `translateX(${Math.min(index, 4) * -3}px)`;
      markers.appendChild(marker);
    });

    cell.append(text, markers);
    gridNode.appendChild(cell);
  });

  renderLegend(players);
}

onValue(ref(db, "rooms/manche4/state"), (snap) => {
  state = snap.val() || {};
  render();
});

onValue(ref(db, "rooms/manche4/grids"), (snap) => {
  gridsById = snap.val() || {};
  render();
});

onValue(ref(db, "rooms/manche1/guestSessions"), (snap) => {
  sessionsById = snap.val() || {};
  render();
});

watchOverlayConfig("round4", (config) => {
  overlayConfig = config;
  render();
});
