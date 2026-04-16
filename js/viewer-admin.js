import { db, ref, set, get, push, update, remove, onValue } from "./firebase.js";
import { showConfirm, showPrompt } from "./modal.js";
import { normalizeViewerAnswer, parseAcceptedAnswers } from "./viewer-utils.js";

const VIEWER_ROOT = "rooms/viewers";
const LIVE_STATE_PATH = `${VIEWER_ROOT}/liveState`;
const CHAT_FEED_PATH = `${VIEWER_ROOT}/chatFeed`;
const ATTEMPTS_PATH = `${VIEWER_ROOT}/attempts`;
const WINNERS_PATH = `${VIEWER_ROOT}/winners`;

const ROUND_CONFIGS = {
  manche2: {
    createFormId: "m2-viewer-question-form",
    listId: "m2-viewer-questions-list",
    liveLabelId: "m2-viewer-live-label",
    promptId: "m2-viewer-prompt",
    aliasesId: "m2-viewer-aliases",
    pointsId: "m2-viewer-points",
    timerId: "m2-viewer-timer",
    firstCorrectOnlyId: "m2-viewer-first-correct-only",
    allowMultiId: "m2-viewer-allow-multi",
  },
  manche3: {
    createFormId: "m3-viewer-question-form",
    listId: "m3-viewer-questions-list",
    liveLabelId: "m3-viewer-live-label",
    promptId: "m3-viewer-prompt",
    aliasesId: "m3-viewer-aliases",
    pointsId: "m3-viewer-points",
    timerId: "m3-viewer-timer",
    firstCorrectOnlyId: "m3-viewer-first-correct-only",
    allowMultiId: "m3-viewer-allow-multi",
  },
  manche5: {
    createFormId: "m5-viewer-question-form",
    listId: "m5-viewer-questions-list",
    liveLabelId: "m5-viewer-live-label",
    promptId: "m5-viewer-prompt",
    aliasesId: "m5-viewer-aliases",
    pointsId: "m5-viewer-points",
    timerId: "m5-viewer-timer",
    firstCorrectOnlyId: "m5-viewer-first-correct-only",
    allowMultiId: "m5-viewer-allow-multi",
  },
};

