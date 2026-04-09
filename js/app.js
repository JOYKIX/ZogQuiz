import {
  db,
  ref,
  set,
  get,
  onValue,
  push,
  update,
  remove,
  ensureRoundsSeed,
  makeTempCode,
} from "./firebase.js";

const authSection = document.getElementById("auth-section");
const dashboard = document.getElementById("dashboard");
const authMessage = document.getElementById("auth-message");
const adminEmail = document.getElementById("admin-email");
const logoutBtn = document.getElementById("logout");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const showLoginBtn = document.getElementById("show-login");
const showSignupBtn = document.getElementById("show-signup");
const breadcrumb = document.getElementById("breadcrumb");
const toast = document.getElementById("toast");

const codesList = document.getElementById("codes-list");
const codeDuration = document.getElementById("code-duration");
const generatedCode = document.getElementById("generated-code");

const participantQuestionForm = document.getElementById("participant-question-form");
const viewerQuestionForm = document.getElementById("viewer-question-form");
const participantQuestionsList = document.getElementById("participant-questions-list");
const viewerQuestionsList = document.getElementById("viewer-questions-list");

const toggleAnswerBtn = document.getElementById("toggle-answer");
const unlockBuzzerBtn = document.getElementById("unlock-buzzer");
const markCorrectBtn = document.getElementById("mark-correct");
const markWrongBtn = document.getElementById("mark-wrong");

const roundStatus = document.getElementById("round-status");
const buzzLive = document.getElementById("buzz-live");
const activeQuestion = document.getElementById("active-question");
const participantsList = document.getElementById("participants-list");
const m1ParticipantsList = document.getElementById("m1-participants-list");
const quickLeaderboard = document.getElementById("quick-leaderboard");
const scoreboardPreview = document.getElementById("scoreboard-preview");
const overlayFontSizeInput = document.getElementById("overlay-font-size");

const sessionStatus = document.getElementById("session-status");
const activeRoundStatus = document.getElementById("active-round-status");
const currentQuestionStatus = document.getElementById("current-question-status");
const buzzerStatus = document.getElementById("buzzer-status");
const lastBuzzStatus = document.getElementById("last-buzz-status");

const m2QuestionForm = document.getElementById("m2-question-form");
const m2ImageInput = document.getElementById("m2-image");
const m2WorkInput = document.getElementById("m2-work");
const m2LocationInput = document.getElementById("m2-location");
const m2QuestionsList = document.getElementById("m2-questions-list");
const m2ParticipantsList = document.getElementById("m2-participants-list");
const m2LiveStatus = document.getElementById("m2-live-status");

const workspaceLinks = Array.from(document.querySelectorAll(".nav-item"));
const workspacePanels = Array.from(document.querySelectorAll("[data-workspace-panel]"));
const quickNavBtns = Array.from(document.querySelectorAll(".quick-nav"));
const roundTabs = Array.from(document.querySelectorAll(".round-tab"));
const roundPanels = Array.from(document.querySelectorAll(".round-shell"));
const roundSectionTabs = Array.from(document.querySelectorAll(".subnav-tab"));
const roundSectionPanels = Array.from(document.querySelectorAll("[data-round-section-panel]"));

const SESSION_KEY = "zogquiz_admin_id";
const MAX_IMAGE_SIZE = 3 * 1024 * 1024;

let currentAdminId = null;
let activeRound = "manche1";
let activeWorkspace = "dashboard";
const activeRoundSectionByRound = {
  manche1: "overview",
  manche2: "overview",
  manche3: "overview",
  manche4: "overview",
  manche5: "overview",
  finale: "overview",
};

let liveState = null;
let overlaySettings = { questionFontSizePx: 72 };
let codeCleanupLock = false;
let sessionsById = {};
let participantQuestions = {};
let viewerQuestions = {};
let manche2Questions = {};
let manche2State = null;

function normalizeAdminId(rawId) {
  return rawId.trim().toLowerCase();
}

