import { db, ref, onValue, set, update, runTransaction } from "./firebase.js";

const ROUND6_PATH = "rooms/manche6/state";
const ROUND5_PATH = "rounds/round5";
const VIEWERS_PATH = "rooms/manche1/viewerLeaderboard";
const DEFAULT_DURATION_MS = 60_000;
const PLAYER_KEYS = ["participant", "viewer"];

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
}[char]));

const defaultPlayer = (type) => ({ id: null, type, name: type === "participant" ? "Participant" : "Viewer", score: 0, source: "manual" });

const defaultRound6 = {
  name: "Manche 6",
  phase: "setup",
  status: "idle",
  durationMs: DEFAULT_DURATION_MS,
  activePlayer: "participant",
  players: {
    participant: defaultPlayer("participant"),
    viewer: defaultPlayer("viewer"),
  },
  timers: {
    participant: { remainingMs: DEFAULT_DURATION_MS },
    viewer: { remainingMs: DEFAULT_DURATION_MS },
  },
  timerStartedAt: null,
  currentQuestion: "",
  answers: {
    participant: "",
    viewer: "",
  },
  winner: null,
  updatedAt: 0,
  updatedBy: "",
};

function normalizeRound6(value) {
  const durationMs = Math.max(1_000, Number(value?.durationMs || DEFAULT_DURATION_MS));
  const timers = {
    participant: { remainingMs: Number(value?.timers?.participant?.remainingMs ?? durationMs) },
    viewer: { remainingMs: Number(value?.timers?.viewer?.remainingMs ?? durationMs) },
  };
  return {
    ...defaultRound6,
    ...(value || {}),
    durationMs,
    activePlayer: PLAYER_KEYS.includes(value?.activePlayer) ? value.activePlayer : "participant",
    players: {
      participant: { ...defaultPlayer("participant"), ...(value?.players?.participant || {}) },
      viewer: { ...defaultPlayer("viewer"), ...(value?.players?.viewer || {}) },
    },
    timers,
    answers: { ...defaultRound6.answers, ...(value?.answers || {}) },
  };
}

function computeRemaining(state, key, now = Date.now()) {
  const base = Math.max(0, Number(state?.timers?.[key]?.remainingMs ?? state?.durationMs ?? DEFAULT_DURATION_MS));
  if (state?.status !== "running" || state?.activePlayer !== key || !state?.timerStartedAt) return base;
  return Math.max(0, base - Math.max(0, now - Number(state.timerStartedAt)));
}

function snapshotTimers(state, now = Date.now()) {
  return {
    participant: { remainingMs: computeRemaining(state, "participant", now) },
    viewer: { remainingMs: computeRemaining(state, "viewer", now) },
  };
}

function detectWinner(state, timers = snapshotTimers(state)) {
  const participantLeft = Number(timers.participant?.remainingMs || 0);
  const viewerLeft = Number(timers.viewer?.remainingMs || 0);
  if (participantLeft <= 0 && viewerLeft <= 0) return "draw";
  if (participantLeft <= 0) return "viewer";
  if (viewerLeft <= 0) return "participant";
  return null;
}

