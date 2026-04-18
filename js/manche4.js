import { db, ref, get, set, update, remove, onValue } from "./firebase.js";
import { showConfirm } from "./modal.js";
import { getDefaultParticipantColor, normalizeParticipantColor } from "./participants.js";

const M4_STATE_PATH = "rooms/manche4/state";
const M4_GRIDS_PATH = "rooms/manche4/grids";
const M4_SESSIONS_PATH = "rooms/manche1/guestSessions";
const M4_LOCAL_GRIDS_KEY = "zogquiz_m4_grids_backup";

export const manche4State = {
  active: false,
  currentGridId: null,
  cluePhase: 1,
  currentClue: "",
  allowedPlayers: [],
  grids: [],
  playerProgress: {},
  finished: false,
};

export function computeManche4Score(progress) {
  return computeRound4Scores(progress).finalRound4Score;
}

function defaultProgress() {
  return {
    selectedWords: [],
    foundWords: [],
    foundGoodWords: {},
    lockedForCurrentClue: false,
    lockedCluePhase: null,
    hitBlackWord: false,
    blackWordPenalty: false,
    rawRound4Score: 0,
    finalRound4Score: 0,
  };
}

function computeRound4Scores(progress) {
  const phaseToPoints = { 1: 3, 2: 2, 3: 1 };
  const computedRaw = Object.values(progress?.foundGoodWords || {}).reduce((sum, phase) => {
    return sum + (phaseToPoints[phase] || 0);
  }, 0);
  const rawRound4Score = Number.isFinite(progress?.rawRound4Score)
    ? Number(progress.rawRound4Score)
    : computedRaw;
  const hasBlackWordPenalty = Boolean(progress?.blackWordPenalty || progress?.hitBlackWord);
  const finalRound4Score = hasBlackWordPenalty ? Math.floor(rawRound4Score / 2) : rawRound4Score;
  return { rawRound4Score, finalRound4Score };
}

function normalizeGrid(raw) {
  return {
    id: raw?.id || `grid_${Date.now()}`,
    title: (raw?.title || "").trim(),
    words: Array.isArray(raw?.words) ? raw.words.map((word, idx) => ({
      id: word?.id || `w${idx + 1}`,
      text: String(word?.text || "").trim(),
      role: word?.role || "neutral",
    })) : [],
  };
}

function validateGrid(grid) {
  const errors = [];
  if (!grid.title) errors.push("Le titre est obligatoire.");
  if (grid.words.length !== 25) errors.push("La grille doit contenir exactement 25 mots.");

  const good = grid.words.filter((w) => w.role === "good").length;
  const black = grid.words.filter((w) => w.role === "black").length;
  if (good !== 5) errors.push("La grille doit contenir exactement 5 bonnes réponses.");
  if (black !== 1) errors.push("La grille doit contenir exactement 1 mot noir.");

  const emptyWords = grid.words.filter((w) => !w.text);
  if (emptyWords.length) errors.push(`Tous les mots sont obligatoires (${emptyWords.length} vide(s)).`);

  const unique = new Set();
  for (const word of grid.words) {
    const key = word.text.toLowerCase();
    if (unique.has(key)) {
      errors.push("Les mots doivent être uniques dans une grille.");
      break;
    }
    unique.add(key);
  }
  return errors;
}

function getCurrentGrid() {
  return manche4State.grids.find((grid) => grid.id === manche4State.currentGridId) || null;
}

async function ensureStateSeed(adminId = "system") {
  const stateSnap = await get(ref(db, M4_STATE_PATH));
  if (!stateSnap.exists()) {
    await set(ref(db, M4_STATE_PATH), {
      ...manche4State,
      updatedAt: Date.now(),
      updatedBy: adminId,
    });
  }
}

function saveLocalGridBackup(grids) {
  try {
    localStorage.setItem(M4_LOCAL_GRIDS_KEY, JSON.stringify(grids || []));
  } catch {}
}