function showToast(text, type = "success") {
  if (!toast) return;
  toast.textContent = text;
  toast.classList.remove("hidden", "error");
  if (type === "error") toast.classList.add("error");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 2200);
}

function setMessage(target, text, type = "default") {
  if (!target) return;
  target.textContent = text;
  target.classList.remove("success", "error", "loading");
  if (type !== "default") target.classList.add(type);
}

function isLoggedIn() {
  return Boolean(currentAdminId);
}

function setSession(adminId) {
  currentAdminId = adminId;
  localStorage.setItem(SESSION_KEY, adminId);
}

function clearSession() {
  currentAdminId = null;
  localStorage.removeItem(SESSION_KEY);
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function showDashboard(adminId) {
  authSection.classList.add("hidden");
  dashboard.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  adminEmail.textContent = `Connecté : ${adminId}`;
  sessionStatus.textContent = "Active";
}

function showAuth() {
  authSection.classList.remove("hidden");
  dashboard.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  adminEmail.textContent = "Hors ligne";
  sessionStatus.textContent = "Hors ligne";
}

function workspaceLabel(workspace) {
  if (workspace === "dashboard") return "Dashboard global";
  if (workspace === "players") return "Joueurs & invités";
  if (workspace === "broadcast") return "Overlays & diffusion";
  return `Pilotage • ${formatRound(activeRound)}`;
}

function formatRound(round) {
  return round === "finale" ? "Finale" : round.replace("manche", "Manche ");
}

function activateWorkspace(workspace) {
  activeWorkspace = workspace;
  workspaceLinks.forEach((btn) => btn.classList.toggle("active", btn.dataset.workspace === workspace));
  workspacePanels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.workspacePanel !== workspace));
  breadcrumb.textContent = workspaceLabel(workspace);
}

function activateRoundSection(round, section) {
  activeRoundSectionByRound[round] = section;
  roundSectionTabs.forEach((btn) => {
    const isActive = btn.dataset.round === round && btn.dataset.roundSection === section;
    btn.classList.toggle("active", isActive);
  });
  roundSectionPanels.forEach((panel) => {
    const [panelRound, panelSection] = panel.dataset.roundSectionPanel.split(":");
    const visible = panelRound === round && panelSection === section;
    panel.classList.toggle("hidden", !visible);
  });
}

async function setActiveRound(round) {
  activeRound = round;
  activeRoundStatus.textContent = formatRound(round);
  roundTabs.forEach((btn) => {
    const isActive = btn.dataset.round === round;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
  roundPanels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.roundPanel !== round));
  activateRoundSection(round, activeRoundSectionByRound[round] || "overview");
  if (activeWorkspace === "rounds") breadcrumb.textContent = workspaceLabel("rounds");

  if (isLoggedIn()) {
    await update(ref(db, "quiz/state"), {
      activeRound: round,
      updatedAt: Date.now(),
      updatedBy: currentAdminId,
    });
  }
}

workspaceLinks.forEach((btn) => btn.addEventListener("click", () => activateWorkspace(btn.dataset.workspace)));
quickNavBtns.forEach((btn) => btn.addEventListener("click", () => activateWorkspace(btn.dataset.workspaceTarget)));

roundTabs.forEach((btn) => btn.addEventListener("click", async () => {
  await setActiveRound(btn.dataset.round);
}));

roundSectionTabs.forEach((btn) => {
  btn.addEventListener("click", () => activateRoundSection(btn.dataset.round, btn.dataset.roundSection));
});

activateWorkspace("dashboard");
activateRoundSection("manche1", "overview");

showLoginBtn.addEventListener("click", () => {
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  showLoginBtn.classList.add("active-auth");
  showSignupBtn.classList.remove("active-auth");
});