function qPath(round) {
  return `${VIEWER_ROOT}/questions/${round}`;
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatRemaining(endsAt) {
  const remaining = Math.max(0, Number(endsAt || 0) - Date.now());
  const sec = Math.floor(remaining / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function buildQuestionPayload(round, cfg, adminId) {
  const prompt = document.getElementById(cfg.promptId)?.value?.trim() || "";
  const acceptedAnswers = parseAcceptedAnswers(document.getElementById(cfg.aliasesId)?.value || "");
  const points = Math.max(1, Number(document.getElementById(cfg.pointsId)?.value || 1));
  const timerSeconds = Math.max(0, Number(document.getElementById(cfg.timerId)?.value || 0));
  const firstCorrectOnly = Boolean(document.getElementById(cfg.firstCorrectOnlyId)?.checked);
  const allowMultipleWinners = Boolean(document.getElementById(cfg.allowMultiId)?.checked);
  if (!prompt || !acceptedAnswers.length) {
    throw new Error("Prompt et réponses acceptées obligatoires.");
  }
  return {
    round,
    type: "viewer",
    prompt,
    acceptedAnswers,
    answer: acceptedAnswers[0],
    normalizedAnswers: acceptedAnswers.map((value) => normalizeViewerAnswer(value)).filter(Boolean),
    active: false,
    points,
    timerSeconds,
    settings: {
      firstCorrectOnly,
      allowMultipleWinners,
      caseSensitive: false,
    },
    createdAt: Date.now(),
    createdBy: adminId,
  };
}

function computeSessionKey(liveState) {
  if (!liveState?.active) return null;
  if (liveState.round === "manche4") return `manche4:${liveState.gridId || "grid"}:${liveState.clueId || "clue"}`;
  return `${liveState.round}:${liveState.questionId}`;
}

export function initViewerAdmin(options) {
  const { getCurrentAdminId, showToast, setMessage } = options;
  const state = { liveState: null, questions: { manche2: {}, manche3: {}, manche5: {} }, attempts: {}, winners: {} };

  Object.entries(ROUND_CONFIGS).forEach(([round, cfg]) => {
    const form = document.getElementById(cfg.createFormId);
    const listNode = document.getElementById(cfg.listId);
    const liveLabel = document.getElementById(cfg.liveLabelId);
    if (!form || !listNode) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = buildQuestionPayload(round, cfg, getCurrentAdminId?.() || "admin");
        const questionRef = push(ref(db, qPath(round)));
        await set(questionRef, payload);
        form.reset();
        showToast?.(`Question viewers ${round} ajoutée`);
      } catch (error) {
        setMessage?.(liveLabel, error.message, "error");
      }
    });

    onValue(ref(db, qPath(round)), (snap) => {
      state.questions[round] = snap.val() || {};
      renderQuestionList(round, cfg, state, options);
    });
  });

  onValue(ref(db, LIVE_STATE_PATH), (snap) => {
    state.liveState = snap.val() || null;
    Object.entries(ROUND_CONFIGS).forEach(([round, cfg]) => renderQuestionList(round, cfg, state, options));
    renderLivePanels(state);
  });

  onValue(ref(db, ATTEMPTS_PATH), (snap) => {
    state.attempts = snap.val() || {};
    renderLivePanels(state);
  });

  onValue(ref(db, WINNERS_PATH), (snap) => {
    state.winners = snap.val() || {};
    renderLivePanels(state);
  });


  const m4StartBtn = document.getElementById("m4-viewer-start-clue");
  const m4StopBtn = document.getElementById("m4-viewer-stop-clue");
  const m4LiveLabel = document.getElementById("m4-viewer-live-label");

  m4StartBtn?.addEventListener("click", async () => {
    const clueId = (document.getElementById("m4-viewer-clue-id")?.value || "").trim() || `clue_${Date.now()}`;
    const timerSeconds = Math.max(0, Number(document.getElementById("m4-viewer-timer")?.value || 20));
    const points = Math.max(1, Number(document.getElementById("m4-viewer-points")?.value || 3));
    const gridId = String((await get(ref(db, "rooms/manche4/state/currentGridId"))).val() || "");
    const now = Date.now();
    await set(ref(db, LIVE_STATE_PATH), {
      active: true,
      status: "active",
      mode: "viewer-grid",
      round: "manche4",
      gridId,
      clueId,
      timerSeconds,
      points,
      settings: { firstCorrectOnly: true, allowMultipleWinners: false, numericOnly: true },
      startedAt: now,
      endsAt: timerSeconds > 0 ? now + timerSeconds * 1000 : null,
      updatedAt: now,
      updatedBy: getCurrentAdminId?.() || "admin",
    });
    if (m4LiveLabel) m4LiveLabel.textContent = `Indice viewers actif (${clueId})`;
  });

  m4StopBtn?.addEventListener("click", async () => {
    await update(ref(db, LIVE_STATE_PATH), {
      active: false,
      status: "stopped",
      endedAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: getCurrentAdminId?.() || "admin",
    });
    if (m4LiveLabel) m4LiveLabel.textContent = "Aucun indice viewers actif.";
  });

  onValue(ref(db, CHAT_FEED_PATH), (snap) => {
    const feed = snap.val() || {};
    const rows = Object.values(feed).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, 20);
    const node = document.getElementById("viewer-chat-feed");
    if (!node) return;
    node.innerHTML = rows.length
      ? rows.map((item) => `<li><strong>${escapeHtml(item.username)}</strong> · ${escapeHtml(item.message)}</li>`).join("")
      : "<li class='empty-state'>Aucun message Twitch reçu.</li>";
  });
}

function renderLivePanels(state) {
  const status = document.getElementById("viewer-live-status");
  const winnersNode = document.getElementById("viewer-live-winners");
  const attemptsNode = document.getElementById("viewer-live-attempts");
  if (!status || !winnersNode || !attemptsNode) return;

  const sessionKey = computeSessionKey(state.liveState);
  if (!sessionKey) {
    status.textContent = "Aucune question viewers active.";
    winnersNode.innerHTML = "<li class='empty-state'>Aucun gagnant.</li>";
    attemptsNode.innerHTML = "<li class='empty-state'>Aucune tentative.</li>";
    return;
  }

  const endsAtLabel = state.liveState?.endsAt ? ` · Temps restant ${formatRemaining(state.liveState.endsAt)}` : "";
  status.textContent = `${state.liveState.round} actif (${sessionKey})${endsAtLabel}`;

  const winners = Object.values(state.winners[sessionKey] || {}).sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  winnersNode.innerHTML = winners.length
    ? winners.map((winner, index) => `<li>${index + 1}. ${escapeHtml(winner.username)} (+${Number(winner.points || 0)} pt)</li>`).join("")
    : "<li class='empty-state'>Aucun gagnant pour cette session.</li>";

  const attempts = Object.values(state.attempts[sessionKey] || {}).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, 12);
  attemptsNode.innerHTML = attempts.length
    ? attempts.map((attempt) => `<li>${escapeHtml(attempt.username)} → ${escapeHtml(attempt.message)} ${attempt.correct ? "✅" : "❌"}</li>`).join("")
    : "<li class='empty-state'>Aucune tentative récente.</li>";
}

