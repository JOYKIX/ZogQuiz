import { db, ref, onValue, set, update, runTransaction } from "./firebase.js";

const ROUND6_PATH = "rooms/manche6/state";
const ROUND6_QUESTIONS_PATH = "rooms/manche6/questionBank";
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
  currentAnswer: "",
  currentQuestionId: null,
  questionDeck: [],
  questionBank: [],
  questionDrawnIds: [],
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
    currentAnswer: value?.currentAnswer ?? value?.answer ?? "",
    currentQuestionId: value?.currentQuestionId ?? null,
    questionDeck: normalizeQuestionDeck(value?.questionDeck),
    questionBank: normalizeQuestionDeck(value?.questionBank || value?.questionDeck),
    questionDrawnIds: Array.isArray(value?.questionDrawnIds) ? value.questionDrawnIds.map((id) => String(id)) : [],
    answers: { ...defaultRound6.answers, ...(value?.answers || {}) },
  };
}

function normalizeQuestionDeck(deck) {
  const entries = Array.isArray(deck) ? deck : Object.values(deck || {});
  if (!entries.length) return [];
  return entries
    .map((item, index) => {
      const question = String(item?.question ?? "").trim();
      const answer = String(item?.answer ?? "").trim();
      if (!question && !answer) return null;
      const fallbackId = `${question}::${answer}::${index}`;
      return { id: String(item?.id || fallbackId), question, answer };
    })
    .filter(Boolean);
}