showSignupBtn.addEventListener("click", () => {
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  showSignupBtn.classList.add("active-auth");
  showLoginBtn.classList.remove("active-auth");
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setMessage(authMessage, "Création...", "loading");
    const adminId = normalizeAdminId(document.getElementById("signup-id").value);
    const password = document.getElementById("signup-password").value;
    if (!adminId || !password) throw new Error("ID et mot de passe obligatoires.");

    const adminRef = ref(db, `admins/${adminId}`);
    if ((await get(adminRef)).exists()) throw new Error("Cet ID existe déjà.");

    await set(adminRef, { adminId, passwordHash: await hashPassword(password), createdAt: Date.now() });
    await loginSuccess(adminId);
    setMessage(authMessage, "Compte créé.", "success");
  } catch (error) {
    setMessage(authMessage, `Création impossible : ${error.message}`, "error");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setMessage(authMessage, "Connexion...", "loading");
    const adminId = normalizeAdminId(document.getElementById("login-id").value);
    const password = document.getElementById("login-password").value;

    const adminSnap = await get(ref(db, `admins/${adminId}`));
    if (!adminSnap.exists()) throw new Error("ID inconnu.");

    const adminData = adminSnap.val() || {};
    if ((await hashPassword(password)) !== adminData.passwordHash) throw new Error("Mot de passe incorrect.");

    await loginSuccess(adminId);
    setMessage(authMessage, "Connexion réussie.", "success");
  } catch (error) {
    setMessage(authMessage, `Connexion impossible : ${error.message}`, "error");
  }
});

logoutBtn.addEventListener("click", () => {
  clearSession();
  showAuth();
  setMessage(authMessage, "Déconnecté.");
});

document.getElementById("generate-code").addEventListener("click", async () => {
  if (!isLoggedIn()) return;
  const code = makeTempCode(6);
  const minutes = Math.max(1, Number(codeDuration.value || 30));
  await set(ref(db, `rooms/manche1/accessCodes/${code}`), {
    code,
    active: true,
    createdBy: currentAdminId,
    createdAt: Date.now(),
    expiresAt: Date.now() + minutes * 60 * 1000,
  });
  setMessage(generatedCode, `Code ${code} actif ${minutes} min.`, "success");
  showToast(`Code ${code} généré`);
});

participantQuestionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createRound1Question("participants", "participant-question", "participant-answer");
});

viewerQuestionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createRound1Question("viewers", "viewer-question", "viewer-answer");
});

m2QuestionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createRound2Question();
});

toggleAnswerBtn.addEventListener("click", async () => {
  if (!liveState?.currentQuestionId) return;
  await update(ref(db, "rooms/manche1/state"), {
    showAnswer: !liveState.showAnswer,
    updatedAt: Date.now(),
  });
  showToast("Affichage de réponse mis à jour");
});

unlockBuzzerBtn.addEventListener("click", async () => {
  await unlockBuzzer();
  showToast("Buzzer déverrouillé");
});

markCorrectBtn.addEventListener("click", async () => {
  if (!liveState?.lockedBySessionId) return;
  await updateParticipantScore(liveState.lockedBySessionId, 1);
  await unlockBuzzer();
  showToast("Point attribué");
});

markWrongBtn.addEventListener("click", async () => {
  if (!liveState?.lockedBySessionId || !liveState?.currentQuestionId) return;
  await set(ref(db, `rooms/manche1/questionBlocks/${liveState.currentQuestionId}/${liveState.lockedBySessionId}`), true);
  await unlockBuzzer();
  showToast("Réponse marquée incorrecte", "error");
});

overlayFontSizeInput.addEventListener("change", async () => {
  await saveOverlayFontSize(overlayFontSizeInput.value);
});

overlayFontSizeInput.addEventListener("blur", async () => {
  await saveOverlayFontSize(overlayFontSizeInput.value);
});

async function loginSuccess(adminId) {
  setSession(adminId);
  await ensureRoundsSeed(adminId);
  await setActiveRound("manche1");
  initListeners();
  showDashboard(adminId);
}