function formatTime(ms) {
  const safe = Math.max(0, Number(ms || 0));
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((safe % 1000) / 100);
  return safe < 10_000 ? `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getRound5Winner(round5) {
  const participants = round5?.participants || {};
  const order = round5?.turn?.order || Object.keys(participants);
  const alive = order.filter((id) => participants[id] && participants[id].alive !== false && !participants[id].eliminated && Number(participants[id].hp || 0) > 0);
  const winnerId = alive.length === 1 ? alive[0] : order
    .filter((id) => participants[id])
    .sort((a, b) => Number(participants[b]?.hp || 0) - Number(participants[a]?.hp || 0))[0];
  if (!winnerId) return defaultPlayer("participant");
  return {
    id: winnerId,
    type: "participant",
    name: participants[winnerId]?.name || participants[winnerId]?.nickname || winnerId,
    score: Number(participants[winnerId]?.score || 0),
    source: "manche5",
  };
}

function getTopViewer(viewers) {
  const [id, viewer] = Object.entries(viewers || {})
    .sort((a, b) => Number(b[1]?.score || 0) - Number(a[1]?.score || 0) || Number(b[1]?.lastWinAt || 0) - Number(a[1]?.lastWinAt || 0))[0] || [];
  if (!id) return defaultPlayer("viewer");
  return {
    id,
    type: "viewer",
    name: viewer?.twitchUser || id,
    score: Number(viewer?.score || 0),
    source: "viewerLeaderboard",
  };
}

function buildInitialState({ round5, viewers, durationSeconds, currentState }) {
  const durationMs = Math.max(1, Number(durationSeconds || 60)) * 1000;
  return {
    ...defaultRound6,
    players: {
      participant: getRound5Winner(round5),
      viewer: getTopViewer(viewers),
    },
    durationMs,
    timers: {
      participant: { remainingMs: durationMs },
      viewer: { remainingMs: durationMs },
    },
    activePlayer: currentState?.activePlayer || "participant",
    currentQuestion: currentState?.currentQuestion || "",
    answers: currentState?.answers || { participant: "", viewer: "" },
    phase: "ready",
    status: "idle",
    timerStartedAt: null,
    winner: null,
  };
}

function createRenderer({ prefix }) {
  const $ = (id) => document.getElementById(`${prefix}-${id}`);
  const els = {
    phase: $("phase"),
    status: $("status"),
    question: $("question"),
    playerParticipant: $("player-participant"),
    playerViewer: $("player-viewer"),
    timerParticipant: $("timer-participant"),
    timerViewer: $("timer-viewer"),
    answerParticipant: $("answer-participant"),
    answerViewer: $("answer-viewer"),
    winner: $("winner"),
  };

  function render(state) {
    if (!els.phase) return;
    const normalizedState = normalizeRound6(state);
    const timers = snapshotTimers(normalizedState);
    const winner = normalizedState.winner || detectWinner(normalizedState, timers);
    const activeName = normalizedState.players?.[normalizedState.activePlayer]?.name || "—";
    els.phase.textContent = normalizedState.phase === "finished" || winner ? "Terminé" : normalizedState.phase === "ready" ? "Prêt" : "Préparation";
    if (els.status) els.status.textContent = normalizedState.status === "running" ? `Timer actif : ${activeName}` : normalizedState.status === "paused" ? "Pause" : "En attente";
    if (els.question) els.question.textContent = normalizedState.currentQuestion || "Question en attente côté admin.";
    if (els.playerParticipant) els.playerParticipant.innerHTML = `${escapeHtml(normalizedState.players.participant.name)}<small>${Number(normalizedState.players.participant.score || 0)} pt · survivant M5</small>`;
    if (els.playerViewer) els.playerViewer.innerHTML = `${escapeHtml(normalizedState.players.viewer.name)}<small>${Number(normalizedState.players.viewer.score || 0)} pt · top viewer</small>`;
    if (els.timerParticipant) els.timerParticipant.textContent = formatTime(timers.participant.remainingMs);
    if (els.timerViewer) els.timerViewer.textContent = formatTime(timers.viewer.remainingMs);
    if (els.answerParticipant) els.answerParticipant.textContent = normalizedState.answers?.participant || "—";
    if (els.answerViewer) els.answerViewer.textContent = normalizedState.answers?.viewer || "—";
    if (els.winner) els.winner.textContent = winner ? (winner === "draw" ? "Égalité" : `Vainqueur : ${normalizedState.players?.[winner]?.name || winner}`) : "Premier chrono à zéro perd la finale.";
    ["participant", "viewer"].forEach((key) => {
      const card = $(`card-${key}`);
      card?.classList.toggle("is-active", normalizedState.activePlayer === key && normalizedState.status === "running" && !winner);
      card?.classList.toggle("is-out", Number(timers[key].remainingMs || 0) <= 0);
    });
  }

  return { render };
}

export function initManche6Admin({ getCurrentAdminId, showToast } = {}) {
  if (!document.getElementById("m6-admin")) return;
  const $ = (id) => document.getElementById(id);
  let state = defaultRound6;
  let round5 = null;
  let viewers = {};
  let ticker = null;
  const renderer = createRenderer({ prefix: "m6-admin" });

  const durationInput = $("m6-duration");
  const questionInput = $("m6-question-input");
  const participantAnswerInput = $("m6-answer-participant-input");
  const viewerAnswerInput = $("m6-answer-viewer-input");

  function render() {
    renderer.render(state);
    if (durationInput && state.status === "idle") durationInput.value = String(Math.round(Number(state.durationMs || DEFAULT_DURATION_MS) / 1000));
    if (questionInput && document.activeElement !== questionInput) questionInput.value = state.currentQuestion || "";
    if (participantAnswerInput && document.activeElement !== participantAnswerInput) participantAnswerInput.value = state.answers?.participant || "";
    if (viewerAnswerInput && document.activeElement !== viewerAnswerInput) viewerAnswerInput.value = state.answers?.viewer || "";
  }

  function startTicker() {
    window.clearInterval(ticker);
    ticker = window.setInterval(async () => {
      render();
      if (state.status !== "running") return;
      const timers = snapshotTimers(state);
      const winner = detectWinner(state, timers);
      if (!winner) return;
      await update(ref(db, ROUND6_PATH), {
        timers,
        status: "finished",
        phase: "finished",
        winner,
        timerStartedAt: null,
        updatedAt: Date.now(),
        updatedBy: getCurrentAdminId?.() || "admin",
      });
    }, 100);
  }

  onValue(ref(db, ROUND6_PATH), (snap) => {
    state = normalizeRound6(snap.val());
    render();
    startTicker();
  });
  onValue(ref(db, ROUND5_PATH), (snap) => { round5 = snap.val() || {}; });
  onValue(ref(db, VIEWERS_PATH), (snap) => { viewers = snap.val() || {}; });

  async function savePatch(patch) {
    await update(ref(db, ROUND6_PATH), { ...patch, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" });
  }

  $("m6-init")?.addEventListener("click", async () => {
    const initial = buildInitialState({ round5, viewers, durationSeconds: Number(durationInput?.value || 60), currentState: state });
    await set(ref(db, ROUND6_PATH), { ...initial, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" });
    showToast?.("Manche 6 initialisée");
  });

  $("m6-launch")?.addEventListener("click", async () => {
    await runTransaction(ref(db, ROUND6_PATH), (curr) => {
      const s = normalizeRound6(curr);
      if (s.status === "running" || s.phase === "finished") return s;
      const shouldApplyConfiguredDuration = s.status === "idle";
      const durationMs = shouldApplyConfiguredDuration ? Math.max(1, Number(durationInput?.value || 60)) * 1000 : s.durationMs;
      const timers = shouldApplyConfiguredDuration ? { participant: { remainingMs: durationMs }, viewer: { remainingMs: durationMs } } : snapshotTimers(s);
      return { ...s, durationMs, timers, status: "running", phase: "playing", timerStartedAt: Date.now(), winner: null, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" };
    });
  });

  $("m6-switch")?.addEventListener("click", async () => {
    await runTransaction(ref(db, ROUND6_PATH), (curr) => {
      const s = normalizeRound6(curr);
      const now = Date.now();
      const timers = snapshotTimers(s, now);
      const winner = detectWinner(s, timers);
      if (winner) return { ...s, timers, status: "finished", phase: "finished", winner, timerStartedAt: null, updatedAt: now, updatedBy: getCurrentAdminId?.() || "admin" };
      const activePlayer = s.activePlayer === "participant" ? "viewer" : "participant";
      return { ...s, timers, activePlayer, status: "running", phase: "playing", timerStartedAt: now, updatedAt: now, updatedBy: getCurrentAdminId?.() || "admin" };
    });
  });

  $("m6-pause")?.addEventListener("click", async () => {
    await runTransaction(ref(db, ROUND6_PATH), (curr) => {
      const s = normalizeRound6(curr);
      const now = Date.now();
      return { ...s, timers: snapshotTimers(s, now), status: "paused", timerStartedAt: null, updatedAt: now, updatedBy: getCurrentAdminId?.() || "admin" };
    });
  });

  $("m6-reset")?.addEventListener("click", async () => {
    const durationMs = Math.max(1, Number(durationInput?.value || 60)) * 1000;
    await set(ref(db, ROUND6_PATH), { ...defaultRound6, durationMs, timers: { participant: { remainingMs: durationMs }, viewer: { remainingMs: durationMs } }, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" });
    showToast?.("Manche 6 réinitialisée");
  });

  $("m6-save-content")?.addEventListener("click", async () => {
    await savePatch({
      currentQuestion: questionInput?.value.trim() || "",
      answers: {
        participant: participantAnswerInput?.value.trim() || "",
        viewer: viewerAnswerInput?.value.trim() || "",
      },
    });
  });
}

export function initManche6Display({ prefix = "m6" } = {}) {
  if (!document.getElementById(`${prefix}-phase`)) return;
  const renderer = createRenderer({ prefix });
  let state = defaultRound6;
  let ticker = null;
  const render = () => renderer.render(state);
  onValue(ref(db, ROUND6_PATH), (snap) => {
    state = normalizeRound6(snap.val());
    render();
    window.clearInterval(ticker);
    ticker = window.setInterval(render, 100);
  });
}