function createQuestionId() {
  return `q${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getQuestionBank(state, fallbackDeck = []) {
  const savedBank = normalizeQuestionDeck(state?.questionBank);
  if (savedBank.length) return savedBank;
  const fallbackBank = normalizeQuestionDeck(fallbackDeck);
  if (fallbackBank.length) return fallbackBank;
  return normalizeQuestionDeck(state?.questionDeck);
}

function getQuestionAvailability(state, fallbackDeck = []) {
  const deck = getQuestionBank(state, fallbackDeck);
  const deckIds = new Set(deck.map((question) => question.id));
  const drawnIds = (Array.isArray(state?.questionDrawnIds) ? state.questionDrawnIds : [])
    .map((id) => String(id))
    .filter((id) => deckIds.has(id));
  return { deck, drawnIds };
}

function pickRandomQuestion(state, fallbackDeck = []) {
  const { deck, drawnIds } = getQuestionAvailability(state, fallbackDeck);
  if (!deck.length) return null;
  const drawn = new Set(drawnIds);
  let available = deck.filter((item) => !drawn.has(item.id));
  const shouldResetDraw = available.length === 0;
  if (shouldResetDraw) available = deck;
  const picked = available[Math.floor(Math.random() * available.length)];
  return {
    picked,
    questionDrawnIds: shouldResetDraw ? [picked.id] : [...drawn, picked.id],
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

function buildInitialState({ round5, viewers, durationSeconds, currentState, questionBank = [] }) {
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
    currentAnswer: currentState?.currentAnswer || "",
    currentQuestionId: currentState?.currentQuestionId || null,
    questionDeck: getQuestionBank(currentState, questionBank),
    questionBank: getQuestionBank(currentState, questionBank),
    questionDrawnIds: [],
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
    currentAnswer: $("current-answer"),
    questionCount: $("question-count"),
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
    const currentAnswer = normalizedState.currentAnswer || "—";
    if (els.answerParticipant) els.answerParticipant.textContent = normalizedState.answers?.participant || "—";
    if (els.answerViewer) els.answerViewer.textContent = normalizedState.answers?.viewer || "—";
    if (els.currentAnswer) els.currentAnswer.textContent = currentAnswer;
    if (els.questionCount) {
      const { deck, drawnIds } = getQuestionAvailability(normalizedState);
      els.questionCount.textContent = `${drawnIds.length}/${deck.length} tirées`;
    }
    if (els.winner) els.winner.textContent = winner ? (winner === "draw" ? "Égalité" : `Vainqueur : ${normalizedState.players?.[winner]?.name || winner}`) : "Chrono à zéro = défaite.";
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
  let questionBank = [];
  let questionBankLoaded = false;
  let round5 = null;
  let viewers = {};
  let ticker = null;
  const renderer = createRenderer({ prefix: "m6-admin" });

  const durationInput = $("m6-duration");
  const questionInput = $("m6-question-input");
  const answerInput = $("m6-answer-input");
  const newQuestionInput = $("m6-new-question-input");
  const newAnswerInput = $("m6-new-answer-input");
  const questionDeckList = $("m6-question-deck-list");
  const questionDeckEmpty = $("m6-question-deck-empty");
  const participantAnswerInput = $("m6-answer-participant-input");
  const viewerAnswerInput = $("m6-answer-viewer-input");

  function isQuestionDeckEditorActive() {
    return Boolean(questionDeckList?.contains(document.activeElement));
  }

  function getQuestionStatus(question) {
    const { drawnIds } = getQuestionAvailability(state, questionBank);
    if (question.id === state.currentQuestionId) return "Affichée";
    if (drawnIds.includes(question.id)) return "Déjà tirée";
    return "Disponible";
  }

  function renderQuestionDeckEditor() {
    if (!questionDeckList || isQuestionDeckEditorActive()) return;
    const deck = getQuestionBank(state, questionBank);
    questionDeckList.innerHTML = "";
    questionDeckEmpty?.classList.toggle("hidden", deck.length > 0);
    deck.forEach((question, index) => {
      const item = document.createElement("article");
      item.className = "m6-question-item";
      item.dataset.questionId = question.id;

      const head = document.createElement("div");
      head.className = "m6-question-item-head";
      const title = document.createElement("strong");
      title.textContent = `Question ${index + 1}`;
      const status = document.createElement("span");
      status.className = "m6-question-status";
      status.textContent = getQuestionStatus(question);
      head.append(title, status);

      const questionLabel = document.createElement("label");
      questionLabel.textContent = "Question";
      const questionField = document.createElement("textarea");
      questionField.className = "m6-deck-question-input";
      questionField.rows = 2;
      questionField.value = question.question;
      questionField.placeholder = "Question";
      questionLabel.append(questionField);

      const answerLabel = document.createElement("label");
      answerLabel.textContent = "Réponse";
      const answerField = document.createElement("textarea");
      answerField.className = "m6-deck-answer-input";
      answerField.rows = 2;
      answerField.value = question.answer;
      answerField.placeholder = "Réponse attendue";
      answerLabel.append(answerField);

      const actions = document.createElement("div");
      actions.className = "row";
      const saveButton = document.createElement("button");
      saveButton.className = "btn btn-primary m6-save-question";
      saveButton.type = "button";
      saveButton.textContent = "Enregistrer";
      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-danger m6-delete-question";
      deleteButton.type = "button";
      deleteButton.textContent = "Supprimer";
      actions.append(saveButton, deleteButton);

      item.append(head, questionLabel, answerLabel, actions);
      questionDeckList.append(item);
    });
  }

  function collectQuestionDeckFromEditor() {
    if (!questionDeckList) return getQuestionBank(state, questionBank);
    return [...questionDeckList.querySelectorAll(".m6-question-item")]
      .map((item) => {
        const question = item.querySelector(".m6-deck-question-input")?.value.trim() || "";
        const answer = item.querySelector(".m6-deck-answer-input")?.value.trim() || "";
        if (!question && !answer) return null;
        return { id: item.dataset.questionId || createQuestionId(), question, answer };
      })
      .filter((item) => item?.question);
  }

  function sanitizeDrawnIds(questionDeck, drawnIds = state.questionDrawnIds) {
    const availableIds = new Set(questionDeck.map((question) => question.id));
    return drawnIds.filter((id) => availableIds.has(id));
  }

  async function prepareQuestionDeckForDraw() {
    const deckFromEditor = collectQuestionDeckFromEditor();
    const deckToDrawFrom = deckFromEditor.length ? deckFromEditor : getQuestionBank(state, questionBank);
    questionBank = deckToDrawFrom;
    questionBankLoaded = true;
    await set(ref(db, ROUND6_QUESTIONS_PATH), deckToDrawFrom);
    return deckToDrawFrom;
  }

  function buildNextQuestionPatch(sourceState, deckToDrawFrom) {
    const s = normalizeRound6(sourceState);
    const questionDeck = deckToDrawFrom.length ? deckToDrawFrom : getQuestionBank(s, questionBank);
    const filteredDrawnIds = s.questionDrawnIds.filter((id) => questionDeck.some((question) => question.id === id));
    const draw = pickRandomQuestion({ ...s, questionDeck, questionBank: questionDeck, questionDrawnIds: filteredDrawnIds }, questionDeck);
    if (!draw) return { questionDeck, questionBank: questionDeck, questionDrawnIds: filteredDrawnIds };
    return {
      questionDeck,
      questionBank: questionDeck,
      currentQuestion: draw.picked.question,
      currentAnswer: draw.picked.answer,
      currentQuestionId: draw.picked.id,
      questionDrawnIds: draw.questionDrawnIds,
      answers: { participant: "", viewer: "" },
      phase: s.phase === "setup" ? "ready" : s.phase,
    };
  }

  async function saveQuestionDeck(questionDeck, extraPatch = {}) {
    const normalizedDeck = normalizeQuestionDeck(questionDeck);
    questionBank = normalizedDeck;
    questionBankLoaded = true;
    const currentDeckQuestion = normalizedDeck.find((question) => question.id === state.currentQuestionId);
    await set(ref(db, ROUND6_QUESTIONS_PATH), normalizedDeck);
    await savePatch({
      questionDeck: normalizedDeck,
      questionBank: normalizedDeck,
      questionDrawnIds: sanitizeDrawnIds(normalizedDeck),
      ...(currentDeckQuestion ? { currentQuestion: currentDeckQuestion.question, currentAnswer: currentDeckQuestion.answer } : {}),
      ...extraPatch,
    });
  }

  function render() {
    renderer.render(state);
    if (durationInput && state.status === "idle") durationInput.value = String(Math.round(Number(state.durationMs || DEFAULT_DURATION_MS) / 1000));
    if (questionInput && document.activeElement !== questionInput) questionInput.value = state.currentQuestion || "";
    if (answerInput && document.activeElement !== answerInput) answerInput.value = state.currentAnswer || "";
    renderQuestionDeckEditor();
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
    if (questionBankLoaded) {
      state.questionDeck = questionBank;
      state.questionBank = questionBank;
    } else if (state.questionDeck.length) {
      questionBank = state.questionDeck;
      questionBankLoaded = true;
      set(ref(db, ROUND6_QUESTIONS_PATH), questionBank);
    }
    render();
    startTicker();
  });
  onValue(ref(db, ROUND6_QUESTIONS_PATH), (snap) => {
    questionBank = normalizeQuestionDeck(snap.val());
    questionBankLoaded = true;
    const nextDrawnIds = sanitizeDrawnIds(questionBank);
    const needsStateSync = JSON.stringify(state.questionBank || state.questionDeck || []) !== JSON.stringify(questionBank)
      || JSON.stringify(state.questionDrawnIds || []) !== JSON.stringify(nextDrawnIds);
    state = normalizeRound6({ ...state, questionDeck: questionBank, questionBank, questionDrawnIds: nextDrawnIds });
    if (needsStateSync) {
      update(ref(db, ROUND6_PATH), {
        questionDeck: questionBank,
        questionBank,
        questionDrawnIds: nextDrawnIds,
        updatedAt: Date.now(),
        updatedBy: getCurrentAdminId?.() || "admin",
      });
    }
    render();
  });
  onValue(ref(db, ROUND5_PATH), (snap) => { round5 = snap.val() || {}; });
  onValue(ref(db, VIEWERS_PATH), (snap) => { viewers = snap.val() || {}; });

  async function savePatch(patch) {
    await update(ref(db, ROUND6_PATH), { ...patch, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" });
  }

  $("m6-init")?.addEventListener("click", async () => {
    const initial = buildInitialState({ round5, viewers, durationSeconds: Number(durationInput?.value || 60), currentState: state, questionBank });
    await set(ref(db, ROUND6_PATH), { ...initial, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" });
    showToast?.("Manche 6 initialisée");
  });

  $("m6-launch")?.addEventListener("click", async () => {
    const deckToDrawFrom = await prepareQuestionDeckForDraw();
    await runTransaction(ref(db, ROUND6_PATH), (curr) => {
      const s = normalizeRound6(curr);
      if (s.status === "running" || s.phase === "finished") return s;
      const shouldApplyConfiguredDuration = s.status === "idle";
      const durationMs = shouldApplyConfiguredDuration ? Math.max(1, Number(durationInput?.value || 60)) * 1000 : s.durationMs;
      const timers = shouldApplyConfiguredDuration ? { participant: { remainingMs: durationMs }, viewer: { remainingMs: durationMs } } : snapshotTimers(s);
      const nextQuestionPatch = shouldApplyConfiguredDuration ? buildNextQuestionPatch(s, deckToDrawFrom) : {};
      return {
        ...s,
        ...nextQuestionPatch,
        durationMs,
        timers,
        status: "running",
        phase: "playing",
        timerStartedAt: Date.now(),
        winner: null,
        updatedAt: Date.now(),
        updatedBy: getCurrentAdminId?.() || "admin",
      };
    });
  });

  $("m6-switch")?.addEventListener("click", async () => {
    const deckToDrawFrom = await prepareQuestionDeckForDraw();
    await runTransaction(ref(db, ROUND6_PATH), (curr) => {
      const s = normalizeRound6(curr);
      const now = Date.now();
      const timers = snapshotTimers(s, now);
      const winner = detectWinner(s, timers);
      if (winner) return { ...s, timers, status: "finished", phase: "finished", winner, timerStartedAt: null, updatedAt: now, updatedBy: getCurrentAdminId?.() || "admin" };
      const activePlayer = s.activePlayer === "participant" ? "viewer" : "participant";
      return {
        ...s,
        ...buildNextQuestionPatch(s, deckToDrawFrom),
        timers,
        activePlayer,
        status: "running",
        phase: "playing",
        timerStartedAt: now,
        updatedAt: now,
        updatedBy: getCurrentAdminId?.() || "admin",
      };
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
    const editorQuestionBank = collectQuestionDeckFromEditor();
    const savedQuestionBank = editorQuestionBank.length ? editorQuestionBank : getQuestionBank(state, questionBank);
    await set(ref(db, ROUND6_QUESTIONS_PATH), savedQuestionBank);
    questionBank = savedQuestionBank;
    questionBankLoaded = true;
    await set(ref(db, ROUND6_PATH), {
      ...defaultRound6,
      durationMs,
      timers: { participant: { remainingMs: durationMs }, viewer: { remainingMs: durationMs } },
      questionDeck: savedQuestionBank,
      questionBank: savedQuestionBank,
      questionDrawnIds: [],
      updatedAt: Date.now(),
      updatedBy: getCurrentAdminId?.() || "admin",
    });
    showToast?.("Manche 6 stoppée : questions remises disponibles");
  });

  $("m6-add-question")?.addEventListener("click", async () => {
    const question = newQuestionInput?.value.trim() || "";
    const answer = newAnswerInput?.value.trim() || "";
    if (!question || !answer) {
      showToast?.("Ajoutez une question et sa réponse avant d’enregistrer.", "error");
      return;
    }
    const questionDeck = [...collectQuestionDeckFromEditor(), { id: createQuestionId(), question, answer }];
    await saveQuestionDeck(questionDeck);
    if (newQuestionInput) newQuestionInput.value = "";
    if (newAnswerInput) newAnswerInput.value = "";
    showToast?.("Question ajoutée à la banque");
  });

  questionDeckList?.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const item = button.closest(".m6-question-item");
    if (!item) return;
    button.blur();
    const questionDeck = collectQuestionDeckFromEditor();
    if (button.classList.contains("m6-delete-question")) {
      const deletedId = item.dataset.questionId;
      const nextDeck = questionDeck.filter((question) => question.id !== deletedId);
      const extraPatch = deletedId === state.currentQuestionId
        ? { currentQuestion: "", currentAnswer: "", currentQuestionId: null }
        : {};
      await saveQuestionDeck(nextDeck, extraPatch);
      showToast?.("Question supprimée");
      return;
    }
    if (button.classList.contains("m6-save-question")) {
      await saveQuestionDeck(questionDeck);
      showToast?.("Question enregistrée");
    }
  });

  document.querySelectorAll(".m6-next-question").forEach((button) => {
    button.addEventListener("click", async () => {
      const deckToDrawFrom = await prepareQuestionDeckForDraw();
      await runTransaction(ref(db, ROUND6_PATH), (curr) => {
        const s = normalizeRound6(curr);
        return {
          ...s,
          ...buildNextQuestionPatch(s, deckToDrawFrom),
          updatedAt: Date.now(),
          updatedBy: getCurrentAdminId?.() || "admin",
        };
      });
    });
  });

  $("m6-save-content")?.addEventListener("click", async () => {
    const questionDeck = collectQuestionDeckFromEditor();
    const currentQuestion = questionInput?.value.trim() || "";
    const currentAnswer = answerInput?.value.trim() || "";
    await saveQuestionDeck(questionDeck, {
      currentQuestion,
      currentAnswer,
      currentQuestionId: currentQuestion ? state.currentQuestionId : null,
      answers: {
        participant: participantAnswerInput?.value.trim() || "",
        viewer: viewerAnswerInput?.value.trim() || "",
      },
    });
    showToast?.("Banque de questions enregistrée");
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