async function createRound1Question(type, questionInputId, answerInputId) {
  const questionInput = document.getElementById(questionInputId);
  const answerInput = document.getElementById(answerInputId);
  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();
  if (!question || !answer) return;

  const listSnap = await get(ref(db, `rooms/manche1/questions/${type}`));
  const order = Object.keys(listSnap.val() || {}).length + 1;

  const questionRef = push(ref(db, `rooms/manche1/questions/${type}`));
  await set(questionRef, {
    type,
    text: question,
    answer,
    order,
    createdAt: Date.now(),
    createdBy: currentAdminId,
  });

  questionInput.value = "";
  answerInput.value = "";
  showToast("Question ajoutée");
}

async function createRound2Question() {
  const file = m2ImageInput.files?.[0];
  const work = m2WorkInput.value.trim();
  const location = m2LocationInput.value.trim();
  if (!file || !work || !location) return;
  if (!file.type.startsWith("image/")) {
    setMessage(m2LiveStatus, "Image invalide.", "error");
    return;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    setMessage(m2LiveStatus, "Image trop lourde (3 Mo max).", "error");
    return;
  }

  setMessage(m2LiveStatus, "Upload...", "loading");

  const imageDataUrl = await readFileAsDataURL(file);
  const listSnap = await get(ref(db, "rooms/manche2/questions"));
  const order = Object.keys(listSnap.val() || {}).length + 1;

  const questionRef = push(ref(db, "rooms/manche2/questions"));
  await set(questionRef, {
    imageDataUrl,
    work,
    location,
    fileName: file.name,
    mimeType: file.type,
    order,
    createdAt: Date.now(),
    createdBy: currentAdminId,
  });

  m2QuestionForm.reset();
  setMessage(m2LiveStatus, "Question ajoutée.", "success");
  showToast("Question manche 2 ajoutée");
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture fichier impossible."));
    reader.readAsDataURL(file);
  });
}

function initListeners() {
  onValue(ref(db, "quiz/state"), async (snap) => {
    const state = snap.val() || {};
    const nextRound = state.activeRound || "manche1";
    if (nextRound !== activeRound) {
      activeRound = nextRound;
      await setActiveRound(nextRound);
    }
  });

  onValue(ref(db, "rooms/manche1/questions/participants"), (snap) => {
    participantQuestions = snap.val() || {};
    renderRound1QuestionList("participants", participantQuestions, participantQuestionsList);
    refreshRound1Snapshot();
  });

  onValue(ref(db, "rooms/manche1/questions/viewers"), (snap) => {
    viewerQuestions = snap.val() || {};
    renderRound1QuestionList("viewers", viewerQuestions, viewerQuestionsList);
    refreshRound1Snapshot();
  });

  onValue(ref(db, "rooms/manche1/state"), (snap) => {
    liveState = snap.val() || {};
    updateRound1Status();
    renderRound1QuestionList("participants", participantQuestions, participantQuestionsList);
    renderRound1QuestionList("viewers", viewerQuestions, viewerQuestionsList);
    refreshRound1Snapshot();
  });

  onValue(ref(db, "rooms/manche1/guestSessions"), (snap) => {
    sessionsById = snap.val() || {};
    renderParticipants();
    renderRound2Participants();
    refreshRound1Snapshot();
  });

  onValue(ref(db, "rooms/manche1/accessCodes"), async (snapshot) => {
    const value = snapshot.val() || {};
    await cleanupExpiredCodes(value);
    renderCodes(value);
  });

  onValue(ref(db, "rooms/manche1/overlaySettings"), (snap) => {
    const settings = snap.val() || {};
    overlaySettings = {
      questionFontSizePx: Math.max(24, Math.min(180, Number(settings.questionFontSizePx || 72))),
    };
    overlayFontSizeInput.value = String(overlaySettings.questionFontSizePx);
  });

  onValue(ref(db, "rooms/manche2/questions"), (snap) => {
    manche2Questions = snap.val() || {};
    renderRound2Questions();
  });

  onValue(ref(db, "rooms/manche2/state"), (snap) => {
    manche2State = snap.val() || {};
    renderRound2Questions();
    updateRound2Status();
  });
}