function hydrateEditor(editorRoot, state) {
  if (!editorRoot || editorRoot.childElementCount) return;
  for (let i = 1; i <= 25; i += 1) {
    const row = document.createElement("div");
    row.className = "m4-word-row";
    row.innerHTML = `<span class="muted">${i}.</span><input data-word-text="${i}" placeholder="Mot ${i}" maxlength="24" /><label><input type="checkbox" data-word-good="${i}" /> Good</label><label><input type="checkbox" data-word-black="${i}" /> Black</label>`;
    editorRoot.appendChild(row);
  }

  editorRoot.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const idx = target.dataset.wordGood || target.dataset.wordBlack;
    if (!idx) return;
    const good = editorRoot.querySelector(`[data-word-good="${idx}"]`);
    const black = editorRoot.querySelector(`[data-word-black="${idx}"]`);
    if (target.dataset.wordGood && target.checked && black) black.checked = false;
    if (target.dataset.wordBlack && target.checked && good) good.checked = false;
  });

  resetGridForm(editorRoot, state);
}

function readGridForm(editorRoot, titleInput, editingGridId = null) {
  const words = [];
  for (let i = 1; i <= 25; i += 1) {
    const text = editorRoot.querySelector(`[data-word-text="${i}"]`)?.value?.trim() || "";
    const good = editorRoot.querySelector(`[data-word-good="${i}"]`)?.checked;
    const black = editorRoot.querySelector(`[data-word-black="${i}"]`)?.checked;
    let role = "neutral";
    if (good) role = "good";
    if (black) role = "black";
    words.push({ id: `w${i}`, text, role });
  }
  return normalizeGrid({
    id: editingGridId || `grid_${Date.now()}`,
    title: titleInput.value.trim(),
    words,
  });
}

function fillGridForm(editorRoot, titleInput, grid) {
  titleInput.value = grid?.title || "";
  for (let i = 1; i <= 25; i += 1) {
    const word = grid?.words?.[i - 1] || { text: "", role: "neutral" };
    const text = editorRoot.querySelector(`[data-word-text="${i}"]`);
    const good = editorRoot.querySelector(`[data-word-good="${i}"]`);
    const black = editorRoot.querySelector(`[data-word-black="${i}"]`);
    if (text) text.value = word.text || "";
    if (good) good.checked = word.role === "good";
    if (black) black.checked = word.role === "black";
  }
}

