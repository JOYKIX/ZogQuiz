import { db, ref, set, push, update, remove, onValue } from "./firebase.js";
import { showConfirm, showPrompt } from "./modal.js";
import { normalizeViewerAnswer, parseAcceptedAnswers } from "./viewer-utils.js";

const VIEWER_ROOT = "rooms/viewers";
const LIVE_STATE_PATH = `${VIEWER_ROOT}/liveState`;
const CHAT_FEED_PATH = `${VIEWER_ROOT}/chatFeed`;
const ATTEMPTS_PATH = `${VIEWER_ROOT}/attempts`;
const WINNERS_PATH = `${VIEWER_ROOT}/winners`;
const MAX_VIEWER_IMAGE_SIZE = 3 * 1024 * 1024;
const MAX_VIEWER_AUDIO_SIZE = 10 * 1024 * 1024;

const ROUND_CONFIGS = {
  manche2: {
    createFormId: "m2-viewer-question-form",
    listId: "m2-viewer-questions-list",
    liveLabelId: "m2-viewer-live-label",
    promptId: "m2-viewer-prompt",
    aliasesId: "m2-viewer-aliases",
    mediaId: "m2-viewer-image",
    mediaKind: "image",
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
    mediaId: "m3-viewer-audio",
    mediaKind: "audio",
    pointsId: "m3-viewer-points",
    timerId: "m3-viewer-timer",
    firstCorrectOnlyId: "m3-viewer-first-correct-only",
    allowMultiId: "m3-viewer-allow-multi",
  },
  manche4: {
    createFormId: "m4-viewer-question-form",
    listId: "m4-viewer-questions-list",
    liveLabelId: "m4-viewer-live-label",
    promptId: "m4-viewer-prompt",
    aliasesId: "m4-viewer-aliases",
    pointsId: "m4-viewer-points",
    timerId: "m4-viewer-timer",
    firstCorrectOnlyId: "m4-viewer-first-correct-only",
    allowMultiId: "m4-viewer-allow-multi",
  },
};


function formatRoundLabel(round) {
  if (round === "manche4") return "manche 4";
  return round;
}

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

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture fichier impossible."));
    reader.readAsDataURL(file);
  });
}

async function readViewerMedia(cfg) {
  const input = cfg.mediaId ? document.getElementById(cfg.mediaId) : null;
  const file = input?.files?.[0];
  if (!file) return {};

  if (cfg.mediaKind === "image") {
    if (!file.type.startsWith("image/")) throw new Error("Image viewers invalide.");
    if (file.size > MAX_VIEWER_IMAGE_SIZE) throw new Error("Image viewers trop lourde (3 Mo max).");
    return { imageDataUrl: await readFileAsDataURL(file), fileName: file.name, mimeType: file.type };
  }

  if (cfg.mediaKind === "audio") {
    if (!file.type.startsWith("audio/")) throw new Error("Musique viewers invalide.");
    if (file.size > MAX_VIEWER_AUDIO_SIZE) throw new Error("Musique viewers trop lourde (10 Mo max).");
    return { audioDataUrl: await readFileAsDataURL(file), audioFileName: file.name, audioMimeType: file.type };
  }

  return {};
}

async function buildQuestionPayload(round, cfg, adminId) {
  const prompt = document.getElementById(cfg.promptId)?.value?.trim() || "";
  const acceptedAnswers = parseAcceptedAnswers(document.getElementById(cfg.aliasesId)?.value || "");
  const points = Math.max(1, Number(document.getElementById(cfg.pointsId)?.value || 1));
  const timerSeconds = Math.max(0, Number(document.getElementById(cfg.timerId)?.value || 0));
  const firstCorrectOnly = Boolean(document.getElementById(cfg.firstCorrectOnlyId)?.checked);
  const allowMultipleWinners = Boolean(document.getElementById(cfg.allowMultiId)?.checked);
  if (!prompt || !acceptedAnswers.length) {
    throw new Error("Prompt et réponses acceptées obligatoires.");
  }
  const mediaPayload = await readViewerMedia(cfg);
  return {
    round,
    type: "viewer",
    prompt,
    text: prompt,
    questionText: prompt,
    acceptedAnswers,
    aliases: acceptedAnswers,
    answer: acceptedAnswers[0],
    normalizedAnswers: acceptedAnswers.map((value) => normalizeViewerAnswer(value)).filter(Boolean),
    ...mediaPayload,
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
  return `${liveState.round}:${liveState.questionId}`;
}

export function initViewerAdmin(options) {
  const { getCurrentAdminId, showToast, setMessage } = options;
  const state = { liveState: null, questions: { manche2: {}, manche3: {}, manche4: {} }, attempts: {}, winners: {} };

  Object.entries(ROUND_CONFIGS).forEach(([round, cfg]) => {
    const form = document.getElementById(cfg.createFormId);
    const listNode = document.getElementById(cfg.listId);
    const liveLabel = document.getElementById(cfg.liveLabelId);
    if (!form || !listNode) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = await buildQuestionPayload(round, cfg, getCurrentAdminId?.() || "admin");
        const questionRef = push(ref(db, qPath(round)));
        await set(questionRef, payload);
        form.reset();
        showToast?.(`Question viewers ${formatRoundLabel(round)} ajoutée`);
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
    status.textContent = "Aucune question active.";
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
    list.innerHTML = "<li class='empty-state'>Aucune question.</li>";
  }

  entries.forEach(([id, question], index) => {
    const li = document.createElement("li");
    const isActive = state.liveState?.active && state.liveState?.round === round && state.liveState?.questionId === id;
    li.className = `question-item viewer-question-card ${isActive ? "viewer-question-card-active" : ""}`;
    const mediaPreview = question.imageDataUrl
      ? `<img class="m2-thumb" src="${question.imageDataUrl}" alt="Image viewers ${formatRoundLabel(round)}" loading="lazy" decoding="async" />`
      : question.audioDataUrl
        ? `<audio controls preload="metadata" src="${question.audioDataUrl}"></audio>`
        : "";
    li.innerHTML = `
      <div class="question-head"><strong>V${index + 1}</strong>${isActive ? '<span class="question-active-chip">Live</span>' : ""}</div>
      ${mediaPreview}
      <p>${escapeHtml(question.prompt || question.text || question.questionText)}</p>
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
        media: question.imageDataUrl ? { kind: "image", fileName: question.fileName || "image" } : question.audioDataUrl ? { kind: "audio", fileName: question.audioFileName || "musique" } : null,
        startedAt: now,
        endsAt: timerSeconds > 0 ? now + timerSeconds * 1000 : null,
        updatedAt: now,
        updatedBy: options.getCurrentAdminId?.() || "admin",
      });
      options.showToast?.(`Question viewers ${formatRoundLabel(round)} activée`);
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
        text: nextPrompt.trim(),
        questionText: nextPrompt.trim(),
        acceptedAnswers,
        aliases: acceptedAnswers,
        normalizedAnswers: acceptedAnswers.map((value) => normalizeViewerAnswer(value)).filter(Boolean),
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
      liveLabel.textContent = `Question viewers active (${formatRoundLabel(round)})${timerLabel}`;
      liveLabel.classList.add("success");
    } else {
      liveLabel.textContent = "Aucune question active.";
      liveLabel.classList.remove("success");
    }
  }
}