function renderCodes(codesMap) {
  const entries = Object.values(codesMap || {})
    .filter((item) => Date.now() <= (item.expiresAt || 0))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  codesList.innerHTML = "";
  if (!entries.length) {
    codesList.innerHTML = "<li class='empty-state'>Aucun code actif.</li>";
    return;
  }

  for (const item of entries.slice(0, 20)) {
    const li = document.createElement("li");
    li.textContent = `${item.code} • expire ${new Date(item.expiresAt).toLocaleTimeString()}`;
    codesList.appendChild(li);
  }
}

function getRound1QuestionById(questionId) {
  if (!questionId) return null;
  return participantQuestions[questionId] || viewerQuestions[questionId] || null;
}

async function unlockBuzzer() {
  await update(ref(db, "rooms/manche1/state"), {
    buzzerLocked: false,
    lockedBySessionId: null,
    lockedByNickname: "",
    lockedAt: 0,
    updatedAt: Date.now(),
  });
}

async function clearBuzzData() {
  await Promise.all([
    remove(ref(db, "rooms/manche1/buzzes")),
    remove(ref(db, "rooms/manche1/questionBlocks")),
  ]);
}

async function updateParticipantScore(sessionId, delta) {
  const current = Math.max(0, Number(sessionsById[sessionId]?.score || 0));
  const score = Math.max(0, current + delta);
  await update(ref(db, `rooms/manche1/guestSessions/${sessionId}`), {
    score,
    updatedAt: Date.now(),
  });
}

function renderLeaderboardList(target, entries, emptyText, includeActions = false, actions = [1, -1]) {
  if (!target) return;
  target.innerHTML = "";

  if (!entries.length) {
    target.innerHTML = `<li class="empty-state">${emptyText}</li>`;
    return;
  }

  for (const p of entries) {
    const li = document.createElement("li");
    li.className = "leader-item";
    li.innerHTML = `
      <span class="leader-name">${p.nickname || "Anonyme"}</span>
      <span class="leader-score">${p.score} pt</span>
    `;

    if (includeActions && p.id) {
      const actionWrap = document.createElement("div");
      actionWrap.className = "score-actions";
      for (const delta of actions) {
        const button = document.createElement("button");
        button.className = delta < 0 ? "btn btn-danger mini-btn" : "btn btn-secondary mini-btn";
        button.textContent = `${delta > 0 ? "+" : ""}${delta}`;
        button.disabled = p.score <= 0 && delta < 0;
        button.addEventListener("click", () => updateParticipantScore(p.id, delta));
        actionWrap.appendChild(button);
      }
      li.appendChild(actionWrap);
    }

    target.appendChild(li);
  }
}

function renderParticipants() {
  const entries = Object.entries(sessionsById)
    .map(([id, s]) => ({ id, ...s, score: Number(s.score || 0) }))
    .sort((a, b) => b.score - a.score || (a.joinedAt || 0) - (b.joinedAt || 0));

  renderLeaderboardList(participantsList, entries, "Aucun participant.", true, [-1, 1]);
  renderLeaderboardList(m1ParticipantsList, entries, "Aucun participant.", true, [-1, 1]);
  renderLeaderboardList(quickLeaderboard, entries.slice(0, 5), "Le classement apparaîtra ici.");
  renderLeaderboardList(scoreboardPreview, entries.slice(0, 5), "Le classement apparaîtra ici.");
}

function renderRound2Participants() {
  const entries = Object.entries(sessionsById)
    .map(([id, s]) => ({ id, ...s, score: Number(s.score || 0) }))
    .sort((a, b) => b.score - a.score || (a.joinedAt || 0) - (b.joinedAt || 0));

  renderLeaderboardList(m2ParticipantsList, entries, "Aucun participant.", true, [1, 2, -1, -2]);
}