function resetGridForm(editorRoot, state) {
  state.editingGridId = null;
  fillGridForm(editorRoot, state.gridTitleInput, null);
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function initManche4Admin(options) {
  const {
    getCurrentAdminId,
    setMessage,
    showToast,
    activateRoundSection,
  } = options;

  const els = {
    adminMessage: document.getElementById("m4-admin-message"),
    activeGridLabel: document.getElementById("m4-active-grid-label"),
    phaseLabel: document.getElementById("m4-phase-label"),
    livePhaseLabel: document.getElementById("m4-live-phase"),
    gridTitleInput: document.getElementById("m4-grid-title"),
    wordEditor: document.getElementById("m4-word-editor"),
    saveGridBtn: document.getElementById("m4-save-grid"),
    resetGridFormBtn: document.getElementById("m4-reset-grid-form"),
    gridError: document.getElementById("m4-grid-error"),
    gridsList: document.getElementById("m4-grids-list"),
    participantsList: document.getElementById("m4-participants-list"),
    clueInput: document.getElementById("m4-clue-input"),
    startBtn: document.getElementById("m4-start"),
    nextClueBtn: document.getElementById("m4-next-clue"),
    finishBtn: document.getElementById("m4-finish"),
    resetRoundBtn: document.getElementById("m4-reset-round"),
    preview: document.getElementById("m4-admin-preview"),
    progressList: document.getElementById("m4-progress-list"),
  };

  if (!els.wordEditor) return;

  const localState = { editingGridId: null, sessionsById: {}, gridTitleInput: els.gridTitleInput };
  hydrateEditor(els.wordEditor, localState);

  function refreshMeta() {
    const activeGrid = getCurrentGrid();
    els.activeGridLabel.textContent = activeGrid ? activeGrid.title : "Aucune";
    const phaseText = `Phase ${Math.min(3, Math.max(1, Number(manche4State.cluePhase || 1)))}/3`;
    els.phaseLabel.textContent = phaseText;
    if (els.livePhaseLabel) els.livePhaseLabel.textContent = phaseText;
  }

  function renderGridPreview() {
    const activeGrid = getCurrentGrid();
    els.preview.innerHTML = "";
    if (!activeGrid) {
      els.preview.innerHTML = "<p class='empty-state'>Sélectionnez une grille pour prévisualiser.</p>";
      return;
    }
    const box = document.createElement("div");
    box.className = "m4-grid";
    activeGrid.words.forEach((word) => {
      const item = document.createElement("button");
      item.type = "button";
      item.disabled = true;
      item.className = `m4-word m4-role-${word.role}`;
      item.textContent = word.text;
      box.appendChild(item);
    });
    els.preview.appendChild(box);
  }

  function renderGridsList() {
    els.gridsList.innerHTML = "";
    if (!manche4State.grids.length) {
      els.gridsList.innerHTML = "<li class='empty-state'>Aucune grille.</li>";
      return;
    }
    manche4State.grids.forEach((grid) => {
      const li = document.createElement("li");
      li.className = "question-item";
      const isActive = grid.id === manche4State.currentGridId;
      li.innerHTML = `<div class="question-head"><strong>${escapeHtml(grid.title)}</strong>${isActive ? '<span class="question-active-chip">Active</span>' : ""}</div><p class="muted">${grid.words.length} mots · ${grid.words.filter((w) => w.role === "good").length} good · ${grid.words.filter((w) => w.role === "black").length} black</p>`;
      const row = document.createElement("div");
      row.className = "row";

      const useBtn = document.createElement("button");
      useBtn.className = isActive ? "btn btn-secondary" : "btn btn-primary";
      useBtn.textContent = isActive ? "Utilisée" : "Utiliser";
      useBtn.disabled = isActive;
      useBtn.addEventListener("click", async () => {
        await update(ref(db, M4_STATE_PATH), { currentGridId: grid.id, updatedAt: Date.now(), updatedBy: getCurrentAdminId() || "admin" });
        showToast("Grille active mise à jour");
      });

      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-secondary";
      editBtn.textContent = "Éditer";
      editBtn.addEventListener("click", () => {
        localState.editingGridId = grid.id;
        fillGridForm(els.wordEditor, els.gridTitleInput, grid);
      });

      const duplicateBtn = document.createElement("button");
      duplicateBtn.className = "btn btn-secondary";
      duplicateBtn.textContent = "Dupliquer";
      duplicateBtn.addEventListener("click", async () => {
        const copy = normalizeGrid({ ...grid, id: `grid_${Date.now()}`, title: `${grid.title} (copie)` });
        await set(ref(db, `${M4_GRIDS_PATH}/${copy.id}`), copy);
        showToast("Grille dupliquée");
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-danger";
      deleteBtn.textContent = "Supprimer";
      deleteBtn.addEventListener("click", async () => {
        if (!(await showConfirm("Supprimer cette grille ?", { title: "Suppression de grille" }))) return;
        await remove(ref(db, `${M4_GRIDS_PATH}/${grid.id}`));
        if (manche4State.currentGridId === grid.id) {
          await update(ref(db, M4_STATE_PATH), { currentGridId: null, updatedAt: Date.now(), updatedBy: getCurrentAdminId() || "admin" });
        }
      });

      row.append(useBtn, editBtn, duplicateBtn, deleteBtn);
      li.appendChild(row);
      els.gridsList.appendChild(li);
    });
  }

  function renderParticipants() {
    const entries = Object.entries(localState.sessionsById || {});
    els.participantsList.innerHTML = "";
    if (!entries.length) {
      els.participantsList.innerHTML = "<li class='empty-state'>Aucun participant connecté.</li>";
      return;
    }

    entries.forEach(([sessionId, session]) => {
      const checked = manche4State.allowedPlayers.includes(sessionId);
      const color = normalizeParticipantColor(session?.color, getDefaultParticipantColor(sessionId));
      const li = document.createElement("li");
      li.className = "leader-item";
      li.innerHTML = `<label><input type="checkbox" data-session-id="${sessionId}" ${checked ? "checked" : ""} /> <span class="leader-name"><span class="leader-color-dot" style="background-color:${color}"></span>${escapeHtml(session.nickname || sessionId)}</span></label>`;
      els.participantsList.appendChild(li);
    });
  }

  function renderProgress() {
    const rows = Object.entries(manche4State.playerProgress || {}).map(([sessionId, progress]) => ({
      sessionId,
      nickname: localState.sessionsById[sessionId]?.nickname || sessionId,
      goodCount: Object.keys(progress.foundGoodWords || {}).length,
      hitBlackWord: Boolean(progress.hitBlackWord),
      selectedCount: Array.isArray(progress.selectedWords) ? progress.selectedWords.length : 0,
      score: computeManche4Score(progress),
    })).sort((a, b) => b.score - a.score || b.goodCount - a.goodCount);

    els.progressList.innerHTML = "";
    if (!rows.length) {
      els.progressList.innerHTML = "<li class='empty-state'>Aucune action joueur pour le moment.</li>";
      return;
    }

    rows.forEach((row) => {
      const li = document.createElement("li");
      li.className = "leader-item";
      const color = normalizeParticipantColor(localState.sessionsById[row.sessionId]?.color, getDefaultParticipantColor(row.sessionId));
      li.innerHTML = `<span class="leader-name"><span class="leader-color-dot" style="background-color:${color}"></span>${escapeHtml(row.nickname)}</span><span class="leader-score">${row.score} pt</span><p class="muted">${row.selectedCount} sélections · ${row.goodCount}/5 bons · ${row.hitBlackWord ? "mot noir touché" : "mot noir non touché"}</p>`;
      els.progressList.appendChild(li);
    });
  }

  async function refreshScoresToGlobalLeaderboard() {
    const updates = [];
    Object.entries(manche4State.playerProgress || {}).forEach(([sessionId, progress]) => {
      updates.push(update(ref(db, `${M4_SESSIONS_PATH}/${sessionId}`), {
        manche4Score: computeManche4Score(progress),
        updatedAt: Date.now(),
      }));
    });
    await Promise.all(updates);
  }

  async function saveGrid() {
    const grid = readGridForm(els.wordEditor, els.gridTitleInput, localState.editingGridId);
    const errors = validateGrid(grid);
    if (errors.length) {
      setMessage(els.gridError, errors.join(" "), "error");
      return;
    }
    await set(ref(db, `${M4_GRIDS_PATH}/${grid.id}`), grid);
    setMessage(els.gridError, "Grille sauvegardée.", "success");
    showToast("Grille sauvegardée");
    resetGridForm(els.wordEditor, localState);
  }

  async function pushState(patch) {
    await update(ref(db, M4_STATE_PATH), {
      ...patch,
      updatedAt: Date.now(),
      updatedBy: getCurrentAdminId() || "admin",
    });
  }

  els.saveGridBtn?.addEventListener("click", saveGrid);
  els.resetGridFormBtn?.addEventListener("click", () => resetGridForm(els.wordEditor, localState));
  els.participantsList?.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
    const sessionId = target.dataset.sessionId;
    if (!sessionId) return;
    const current = new Set(manche4State.allowedPlayers || []);
    if (target.checked) current.add(sessionId); else current.delete(sessionId);
    await pushState({ allowedPlayers: Array.from(current) });
  });

  els.startBtn?.addEventListener("click", async () => {
    if (!manche4State.currentGridId) return setMessage(els.adminMessage, "Sélectionnez une grille avant de lancer.", "error");
    if (!manche4State.allowedPlayers.length) return setMessage(els.adminMessage, "Sélectionnez au moins un participant.", "error");
    await pushState({ active: true, finished: false, cluePhase: 1, currentClue: els.clueInput.value.trim(), playerProgress: manche4State.playerProgress || {} });
    activateRoundSection?.("manche4", "live");
    showToast("Manche 4 lancée");
  });

  els.nextClueBtn?.addEventListener("click", async () => {
    const phase = Math.min(3, Number(manche4State.cluePhase || 1) + 1);
    const playerProgress = Object.fromEntries(
      Object.entries(manche4State.playerProgress || {}).map(([sessionId, progress]) => ([
        sessionId,
        { ...defaultProgress(), ...progress, lockedForCurrentClue: false, lockedCluePhase: null },
      ]))
    );
    await pushState({ cluePhase: phase, currentClue: els.clueInput.value.trim(), playerProgress });
  });

  els.finishBtn?.addEventListener("click", async () => {
    await pushState({ active: false, finished: true, currentClue: els.clueInput.value.trim() });
    await refreshScoresToGlobalLeaderboard();
    showToast("Manche 4 terminée");
  });

  els.resetRoundBtn?.addEventListener("click", async () => {
    if (!(await showConfirm("Réinitialiser complètement la manche 4 ?", { title: "Reset manche 4" }))) return;
    await set(ref(db, M4_STATE_PATH), { ...manche4State, updatedAt: Date.now(), updatedBy: getCurrentAdminId() || "admin" });
    showToast("Manche 4 réinitialisée");
  });

  onValue(ref(db, M4_STATE_PATH), (snap) => {
    const state = snap.val() || {};
    Object.assign(manche4State, {
      ...manche4State,
      ...state,
      cluePhase: Math.min(3, Math.max(1, Number(state.cluePhase || 1))),
      allowedPlayers: Array.isArray(state.allowedPlayers) ? state.allowedPlayers : [],
      playerProgress: state.playerProgress || {},
    });
    if (els.clueInput && document.activeElement !== els.clueInput) els.clueInput.value = manche4State.currentClue || "";
    refreshMeta();
    renderParticipants();
    renderProgress();
    renderGridPreview();
  });

  onValue(ref(db, M4_GRIDS_PATH), (snap) => {
    manche4State.grids = Object.values(snap.val() || {}).map(normalizeGrid);
    saveLocalGridBackup(manche4State.grids);
    renderGridsList();
    refreshMeta();
    renderGridPreview();
  });

  onValue(ref(db, M4_SESSIONS_PATH), (snap) => {
    localState.sessionsById = snap.val() || {};
    renderParticipants();
    renderProgress();
  });

  ensureStateSeed(getCurrentAdminId() || "admin").catch(() => {});

  try {
    const backup = JSON.parse(localStorage.getItem(M4_LOCAL_GRIDS_KEY) || "[]");
    if (Array.isArray(backup) && backup.length) {
      setMessage(els.gridError, "Backup local chargé (si la DB est vide).", "default");
    }
  } catch {}
}

export function initManche4Guest(options) {
  const { getCurrentSession } = options;
  const root = document.getElementById("guest-round4");
  if (!root) return;

  const status = document.getElementById("m4-guest-status");
  const clue = document.getElementById("m4-guest-clue");
  const phase = document.getElementById("m4-guest-phase");
  const gridRoot = document.getElementById("m4-guest-grid");

  function canPlay() {
    const sessionId = getCurrentSession?.();
    return Boolean(sessionId && manche4State.allowedPlayers.includes(sessionId));
  }

  async function selectWord(wordId) {
    if (!manche4State.active || manche4State.finished) return;
    const sessionId = getCurrentSession?.();
    if (!sessionId || !canPlay()) return;
    const grid = getCurrentGrid();
    if (!grid) return;

    const progress = { ...defaultProgress(), ...(manche4State.playerProgress[sessionId] || {}) };
    if (progress.lockedForCurrentClue && Number(progress.lockedCluePhase) === Number(manche4State.cluePhase)) return;

    if (progress.lockedForCurrentClue && Number(progress.lockedCluePhase) !== Number(manche4State.cluePhase)) {
      progress.lockedForCurrentClue = false;
      progress.lockedCluePhase = null;
    }

    const selectedWords = new Set(progress.selectedWords || []);
    if (selectedWords.has(wordId)) return;
    selectedWords.add(wordId);

    const word = grid.words.find((item) => item.id === wordId);
    let shouldLockForCurrentClue = false;
    if (word?.role === "good" && !progress.foundGoodWords?.[wordId]) {
      progress.foundGoodWords = { ...(progress.foundGoodWords || {}), [wordId]: manche4State.cluePhase };
      const foundWords = new Set(progress.foundWords || []);
      foundWords.add(wordId);
      progress.foundWords = Array.from(foundWords);
    } else if (word?.role === "black") {
      progress.blackWordPenalty = true;
      progress.hitBlackWord = true;
      shouldLockForCurrentClue = true;
    } else {
      shouldLockForCurrentClue = true;
    }

    if (shouldLockForCurrentClue) {
      progress.lockedForCurrentClue = true;
      progress.lockedCluePhase = Number(manche4State.cluePhase);
    }

    progress.selectedWords = Array.from(selectedWords);
    const { rawRound4Score, finalRound4Score } = computeRound4Scores(progress);
    progress.rawRound4Score = rawRound4Score;
    progress.finalRound4Score = finalRound4Score;
    await update(ref(db, `${M4_STATE_PATH}/playerProgress/${sessionId}`), progress);
  }

  function renderGuestGrid() {
    const grid = getCurrentGrid();
    gridRoot.innerHTML = "";
    if (!grid) {
      gridRoot.innerHTML = "<p class='empty-state'>Aucune grille active.</p>";
      return;
    }

    const sessionId = getCurrentSession?.();
    const progress = { ...defaultProgress(), ...(manche4State.playerProgress[sessionId] || {}) };
    const isLockedForCurrentClue = Boolean(progress.lockedForCurrentClue)
      && Number(progress.lockedCluePhase) === Number(manche4State.cluePhase);
    const selected = new Set(progress.selectedWords || []);

    grid.words.forEach((word) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "m4-word";
      if (selected.has(word.id)) btn.classList.add("is-selected");
      btn.textContent = word.text;
      btn.disabled = !manche4State.active || manche4State.finished || !canPlay() || isLockedForCurrentClue;
      btn.addEventListener("click", async () => selectWord(word.id));
      gridRoot.appendChild(btn);
    });
  }

  function renderGuestStatus() {
    const playable = canPlay();
    clue.textContent = `Indice : ${manche4State.currentClue || "—"}`;
    phase.textContent = `Phase : ${Math.min(3, Math.max(1, Number(manche4State.cluePhase || 1)))}/3`;

    if (manche4State.finished) {
      status.textContent = "Manche terminée.";
    } else if (!manche4State.active) {
      status.textContent = "En attente du lancement.";
    } else if (!playable) {
      status.textContent = "Vous n'êtes pas autorisé pour cette manche.";
    } else {
      const mine = { ...defaultProgress(), ...(manche4State.playerProgress[getCurrentSession?.()] || {}) };
      const isLockedForCurrentClue = Boolean(mine.lockedForCurrentClue)
        && Number(mine.lockedCluePhase) === Number(manche4State.cluePhase);
      if (isLockedForCurrentClue) {
        status.textContent = "Erreur sur cet indice : vous êtes bloqué jusqu'au prochain indice.";
      } else {
        status.textContent = `À vous de jouer · ${Object.keys(mine.foundGoodWords || {}).length}/5 mots trouvés.`;
      }
    }
  }

  onValue(ref(db, M4_STATE_PATH), (snap) => {
    const state = snap.val() || {};
    Object.assign(manche4State, {
      ...manche4State,
      ...state,
      cluePhase: Math.min(3, Math.max(1, Number(state.cluePhase || 1))),
      allowedPlayers: Array.isArray(state.allowedPlayers) ? state.allowedPlayers : [],
      playerProgress: state.playerProgress || {},
    });
    renderGuestStatus();
    renderGuestGrid();
  });

  onValue(ref(db, M4_GRIDS_PATH), (snap) => {
    manche4State.grids = Object.values(snap.val() || {}).map(normalizeGrid);
    renderGuestGrid();
    renderGuestStatus();
  });
}
