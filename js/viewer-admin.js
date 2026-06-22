import { db, ref, set, push, update, remove, onValue } from "./firebase.js";
import { showConfirm } from "./modal.js";
import { validateYoutubeUrl } from "./blindtest/youtube.js";
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
    afterParticipantId: "m2-viewer-after-participant",
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
    afterParticipantId: "m3-viewer-after-participant",
    firstCorrectOnlyId: "m3-viewer-first-correct-only",
    allowMultiId: "m3-viewer-allow-multi",
  },
  manche4: {
    createFormId: "m4-viewer-question-form",
    listId: "m4-viewer-questions-list",
    liveLabelId: "m4-viewer-live-label",
    promptId: "m4-viewer-prompt",
    aliasesId: "m4-viewer-aliases",
    youtubeUrlId: "m4-viewer-youtube-url",
    pointsId: "m4-viewer-points",
    timerId: "m4-viewer-timer",
    afterParticipantId: "m4-viewer-after-participant",
    firstCorrectOnlyId: "m4-viewer-first-correct-only",
    allowMultiId: "m4-viewer-allow-multi",
  },
  manche5: {
    createFormId: "m5-viewer-question-form",
    listId: "m5-viewer-questions-list",
    liveLabelId: "m5-viewer-live-label",
    promptId: "m5-viewer-prompt",
    aliasesId: "m5-viewer-aliases",
    pointsId: "m5-viewer-points",
    timerId: "m5-viewer-timer",
    afterParticipantId: "m5-viewer-after-participant",
    firstCorrectOnlyId: "m5-viewer-first-correct-only",
    allowMultiId: "m5-viewer-allow-multi",
  },
};


function formatRoundLabel(round) {
  if (round === "manche4") return "manche 4";
  if (round === "manche5") return "manche 5";
  return round;
}