function renderRound1QuestionList(type, data, container) {
  const entries = Object.entries(data || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  container.innerHTML = "";

  if (!entries.length) {
    container.innerHTML = "<li class='empty-state'>Aucune question.</li>";
    return;
  }

  for (const [id, q] of entries) {
    const li = document.createElement("li");
    li.className = "question-item";
    const isActive = liveState?.currentQuestionId === id;
    li.innerHTML = `
      <div class="question-head">
        <strong>Q${q.order}</strong>
        ${isActive ? '<span class="question-active-chip">Active</span>' : ""}
      </div>
      <p class="question-text">${q.text}</p>
      <p class="muted">Réponse : ${q.answer}</p>
    `;

    const actions = document.createElement("div");
    actions.className = "row question-actions";

    const askBtn = document.createElement("button");
    askBtn.className = isActive ? "btn btn-secondary" : "btn btn-primary";
    askBtn.textContent = isActive ? "En direct" : "Lancer";
    askBtn.disabled = isActive;
    askBtn.addEventListener("click", async () => {
      await clearBuzzData();
      await update(ref(db, "rooms/manche1/state"), {
        currentType: type,
        currentQuestionId: id,
        showAnswer: false,
        buzzerLocked: false,
        lockedBySessionId: null,
        lockedByNickname: "",
        lockedAt: 0,
        updatedAt: Date.now(),
      });
      activateRoundSection("manche1", "live");
      showToast("Question lancée en live");
    });

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Modifier";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.addEventListener("click", async () => {
      await deleteRound1Question(type, id);
    });

    actions.append(askBtn, editBtn, deleteBtn);
    li.appendChild(actions);

    const editor = document.createElement("form");
    editor.className = "question-editor hidden stack";
    const textArea = document.createElement("textarea");
    textArea.rows = 2;
    textArea.required = true;
    textArea.value = q.text || "";

    const answerInput = document.createElement("input");
    answerInput.required = true;
    answerInput.value = q.answer || "";

    const editorActions = document.createElement("div");
    editorActions.className = "row";
    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn-primary";
    saveBtn.textContent = "Enregistrer";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Annuler";
    editorActions.append(saveBtn, cancelBtn);

    editor.append(textArea, answerInput, editorActions);
    editBtn.addEventListener("click", () => {
      editor.classList.toggle("hidden");
    });
    cancelBtn.addEventListener("click", () => editor.classList.add("hidden"));
    editor.addEventListener("submit", async (event) => {
      event.preventDefault();
      await update(ref(db, `rooms/manche1/questions/${type}/${id}`), {
        text: textArea.value.trim(),
        answer: answerInput.value.trim(),
        updatedAt: Date.now(),
        updatedBy: currentAdminId,
      });
      editor.classList.add("hidden");
      showToast("Question mise à jour");
    });

    li.appendChild(editor);
    container.appendChild(li);
  }
}

async function deleteRound1Question(type, questionId) {
  if (!window.confirm("Supprimer cette question ?")) return;
  const isActive = liveState?.currentQuestionId === questionId;
  await remove(ref(db, `rooms/manche1/questions/${type}/${questionId}`));

  if (isActive) {
    await update(ref(db, "rooms/manche1/state"), {
      currentType: "participants",
      currentQuestionId: null,
      showAnswer: false,
      buzzerLocked: false,
      lockedBySessionId: null,
      lockedByNickname: "",
      lockedAt: 0,
      updatedAt: Date.now(),
    });
    await clearBuzzData();
  }
  showToast("Question supprimée", "error");
}

