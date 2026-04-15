import { db, ref, onValue } from "./firebase.js";

const gridTitleNode = document.getElementById("m4-overlay-grid-title");
const statusNode = document.getElementById("m4-overlay-status");
const clueNode = document.getElementById("m4-overlay-clue");
const phaseNode = document.getElementById("m4-overlay-phase");
const progressList = document.getElementById("m4-overlay-progress");

let state = {};
let gridsById = {};
let sessionsById = {};

function normalizeProgress(progress) {
  return {
    foundGoodWords: progress?.foundGoodWords || {},
    blackWordPenalty: Boolean(progress?.blackWordPenalty || progress?.hitBlackWord),
    finalRound4Score: Number.isFinite(Number(progress?.finalRound4Score)) ? Number(progress.finalRound4Score) : null,
  };
}

function computeScore(progress) {
  if (Number.isFinite(progress.finalRound4Score)) return progress.finalRound4Score;
  const phasePoints = { 1: 3, 2: 2, 3: 1 };
  const raw = Object.values(progress.foundGoodWords).reduce((sum, phase) => sum + (phasePoints[phase] || 0), 0);
  return progress.blackWordPenalty ? Math.floor(raw / 2) : raw;
}

function playerLabel(sessionId) {
  return sessionsById[sessionId]?.nickname || sessionsById[sessionId]?.loginId || sessionId;
}

function renderProgress() {
  const entries = Object.entries(state.playerProgress || {}).map(([sessionId, raw]) => {
    const progress = normalizeProgress(raw);
    const found = Object.keys(progress.foundGoodWords || {}).length;
    const score = computeScore(progress);
    return { sessionId, found, score, black: progress.blackWordPenalty };
  });

  entries.sort((a, b) => b.score - a.score || b.found - a.found || playerLabel(a.sessionId).localeCompare(playerLabel(b.sessionId), "fr"));

  progressList.innerHTML = "";
  if (!entries.length) {
    progressList.innerHTML = "<li>Aucun joueur n'a encore validé de mot.</li>";
    return;
  }

  entries.forEach((entry) => {
    const li = document.createElement("li");
    const penalty = entry.black ? " · mot noir" : "";
    li.className = "m4-overlay-progress";
    li.innerHTML = `<strong>${playerLabel(entry.sessionId)}</strong><span>${entry.found}/5 mots · ${entry.score} pts${penalty}</span>`;
    progressList.appendChild(li);
  });
}

function render() {
  const activeGrid = gridsById[state.currentGridId] || null;
  const phase = Math.min(3, Math.max(1, Number(state.cluePhase || 1)));
  const status = state.finished
    ? "Manche terminée"
    : state.active
      ? "Manche en cours"
      : "En attente du lancement";

  gridTitleNode.textContent = activeGrid?.title || "Aucune grille active";
  statusNode.textContent = status;
  clueNode.textContent = `Indice : ${state.currentClue || "—"}`;
  phaseNode.textContent = `Phase : ${phase}/3`;
  renderProgress();
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