function renderQuestionList(round, cfg, state, options) {
  const list = document.getElementById(cfg.listId);
  const liveLabel = document.getElementById(cfg.liveLabelId);
  if (!list) return;

  const entries = Object.entries(state.questions[round] || {}).sort((a, b) => Number(a[1].createdAt || 0) - Number(b[1].createdAt || 0));
  list.innerHTML = "";
  if (!entries.length) {
    list.innerHTML = "<li class='empty-state'>Aucune question viewers.</li>";
  }

  entries.forEach(([id, question], index) => {
    const li = document.createElement("li");
    const isActive = state.liveState?.active && state.liveState?.round === round && state.liveState?.questionId === id;
    li.className = `question-item viewer-question-card ${isActive ? "viewer-question-card-active" : ""}`;
    li.innerHTML = `
      <div class="question-head"><strong>V${index + 1}</strong>${isActive ? '<span class="question-active-chip">Live</span>' : ""}</div>
      <p>${escapeHtml(question.prompt)}</p>
      <p class="muted">Aliases (${(question.acceptedAnswers || []).length}) : ${(question.acceptedAnswers || []).map((a) => escapeHtml(a)).join(" · ")}</p>
      <p class="muted">Points ${Number(question.points || 1)} · Timer ${Number(question.timerSeconds || 0)}s · ${question.settings?.firstCorrectOnly ? "1er bon" : "multi"}</p>
    `;

    const row = document.createElement("div");
    row.className = "row question-actions";

    const activateBtn = document.createElement("button");
    activateBtn.className = isActive ? "btn btn-secondary" : "btn btn-primary";
    activateBtn.textContent = isActive ? "En live" : "Activer";
    activateBtn.disabled = isActive;
    activateBtn.addEventListener("click", async () => {
      const now = Date.now();
      const timerSeconds = Number(question.timerSeconds || 0);
      await set(ref(db, LIVE_STATE_PATH), {
        active: true,
        status: "active",
        mode: "viewer-question",
        round,
        questionId: id,
        settings: question.settings || {},
        points: Number(question.points || 1),
        timerSeconds,
        startedAt: now,
        endsAt: timerSeconds > 0 ? now + timerSeconds * 1000 : null,
        updatedAt: now,
        updatedBy: options.getCurrentAdminId?.() || "admin",
      });
      options.showToast?.(`Question viewers ${round} activée`);
    });

    const stopBtn = document.createElement("button");
    stopBtn.className = "btn btn-secondary";
    stopBtn.textContent = "Stop";
    stopBtn.addEventListener("click", async () => {
      await update(ref(db, LIVE_STATE_PATH), {
        active: false,
        status: "stopped",
        endedAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: options.getCurrentAdminId?.() || "admin",
      });
    });

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Éditer";
    editBtn.addEventListener("click", async () => {
      const nextPrompt = await showPrompt("Modifier le prompt viewers", {
        title: "Éditer question viewers",
        inputLabel: "Prompt",
        defaultValue: question.prompt || "",
        confirmText: "Continuer",
      });
      if (nextPrompt === null) return;
      const nextAliasesRaw = await showPrompt("Modifier les aliases (une ligne = une réponse)", {
        title: "Éditer aliases",
        inputLabel: "Réponses acceptées",
        defaultValue: (question.acceptedAnswers || []).join("\n"),
        confirmText: "Enregistrer",
      });
      if (nextAliasesRaw === null) return;
      const acceptedAnswers = parseAcceptedAnswers(nextAliasesRaw);
      if (!nextPrompt.trim() || !acceptedAnswers.length) {
        options.showToast?.("Prompt / aliases invalides", "error");
        return;
      }
      await update(ref(db, `${qPath(round)}/${id}`), {
        prompt: nextPrompt.trim(),
        acceptedAnswers,
        normalizedAnswers: acceptedAnswers.map((value) => normalizeViewerAnswer(value)),
        answer: acceptedAnswers[0],
        updatedAt: Date.now(),
        updatedBy: options.getCurrentAdminId?.() || "admin",
      });
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.addEventListener("click", async () => {
      if (!(await showConfirm("Supprimer cette question viewers ?", { title: "Suppression" }))) return;
      await remove(ref(db, `${qPath(round)}/${id}`));
    });

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn btn-danger";
    resetBtn.textContent = "Reset résultats";
    resetBtn.addEventListener("click", async () => {
      const sessionKey = `${round}:${id}`;
      await Promise.all([
        remove(ref(db, `${ATTEMPTS_PATH}/${sessionKey}`)),
        remove(ref(db, `${WINNERS_PATH}/${sessionKey}`)),
      ]);
      options.showToast?.("Résultats viewers réinitialisés");
    });

    row.append(activateBtn, stopBtn, editBtn, resetBtn, deleteBtn);
    li.appendChild(row);
    list.appendChild(li);
  });

  if (liveLabel) {
    const current = state.liveState;
    if (current?.active && current.round === round) {
      const timerLabel = current.endsAt ? ` · ⏱ ${formatRemaining(current.endsAt)}` : "";
      liveLabel.textContent = `Question viewers active (${round})${timerLabel}`;
      liveLabel.classList.add("success");
    } else {
      liveLabel.textContent = "Aucune question viewers active.";
      liveLabel.classList.remove("success");
    }
  }
}