function renderRound2Questions() {
  const entries = Object.entries(manche2Questions || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  m2QuestionsList.innerHTML = "";

  if (!entries.length) {
    m2QuestionsList.innerHTML = "<li class='empty-state'>Aucune question.</li>";
    return;
  }

  for (const [id, item] of entries) {
    const li = document.createElement("li");
    li.className = "question-item m2-item";
    const isActive = manche2State?.activeQuestionId === id;
    li.innerHTML = `
      <div class="question-head">
        <strong>Q${item.order || "?"}</strong>
        ${isActive ? '<span class="question-active-chip">Active</span>' : ""}
      </div>
      <img src="${item.imageDataUrl}" alt="Question manche 2" class="m2-thumb" />
      <p><strong>Œuvre :</strong> ${item.work}</p>
      <p><strong>Lieu exact :</strong> ${item.location}</p>
    `;

    const actions = document.createElement("div");
    actions.className = "row question-actions";

    const liveBtn = document.createElement("button");
    liveBtn.className = isActive ? "btn btn-secondary" : "btn btn-primary";
    liveBtn.textContent = isActive ? "Affichée" : "Afficher";
    liveBtn.disabled = isActive;
    liveBtn.addEventListener("click", async () => {
      await update(ref(db, "rooms/manche2/state"), {
        activeQuestionId: id,
        updatedAt: Date.now(),
        updatedBy: currentAdminId,
      });
      await setActiveRound("manche2");
      showToast("Question manche 2 affichée");
    });

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Modifier";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Supprimer";

    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm("Supprimer cette entrée ?")) return;
      await remove(ref(db, `rooms/manche2/questions/${id}`));
      if (manche2State?.activeQuestionId === id) {
        await update(ref(db, "rooms/manche2/state"), {
          activeQuestionId: null,
          updatedAt: Date.now(),
          updatedBy: currentAdminId,
        });
      }
      showToast("Question manche 2 supprimée", "error");
    });

    actions.append(liveBtn, editBtn, deleteBtn);
    li.appendChild(actions);

    const editor = document.createElement("form");
    editor.className = "question-editor hidden stack";

    const workInput = document.createElement("input");
    workInput.required = true;
    workInput.value = item.work || "";

    const locationInput = document.createElement("input");
    locationInput.required = true;
    locationInput.value = item.location || "";

    const imageInput = document.createElement("input");
    imageInput.type = "file";
    imageInput.accept = "image/*";

    const editorActions = document.createElement("div");
    editorActions.className = "row";
    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn-primary";
    saveBtn.textContent = "Enregistrer";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Annuler";
    editorActions.append(saveBtn, cancelBtn);

    editor.append(workInput, locationInput, imageInput, editorActions);
    editBtn.addEventListener("click", () => editor.classList.toggle("hidden"));
    cancelBtn.addEventListener("click", () => editor.classList.add("hidden"));

    editor.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        work: workInput.value.trim(),
        location: locationInput.value.trim(),
        updatedAt: Date.now(),
        updatedBy: currentAdminId,
      };
      const nextFile = imageInput.files?.[0];
      if (nextFile) {
        if (!nextFile.type.startsWith("image/")) {
          setMessage(m2LiveStatus, "Image invalide.", "error");
          return;
        }
        if (nextFile.size > MAX_IMAGE_SIZE) {
          setMessage(m2LiveStatus, "Image trop lourde (3 Mo max).", "error");
          return;
        }
        payload.imageDataUrl = await readFileAsDataURL(nextFile);
        payload.fileName = nextFile.name;
        payload.mimeType = nextFile.type;
      }
      await update(ref(db, `rooms/manche2/questions/${id}`), payload);
      setMessage(m2LiveStatus, "Question modifiée.", "success");
      editor.classList.add("hidden");
      showToast("Question manche 2 mise à jour");
    });

    li.appendChild(editor);
    m2QuestionsList.appendChild(li);
  }
}