function qPath(round) {
  return `${VIEWER_ROOT}/questions/${round}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  const afterParticipantOrder = Math.max(0, Number(document.getElementById(cfg.afterParticipantId)?.value || 0));
  const firstCorrectOnly = Boolean(document.getElementById(cfg.firstCorrectOnlyId)?.checked);
  const allowMultipleWinners = Boolean(document.getElementById(cfg.allowMultiId)?.checked);
  const youtubeUrl = cfg.youtubeUrlId ? String(document.getElementById(cfg.youtubeUrlId)?.value || "").trim() : "";
  if (!prompt || !acceptedAnswers.length) {
    throw new Error("Prompt et réponses acceptées obligatoires.");
  }
  const mediaPayload = await readViewerMedia(cfg);
  const youtubePayload = {};
  if (youtubeUrl) {
    const validation = validateYoutubeUrl(youtubeUrl);
    if (!validation.valid) throw new Error(validation.reason || "URL YouTube invalide.");
    youtubePayload.youtubeUrl = youtubeUrl;
    youtubePayload.videoId = validation.videoId;
  }
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
    ...youtubePayload,
    active: false,
    points,
    timerSeconds,
    afterParticipantOrder,
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
  const editingQuestionByRound = {};

  Object.entries(ROUND_CONFIGS).forEach(([round, cfg]) => {
    const form = document.getElementById(cfg.createFormId);
    const listNode = document.getElementById(cfg.listId);
    const liveLabel = document.getElementById(cfg.liveLabelId);
    if (!form || !listNode) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = await buildQuestionPayload(round, cfg, getCurrentAdminId?.() || "admin");
        const editingQuestionId = editingQuestionByRound[round];
        if (editingQuestionId) {
          delete payload.createdAt;
          delete payload.createdBy;
          delete payload.active;
          await update(ref(db, `${qPath(round)}/${editingQuestionId}`), {
            ...payload,
            updatedAt: Date.now(),
            updatedBy: getCurrentAdminId?.() || "admin",
          });
          editingQuestionByRound[round] = null;
          showToast?.(`Question viewers ${formatRoundLabel(round)} mise à jour`);
        } else {
          const questionRef = push(ref(db, qPath(round)));
          await set(questionRef, payload);
          showToast?.(`Question viewers ${formatRoundLabel(round)} ajoutée`);
        }
        form.reset();
        const submitButton = form.querySelector(".add-question-button, button[type=submit]");
        if (submitButton) submitButton.textContent = "Ajouter";
      } catch (error) {
        setMessage?.(liveLabel, error.message, "error");
      }
    });

    onValue(ref(db, qPath(round)), (snap) => {
      state.questions[round] = snap.val() || {};
      renderQuestionList(round, cfg, state, { ...options, editingQuestionByRound });
    });
  });

  onValue(ref(db, LIVE_STATE_PATH), (snap) => {
    state.liveState = snap.val() || null;
    Object.entries(ROUND_CONFIGS).forEach(([round, cfg]) => renderQuestionList(round, cfg, state, { ...options, editingQuestionByRound }));
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

function fillViewerQuestionForm(round, cfg, questionId, question) {
  const form = document.getElementById(cfg.createFormId);
  if (!form) return;
  const setValue = (id, value) => {
    const input = id ? document.getElementById(id) : null;
    if (input) input.value = value;
  };
  const setChecked = (id, value) => {
    const input = id ? document.getElementById(id) : null;
    if (input) input.checked = Boolean(value);
  };

  form.dataset.editingQuestionId = questionId;
  setValue(cfg.promptId, question.prompt || question.text || question.questionText || "");
  setValue(cfg.aliasesId, (question.acceptedAnswers || []).join("\n"));
  setValue(cfg.pointsId, String(Math.max(1, Number(question.points || 1))));
  setValue(cfg.timerId, String(Math.max(0, Number(question.timerSeconds || 0))));
  setValue(cfg.afterParticipantId, String(Math.max(0, Number(question.afterParticipantOrder || 0))));
  setValue(cfg.youtubeUrlId, question.youtubeUrl || "");
  setChecked(cfg.firstCorrectOnlyId, question.settings?.firstCorrectOnly);
  setChecked(cfg.allowMultiId, question.settings?.allowMultipleWinners);
  const mediaInput = cfg.mediaId ? document.getElementById(cfg.mediaId) : null;
  if (mediaInput) mediaInput.value = "";
  const submitButton = form.querySelector(".add-question-button, button[type=submit]");
  if (submitButton) submitButton.textContent = "Enregistrer";
  document.getElementById(cfg.promptId)?.focus();
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
        : question.youtubeUrl
          ? `<p class="muted">YouTube : <a href="${escapeHtml(question.youtubeUrl)}" target="_blank" rel="noopener">${escapeHtml(question.youtubeUrl)}</a></p>`
          : "";
    li.innerHTML = `
      <div class="question-head"><strong>V${index + 1}</strong>${isActive ? '<span class="question-active-chip">Live</span>' : ""}</div>
      ${mediaPreview}
      <p>${escapeHtml(question.prompt || question.text || question.questionText)}</p>
      <p class="muted">Aliases (${(question.acceptedAnswers || []).length}) : ${(question.acceptedAnswers || []).map((a) => escapeHtml(a)).join(" · ")}</p>
      <p class="muted">Points ${Number(question.points || 1)} · Timer ${Number(question.timerSeconds || 0)}s${Number(question.afterParticipantOrder || 0) > 0 ? ` · après QP${Number(question.afterParticipantOrder || 0)}` : ""} · ${question.settings?.firstCorrectOnly ? "1er bon" : "multi"}</p>
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
        media: question.imageDataUrl
          ? { kind: "image", fileName: question.fileName || "image" }
          : question.audioDataUrl
            ? { kind: "audio", fileName: question.audioFileName || "musique" }
            : question.youtubeUrl
              ? { kind: "youtube", youtubeUrl: question.youtubeUrl, videoId: question.videoId || "" }
              : null,
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
    editBtn.addEventListener("click", () => {
      options.editingQuestionByRound[round] = id;
      fillViewerQuestionForm(round, cfg, id, question);
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