function refreshRound1Snapshot() {
  const question = getRound1QuestionById(liveState?.currentQuestionId);
  currentQuestionStatus.textContent = question ? question.text : "Aucune";
  activeQuestion.textContent = question ? `Question active : ${question.text}` : "Aucune question active.";

  const buzzerOpen = Boolean(liveState?.currentQuestionId) && !liveState?.buzzerLocked && liveState?.currentType !== "viewers";
  buzzerStatus.textContent = liveState?.currentType === "viewers" ? "Désactivé (viewers)" : buzzerOpen ? "Ouvert" : "Verrouillé";
  lastBuzzStatus.textContent = liveState?.lockedByNickname || "—";
}

function updateRound1Status() {
  if (!liveState) return;

  const typeLabel = liveState.currentType === "viewers" ? "Question viewers" : "Question participants";
  const answerLabel = liveState.showAnswer ? "réponse visible" : "réponse cachée";
  const buzzerLabel = liveState.currentType === "viewers"
    ? "buzzer off"
    : liveState.buzzerLocked
      ? "buzzer verrouillé"
      : "buzzer ouvert";
  setMessage(roundStatus, `${typeLabel} • ${answerLabel} • ${buzzerLabel}`);

  toggleAnswerBtn.textContent = liveState.showAnswer ? "Masquer la réponse" : "Afficher la réponse";

  const hasQuestion = Boolean(liveState.currentQuestionId);
  toggleAnswerBtn.disabled = !hasQuestion;
  unlockBuzzerBtn.disabled = !hasQuestion || liveState.currentType === "viewers";
  markCorrectBtn.disabled = !liveState.lockedBySessionId;
  markWrongBtn.disabled = !liveState.lockedBySessionId || !hasQuestion;

  if (liveState.buzzerLocked && liveState.lockedByNickname) {
    buzzLive.textContent = `🔔 ${liveState.lockedByNickname}`;
  } else if (liveState.currentType === "viewers") {
    buzzLive.textContent = "Mode viewers";
  } else {
    buzzLive.textContent = "En attente";
  }
}

function updateRound2Status() {
  const active = manche2State?.activeQuestionId ? manche2Questions[manche2State.activeQuestionId] : null;
  if (!active) {
    setMessage(m2LiveStatus, "Aucune image active.");
    return;
  }
  setMessage(m2LiveStatus, `Image live : ${active.work}`);
}

async function cleanupExpiredCodes(codesMap) {
  if (codeCleanupLock) return;
  const now = Date.now();
  const toDelete = Object.values(codesMap || {})
    .filter((item) => now > (item.expiresAt || 0))
    .map((item) => item.code);
  if (!toDelete.length) return;

  codeCleanupLock = true;
  try {
    await Promise.all(toDelete.map((code) => remove(ref(db, `rooms/manche1/accessCodes/${code}`))));
  } finally {
    codeCleanupLock = false;
  }
}

async function saveOverlayFontSize(value) {
  const px = Number(value);
  if (!Number.isFinite(px)) return;
  const clamped = Math.max(24, Math.min(180, Math.round(px)));
  if (overlayFontSizeInput.value !== String(clamped)) {
    overlayFontSizeInput.value = String(clamped);
  }
  if (overlaySettings.questionFontSizePx === clamped) return;

  overlaySettings.questionFontSizePx = clamped;
  await update(ref(db, "rooms/manche1/overlaySettings"), {
    questionFontSizePx: clamped,
    updatedAt: Date.now(),
  });
}

async function restoreSession() {
  const savedAdminId = normalizeAdminId(localStorage.getItem(SESSION_KEY) || "");
  if (!savedAdminId) {
    showAuth();
    await setActiveRound("manche1");
    return;
  }

  if (!(await get(ref(db, `admins/${savedAdminId}`))).exists()) {
    clearSession();
    showAuth();
    await setActiveRound("manche1");
    return;
  }

  await loginSuccess(savedAdminId);
}

restoreSession().catch((error) => {
  clearSession();
  showAuth();
  setMessage(authMessage, `Erreur session : ${error.message}`, "error");
});
