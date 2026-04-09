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

const $ = (id) => document.getElementById(id);

const authSection = $("auth-section");
const dashboard = $("dashboard");
const authMessage = $("auth-message");
const adminEmail = $("admin-email");
const logoutBtn = $("logout");
const loginForm = $("login-form");
const signupForm = $("signup-form");
const showLoginBtn = $("show-login");
const showSignupBtn = $("show-signup");
const breadcrumb = $("breadcrumb");
const toast = $("toast");

const codesList = $("codes-list");
const codeDuration = $("code-duration");
const generatedCode = $("generated-code");

const participantQuestionForm = $("participant-question-form");
const viewerQuestionForm = $("viewer-question-form");
const participantQuestionsList = $("participant-questions-list");
const viewerQuestionsList = $("viewer-questions-list");

const toggleAnswerBtn = $("toggle-answer");
const unlockBuzzerBtn = $("unlock-buzzer");
const markCorrectBtn = $("mark-correct");
const markWrongBtn = $("mark-wrong");
const buzzPlusBtn = $("buzz-plus");
const buzzMinusBtn = $("buzz-minus");
const buzzPriorityName = $("buzz-priority-name");
const buzzOrderList = $("buzz-order-list");

const roundStatus = $("round-status");
const buzzLive = $("buzz-live");
const activeQuestion = $("active-question");
const participantsList = $("participants-list");
const m1ParticipantsList = $("m1-participants-list");
const quickLeaderboard = $("quick-leaderboard");
const scoreboardPreview = $("scoreboard-preview");
const overlayFontSizeInput = $("overlay-font-size");

const sessionStatus = $("session-status");
const activeRoundStatus = $("active-round-status");
const currentQuestionStatus = $("current-question-status");
const buzzerStatus = $("buzzer-status");
const lastBuzzStatus = $("last-buzz-status");

const m2QuestionForm = $("m2-question-form");
const m2ImageInput = $("m2-image");
const m2WorkInput = $("m2-work");
const m2LocationInput = $("m2-location");
const m2QuestionsList = $("m2-questions-list");
const m2ParticipantsList = $("m2-participants-list");
const m2LiveStatus = $("m2-live-status");

const m3ThemeForm = $("m3-theme-form");
const m3ThemeName = $("m3-theme-name");
const m3ThemeList = $("m3-theme-list");
const m3PlayerList = $("m3-player-list");
const m3ActivePlayer = $("m3-active-player");
const m3ActiveTheme = $("m3-active-theme");
const m3CurrentQuestion = $("m3-current-question");
const m3Timer = $("m3-timer");
const m3TimerStatus = $("m3-timer-status");
const m3StartBtn = $("m3-start");
const m3PauseBtn = $("m3-pause");
const m3ResumeBtn = $("m3-resume");
const m3ResetBtn = $("m3-reset");
const m3PassBtn = $("m3-pass");
const m3CorrectBtn = $("m3-correct");
const m3NextBtn = $("m3-next");

const workspaceLinks = Array.from(document.querySelectorAll(".nav-item"));
const workspacePanels = Array.from(document.querySelectorAll("[data-workspace-panel]"));
const quickNavBtns = Array.from(document.querySelectorAll(".quick-nav"));
const roundTabs = Array.from(document.querySelectorAll(".round-tab"));
const roundPanels = Array.from(document.querySelectorAll(".round-shell"));
const roundSectionTabs = Array.from(document.querySelectorAll(".subnav-tab"));
const roundSectionPanels = Array.from(document.querySelectorAll("[data-round-section-panel]"));

const SESSION_KEY = "zogquiz_admin_id";
const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const ROUND3_DURATION_MS = 90_000;

let currentAdminId = null;
let activeRound = "manche1";
let activeWorkspace = "dashboard";
const activeRoundSectionByRound = { manche1: "overview", manche2: "overview", manche3: "overview", manche4: "overview", manche5: "overview", finale: "overview" };

let liveState = null;
let overlaySettings = { questionFontSizePx: 72 };
let codeCleanupLock = false;
let sessionsById = {};
let participantQuestions = {};
let viewerQuestions = {};
let manche2Questions = {};
let manche2State = null;
let buzzesById = {};
let manche3Themes = {};
let manche3State = null;
let m3Ticker = null;

function normalizeAdminId(rawId) {
  return rawId.trim().toLowerCase();
}

function showToast(text, type = "success") {
  if (!toast) return;
  toast.textContent = text;
  toast.classList.remove("hidden", "error");
  if (type === "error") toast.classList.add("error");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 2000);
}

function setMessage(target, text, type = "default") {
  if (!target) return;
  target.textContent = text;
  target.classList.remove("success", "error", "loading");
  if (type !== "default") target.classList.add(type);
}

function isLoggedIn() { return Boolean(currentAdminId); }
function setSession(adminId) { currentAdminId = adminId; localStorage.setItem(SESSION_KEY, adminId); }
function clearSession() { currentAdminId = null; localStorage.removeItem(SESSION_KEY); }

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
  if (workspace === "dashboard") return "Vue live";
  if (workspace === "players") return "Joueurs";
  if (workspace === "broadcast") return "Overlays";
  return `Manches • ${formatRound(activeRound)}`;
}
function formatRound(round) { return round === "finale" ? "Finale" : round.replace("manche", "Manche "); }

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
    panel.classList.toggle("hidden", !(panelRound === round && panelSection === section));
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
    await update(ref(db, "quiz/state"), { activeRound: round, updatedAt: Date.now(), updatedBy: currentAdminId });
  }
}

workspaceLinks.forEach((btn) => btn.addEventListener("click", () => activateWorkspace(btn.dataset.workspace)));
quickNavBtns.forEach((btn) => btn.addEventListener("click", () => activateWorkspace(btn.dataset.workspaceTarget)));
roundTabs.forEach((btn) => btn.addEventListener("click", async () => setActiveRound(btn.dataset.round)));
roundSectionTabs.forEach((btn) => btn.addEventListener("click", () => activateRoundSection(btn.dataset.round, btn.dataset.roundSection)));

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
    const adminId = normalizeAdminId($("signup-id").value);
    const password = $("signup-password").value;
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
    const adminId = normalizeAdminId($("login-id").value);
    const password = $("login-password").value;
    const adminSnap = await get(ref(db, `admins/${adminId}`));
    if (!adminSnap.exists()) throw new Error("ID inconnu.");
    if ((await hashPassword(password)) !== (adminSnap.val() || {}).passwordHash) throw new Error("Mot de passe incorrect.");

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

$("generate-code").addEventListener("click", async () => {
  if (!isLoggedIn()) return;
  const code = makeTempCode(6);
  const minutes = Math.max(1, Number(codeDuration.value || 30));
  await set(ref(db, `rooms/manche1/accessCodes/${code}`), {
    code, active: true, createdBy: currentAdminId, createdAt: Date.now(), expiresAt: Date.now() + minutes * 60 * 1000,
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
  await update(ref(db, "rooms/manche1/state"), { showAnswer: !liveState.showAnswer, updatedAt: Date.now() });
  showToast("Réponse mise à jour");
});
unlockBuzzerBtn.addEventListener("click", async () => { await unlockBuzzer(); showToast("Buzzer réouvert"); });
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
  showToast("Tentative bloquée", "error");
});

buzzPlusBtn.addEventListener("click", async () => {
  if (!liveState?.lockedBySessionId) return;
  await updateParticipantScore(liveState.lockedBySessionId, 1);
  showToast("+1 point");
});
buzzMinusBtn.addEventListener("click", async () => {
  if (!liveState?.lockedBySessionId) return;
  await updateParticipantScore(liveState.lockedBySessionId, -1);
  showToast("-1 point");
});

overlayFontSizeInput.addEventListener("change", async () => saveOverlayFontSize(overlayFontSizeInput.value));
overlayFontSizeInput.addEventListener("blur", async () => saveOverlayFontSize(overlayFontSizeInput.value));

m3ThemeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = m3ThemeName.value.trim();
  if (!name) return;
  const themeRef = push(ref(db, "rooms/manche3/themes"));
  await set(themeRef, { name, questions: {}, createdAt: Date.now(), createdBy: currentAdminId });
  m3ThemeForm.reset();
  showToast("Thème ajouté");
});

m3StartBtn.addEventListener("click", async () => round3Start());
m3PauseBtn.addEventListener("click", async () => round3Pause());
m3ResumeBtn.addEventListener("click", async () => round3Resume());
m3ResetBtn.addEventListener("click", async () => round3Reset());
m3NextBtn.addEventListener("click", async () => round3Advance(false));
m3PassBtn.addEventListener("click", async () => round3Advance(false));
m3CorrectBtn.addEventListener("click", async () => round3Advance(true));

async function loginSuccess(adminId) {
  setSession(adminId);
  await ensureRoundsSeed(adminId);
  await setActiveRound("manche1");
  initListeners();
  showDashboard(adminId);
}

async function createRound1Question(type, questionInputId, answerInputId) {
  const questionInput = $(questionInputId);
  const answerInput = $(answerInputId);
  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();
  if (!question || !answer) return;

  const listSnap = await get(ref(db, `rooms/manche1/questions/${type}`));
  const order = Object.keys(listSnap.val() || {}).length + 1;

  const questionRef = push(ref(db, `rooms/manche1/questions/${type}`));
  await set(questionRef, { type, text: question, answer, order, createdAt: Date.now(), createdBy: currentAdminId });
  questionInput.value = "";
  answerInput.value = "";
  showToast("Question ajoutée");
}

async function createRound2Question() {
  const file = m2ImageInput.files?.[0];
  const work = m2WorkInput.value.trim();
  const location = m2LocationInput.value.trim();
  if (!file || !work || !location) return;
  if (!file.type.startsWith("image/")) return setMessage(m2LiveStatus, "Image invalide.", "error");
  if (file.size > MAX_IMAGE_SIZE) return setMessage(m2LiveStatus, "Image trop lourde (3 Mo max).", "error");

  setMessage(m2LiveStatus, "Upload...", "loading");
  const imageDataUrl = await readFileAsDataURL(file);
  const listSnap = await get(ref(db, "rooms/manche2/questions"));
  const order = Object.keys(listSnap.val() || {}).length + 1;
  const questionRef = push(ref(db, "rooms/manche2/questions"));
  await set(questionRef, { imageDataUrl, work, location, fileName: file.name, mimeType: file.type, order, createdAt: Date.now(), createdBy: currentAdminId });
  m2QuestionForm.reset();
  setMessage(m2LiveStatus, "Image ajoutée.", "success");
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
    renderBuzzOrder();
  });
  onValue(ref(db, "rooms/manche1/buzzes"), (snap) => {
    buzzesById = snap.val() || {};
    renderBuzzOrder();
  });

  onValue(ref(db, "rooms/manche1/guestSessions"), (snap) => {
    sessionsById = snap.val() || {};
    renderParticipants();
    renderRound2Participants();
    renderRound3Players();
    refreshRound1Snapshot();
    renderRound3State();
  });

  onValue(ref(db, "rooms/manche1/accessCodes"), async (snapshot) => {
    const value = snapshot.val() || {};
    await cleanupExpiredCodes(value);
    renderCodes(value);
  });

  onValue(ref(db, "rooms/manche1/overlaySettings"), (snap) => {
    const settings = snap.val() || {};
    overlaySettings = { questionFontSizePx: Math.max(24, Math.min(180, Number(settings.questionFontSizePx || 72))) };
    overlayFontSizeInput.value = String(overlaySettings.questionFontSizePx);
  });

  onValue(ref(db, "rooms/manche2/questions"), (snap) => { manche2Questions = snap.val() || {}; renderRound2Questions(); });
  onValue(ref(db, "rooms/manche2/state"), (snap) => { manche2State = snap.val() || {}; renderRound2Questions(); updateRound2Status(); });
  onValue(ref(db, "rooms/manche3/themes"), (snap) => { manche3Themes = snap.val() || {}; renderRound3Themes(); renderRound3State(); });
  onValue(ref(db, "rooms/manche3/state"), (snap) => {
    manche3State = snap.val() || null;
    renderRound3State();
    startRound3Ticker();
  });
}

function renderCodes(codesMap) {
  const entries = Object.values(codesMap || {}).filter((item) => Date.now() <= (item.expiresAt || 0)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  codesList.innerHTML = "";
  if (!entries.length) return (codesList.innerHTML = "<li class='empty-state'>Aucun code actif.</li>");
  entries.slice(0, 20).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.code} • expire ${new Date(item.expiresAt).toLocaleTimeString()}`;
    codesList.appendChild(li);
  });
}

function getRound1QuestionById(questionId) {
  if (!questionId) return null;
  return participantQuestions[questionId] || viewerQuestions[questionId] || null;
}

async function unlockBuzzer() {
  await update(ref(db, "rooms/manche1/state"), {
    buzzerLocked: false, lockedBySessionId: null, lockedByNickname: "", lockedAt: 0, updatedAt: Date.now(),
  });
}

async function clearBuzzData() {
  await Promise.all([remove(ref(db, "rooms/manche1/buzzes")), remove(ref(db, "rooms/manche1/questionBlocks"))]);
}

async function updateParticipantScore(sessionId, delta) {
  const current = Math.max(0, Number(sessionsById[sessionId]?.score || 0));
  const score = Math.max(0, current + delta);
  await update(ref(db, `rooms/manche1/guestSessions/${sessionId}`), { score, updatedAt: Date.now() });
}

function renderLeaderboardList(target, entries, emptyText, includeActions = false, actions = [1, -1]) {
  if (!target) return;
  target.innerHTML = "";
  if (!entries.length) return (target.innerHTML = `<li class="empty-state">${emptyText}</li>`);

  entries.forEach((p) => {
    const li = document.createElement("li");
    li.className = "leader-item";
    li.innerHTML = `<span class="leader-name">${p.nickname || "Anonyme"}</span><span class="leader-score">${p.score} pt</span>`;
    if (includeActions && p.id) {
      const actionWrap = document.createElement("div");
      actionWrap.className = "score-actions";
      actions.forEach((delta) => {
        const button = document.createElement("button");
        button.className = delta < 0 ? "btn btn-danger mini-btn" : "btn btn-secondary mini-btn";
        button.textContent = `${delta > 0 ? "+" : ""}${delta}`;
        button.addEventListener("click", () => updateParticipantScore(p.id, delta));
        actionWrap.appendChild(button);
      });
      li.appendChild(actionWrap);
    }
    target.appendChild(li);
  });
}

function sortedSessions() {
  return Object.entries(sessionsById).map(([id, s]) => ({ id, ...s, score: Number(s.score || 0) })).sort((a, b) => b.score - a.score || (a.joinedAt || 0) - (b.joinedAt || 0));
}

function renderParticipants() {
  const entries = sortedSessions();
  renderLeaderboardList(participantsList, entries, "Aucun participant.", true, [-1, 1]);
  renderLeaderboardList(m1ParticipantsList, entries, "Aucun participant.", true, [-1, 1]);
  renderLeaderboardList(quickLeaderboard, entries.slice(0, 5), "Le classement apparaîtra ici.");
  renderLeaderboardList(scoreboardPreview, entries.slice(0, 5), "Le classement apparaîtra ici.");
}

function renderRound2Participants() {
  const entries = sortedSessions();
  renderLeaderboardList(m2ParticipantsList, entries, "Aucun participant.", true, [1, 2, -1, -2]);
}

function renderRound1QuestionList(type, data, container) {
  const entries = Object.entries(data || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  container.innerHTML = "";
  if (!entries.length) return (container.innerHTML = "<li class='empty-state'>Aucune question.</li>");

  for (const [id, q] of entries) {
    const li = document.createElement("li");
    li.className = "question-item";
    const isActive = liveState?.currentQuestionId === id;
    li.innerHTML = `<div class="question-head"><strong>Q${q.order}</strong>${isActive ? '<span class="question-active-chip">Active</span>' : ""}</div><p>${q.text}</p><p class="muted">Réponse : ${q.answer}</p>`;

    const actions = document.createElement("div");
    actions.className = "row question-actions";

    const askBtn = document.createElement("button");
    askBtn.className = isActive ? "btn btn-secondary" : "btn btn-primary";
    askBtn.textContent = isActive ? "En direct" : "Lancer";
    askBtn.disabled = isActive;
    askBtn.addEventListener("click", async () => {
      await clearBuzzData();
      await update(ref(db, "rooms/manche1/state"), { currentType: type, currentQuestionId: id, showAnswer: false, buzzerLocked: false, lockedBySessionId: null, lockedByNickname: "", lockedAt: 0, updatedAt: Date.now() });
      activateRoundSection("manche1", "live");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.addEventListener("click", async () => deleteRound1Question(type, id));
    actions.append(askBtn, deleteBtn);
    li.appendChild(actions);
    container.appendChild(li);
  }
}

async function deleteRound1Question(type, questionId) {
  if (!window.confirm("Supprimer cette question ?")) return;
  const isActive = liveState?.currentQuestionId === questionId;
  await remove(ref(db, `rooms/manche1/questions/${type}/${questionId}`));
  if (isActive) {
    await update(ref(db, "rooms/manche1/state"), { currentType: "participants", currentQuestionId: null, showAnswer: false, buzzerLocked: false, lockedBySessionId: null, lockedByNickname: "", lockedAt: 0, updatedAt: Date.now() });
    await clearBuzzData();
  }
}

function renderBuzzOrder() {
  const qid = liveState?.currentQuestionId;
  const entries = Object.values(buzzesById || {}).filter((b) => !qid || b.questionId === qid).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  buzzOrderList.innerHTML = "";
  if (!entries.length) {
    buzzOrderList.innerHTML = "<li class='empty-state'>Aucun buzz sur cette question.</li>";
    return;
  }
  entries.slice(0, 8).forEach((b, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${b.nickname || "Anonyme"}`;
    buzzOrderList.appendChild(li);
  });
}

function renderRound2Questions() {
  const entries = Object.entries(manche2Questions || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  m2QuestionsList.innerHTML = "";
  if (!entries.length) return (m2QuestionsList.innerHTML = "<li class='empty-state'>Aucune image.</li>");

  for (const [id, item] of entries) {
    const li = document.createElement("li");
    const isActive = manche2State?.activeQuestionId === id;
    li.className = "question-item";
    li.innerHTML = `<div class="question-head"><strong>Q${item.order || "?"}</strong>${isActive ? '<span class="question-active-chip">Active</span>' : ""}</div><img src="${item.imageDataUrl}" alt="Question manche 2" class="m2-thumb" /><p><strong>Œuvre :</strong> ${item.work}</p><p><strong>Lieu :</strong> ${item.location}</p>`;
    const actions = document.createElement("div");
    actions.className = "row";

    const liveBtn = document.createElement("button");
    liveBtn.className = isActive ? "btn btn-secondary" : "btn btn-primary";
    liveBtn.textContent = isActive ? "Affichée" : "Afficher";
    liveBtn.disabled = isActive;
    liveBtn.addEventListener("click", async () => {
      await update(ref(db, "rooms/manche2/state"), { activeQuestionId: id, updatedAt: Date.now(), updatedBy: currentAdminId });
      await setActiveRound("manche2");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm("Supprimer cette image ?")) return;
      await remove(ref(db, `rooms/manche2/questions/${id}`));
      if (manche2State?.activeQuestionId === id) {
        await update(ref(db, "rooms/manche2/state"), { activeQuestionId: null, updatedAt: Date.now(), updatedBy: currentAdminId });
      }
    });

    actions.append(liveBtn, deleteBtn);
    li.appendChild(actions);
    m2QuestionsList.appendChild(li);
  }
}

function refreshRound1Snapshot() {
  const question = getRound1QuestionById(liveState?.currentQuestionId);
  currentQuestionStatus.textContent = question ? question.text : "Aucune";
  activeQuestion.textContent = question ? `Question active : ${question.text}` : "Aucune question active.";
  const buzzerOpen = Boolean(liveState?.currentQuestionId) && !liveState?.buzzerLocked && liveState?.currentType !== "viewers";
  buzzerStatus.textContent = liveState?.currentType === "viewers" ? "Désactivé" : buzzerOpen ? "Ouvert" : "Verrouillé";
  lastBuzzStatus.textContent = liveState?.lockedByNickname || "—";
}

function updateRound1Status() {
  if (!liveState) return;
  const typeLabel = liveState.currentType === "viewers" ? "Question viewers" : "Question participants";
  const answerLabel = liveState.showAnswer ? "réponse visible" : "réponse cachée";
  const buzzerLabel = liveState.currentType === "viewers" ? "buzzer off" : liveState.buzzerLocked ? "buzzer verrouillé" : "buzzer ouvert";
  setMessage(roundStatus, `${typeLabel} • ${answerLabel} • ${buzzerLabel}`);

  toggleAnswerBtn.textContent = liveState.showAnswer ? "Masquer la réponse" : "Afficher la réponse";
  const hasQuestion = Boolean(liveState.currentQuestionId);
  toggleAnswerBtn.disabled = !hasQuestion;
  unlockBuzzerBtn.disabled = !hasQuestion || liveState.currentType === "viewers";
  markCorrectBtn.disabled = !liveState.lockedBySessionId;
  markWrongBtn.disabled = !liveState.lockedBySessionId || !hasQuestion;
  buzzPlusBtn.disabled = !liveState.lockedBySessionId;
  buzzMinusBtn.disabled = !liveState.lockedBySessionId;

  if (liveState.buzzerLocked && liveState.lockedByNickname) {
    buzzLive.textContent = `🔔 ${liveState.lockedByNickname}`;
    buzzPriorityName.textContent = liveState.lockedByNickname;
  } else if (liveState.currentType === "viewers") {
    buzzLive.textContent = "Mode viewers";
    buzzPriorityName.textContent = "Mode viewers";
  } else {
    buzzLive.textContent = "En attente";
    buzzPriorityName.textContent = "Personne";
  }
}

function updateRound2Status() {
  const active = manche2State?.activeQuestionId ? manche2Questions[manche2State.activeQuestionId] : null;
  setMessage(m2LiveStatus, active ? `Image live : ${active.work}` : "Aucune image active.");
}

function formatTimer(ms) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(safe / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function round3RemainingMs() {
  if (!manche3State) return ROUND3_DURATION_MS;
  if (manche3State.timerStatus === "running") {
    return Math.max(0, Number(manche3State.timerEndsAt || 0) - Date.now());
  }
  return Math.max(0, Number(manche3State.timerRemainingMs ?? ROUND3_DURATION_MS));
}

function getRound3ActivePlayerName() {
  return sessionsById[manche3State?.activePlayerId]?.nickname || "Aucun";
}
function getRound3ActiveTheme() {
  return manche3Themes[manche3State?.activeThemeId] || null;
}

function renderRound3Players() {
  const entries = sortedSessions();
  m3PlayerList.innerHTML = "";
  if (!entries.length) {
    m3PlayerList.innerHTML = "<li class='empty-state'>Aucun joueur connecté.</li>";
    return;
  }
  entries.forEach((p) => {
    const li = document.createElement("li");
    li.className = "leader-item";
    const active = manche3State?.activePlayerId === p.id;
    li.innerHTML = `<span class="leader-name">${p.nickname}</span><span class="leader-score">${p.score} pt</span>`;
    const btn = document.createElement("button");
    btn.className = active ? "btn btn-secondary" : "btn btn-primary";
    btn.textContent = active ? "Joueur actif" : "Faire jouer";
    btn.setAttribute("aria-pressed", String(active));
    btn.addEventListener("click", async () => {
      await update(ref(db, "rooms/manche3/state"), {
        activePlayerId: p.id,
        activeThemeId: null,
        questionIndex: 0,
        timerStatus: "idle",
        timerRemainingMs: ROUND3_DURATION_MS,
        timerEndsAt: null,
        turnEnded: false,
        updatedAt: Date.now(),
        updatedBy: currentAdminId,
      });
      showToast(`${p.nickname} joue`);
    });
    li.appendChild(btn);
    m3PlayerList.appendChild(li);
  });
}

function renderRound3Themes() {
  const entries = Object.entries(manche3Themes || {}).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  m3ThemeList.innerHTML = "";
  if (!entries.length) {
    m3ThemeList.innerHTML = "<li class='empty-state'>Ajoutez un thème.</li>";
    return;
  }

  for (const [themeId, theme] of entries) {
    const li = document.createElement("li");
    li.className = "question-item";
    const questionEntries = Object.entries(theme.questions || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
    const questions = questionEntries.map((entry) => entry[1]);
    const isActive = manche3State?.activeThemeId === themeId;
    li.innerHTML = `<div class="question-head"><strong>${theme.name}</strong>${isActive ? '<span class="question-active-chip">Actif</span>' : ''}</div><p class="muted">${questions.length} question(s)</p>`;

    const addForm = document.createElement("form");
    addForm.className = "row";
    const qInput = document.createElement("input");
    qInput.placeholder = "Nouvelle question";
    qInput.required = true;
    qInput.setAttribute("aria-label", `Ajouter une question au thème ${theme.name}`);
    const addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.className = "btn btn-secondary";
    addBtn.textContent = "Ajouter question";
    addForm.append(qInput, addBtn);
    addForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = qInput.value.trim();
      if (!text) return;
      const qRef = push(ref(db, `rooms/manche3/themes/${themeId}/questions`));
      await set(qRef, { text, order: questions.length + 1, createdAt: Date.now(), createdBy: currentAdminId });
      qInput.value = "";
    });

    const qList = document.createElement("ul");
    qList.className = "list compact-list";
    if (!questions.length) {
      qList.innerHTML = "<li class='muted'>Aucune question.</li>";
    } else {
      questionEntries.forEach(([questionId, q], idx) => {
        const item = document.createElement("li");
        item.className = "row";
        const label = document.createElement("span");
        label.textContent = `${idx + 1}. ${q.text}`;
        const del = document.createElement("button");
        del.className = "btn btn-danger mini-btn";
        del.textContent = "Suppr.";
        del.addEventListener("click", async () => remove(ref(db, `rooms/manche3/themes/${themeId}/questions/${questionId}`)));
        item.append(label, del);
        qList.appendChild(item);
      });
    }

    const actions = document.createElement("div");
    actions.className = "row";
    const renameBtn = document.createElement("button");
    renameBtn.className = "btn btn-secondary";
    renameBtn.textContent = "Renommer";
    renameBtn.addEventListener("click", async () => {
      const nextName = window.prompt("Nouveau nom du thème", theme.name || "");
      if (!nextName) return;
      await update(ref(db, `rooms/manche3/themes/${themeId}`), { name: nextName.trim(), updatedAt: Date.now(), updatedBy: currentAdminId });
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Supprimer thème";
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm("Supprimer ce thème ?")) return;
      await remove(ref(db, `rooms/manche3/themes/${themeId}`));
      if (manche3State?.activeThemeId === themeId) {
        await update(ref(db, "rooms/manche3/state"), { activeThemeId: null, questionIndex: 0, updatedAt: Date.now(), updatedBy: currentAdminId });
      }
    });
    actions.append(renameBtn, deleteBtn);

    li.append(addForm, qList, actions);
    m3ThemeList.appendChild(li);
  }
}

function renderRound3State() {
  const activeTheme = getRound3ActiveTheme();
  const questions = Object.values(activeTheme?.questions || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const index = Number(manche3State?.questionIndex || 0);
  const current = questions[index] || null;
  const remaining = round3RemainingMs();
  const status = manche3State?.timerStatus || "idle";

  m3ActivePlayer.textContent = getRound3ActivePlayerName();
  m3ActiveTheme.textContent = activeTheme?.name || "Aucun";
  m3CurrentQuestion.textContent = current?.text || (activeTheme ? "Fin de la liste." : "En attente du choix du thème");
  m3Timer.textContent = formatTimer(remaining);

  if (remaining <= 0 || status === "ended") {
    setMessage(m3TimerStatus, "Temps écoulé", "error");
  } else if (status === "running") {
    setMessage(m3TimerStatus, "Chrono en cours", "success");
  } else if (status === "paused") {
    setMessage(m3TimerStatus, "Chrono en pause");
  } else {
    setMessage(m3TimerStatus, "Prêt");
  }

  const canPlay = Boolean(manche3State?.activePlayerId && manche3State?.activeThemeId && remaining > 0 && status !== "ended");
  m3CorrectBtn.disabled = !canPlay;
  m3PassBtn.disabled = !canPlay;
  m3NextBtn.disabled = !canPlay;
  m3StartBtn.disabled = status === "running" || !manche3State?.activePlayerId || !manche3State?.activeThemeId;
  m3PauseBtn.disabled = status !== "running";
  m3ResumeBtn.disabled = status !== "paused" || remaining <= 0;
}

async function round3Start() {
  if (!manche3State?.activePlayerId || !manche3State?.activeThemeId) return;
  const remaining = round3RemainingMs();
  if (remaining <= 0) return;
  await update(ref(db, "rooms/manche3/state"), { timerStatus: "running", timerEndsAt: Date.now() + remaining, turnEnded: false, updatedAt: Date.now(), updatedBy: currentAdminId });
}
async function round3Pause() {
  if (manche3State?.timerStatus !== "running") return;
  const remaining = round3RemainingMs();
  await update(ref(db, "rooms/manche3/state"), { timerStatus: "paused", timerEndsAt: null, timerRemainingMs: remaining, updatedAt: Date.now(), updatedBy: currentAdminId });
}
async function round3Resume() { await round3Start(); }
async function round3Reset() {
  await update(ref(db, "rooms/manche3/state"), {
    timerStatus: "idle", timerEndsAt: null, timerRemainingMs: ROUND3_DURATION_MS, turnEnded: false,
    questionIndex: 0, updatedAt: Date.now(), updatedBy: currentAdminId,
  });
}

async function round3Advance(isCorrect) {
  const remaining = round3RemainingMs();
  if (remaining <= 0 || manche3State?.timerStatus === "ended") return;
  if (isCorrect && manche3State?.activePlayerId) await updateParticipantScore(manche3State.activePlayerId, 1);
  await update(ref(db, "rooms/manche3/state"), { questionIndex: Number(manche3State?.questionIndex || 0) + 1, updatedAt: Date.now(), updatedBy: currentAdminId });
}

function startRound3Ticker() {
  if (m3Ticker) window.clearInterval(m3Ticker);
  m3Ticker = window.setInterval(async () => {
    renderRound3State();
    if (!manche3State) return;
    if (manche3State.timerStatus === "running" && round3RemainingMs() <= 0) {
      await update(ref(db, "rooms/manche3/state"), { timerStatus: "ended", timerEndsAt: null, timerRemainingMs: 0, turnEnded: true, updatedAt: Date.now(), updatedBy: currentAdminId || "system" });
    }
  }, 250);
}

async function cleanupExpiredCodes(codesMap) {
  if (codeCleanupLock) return;
  const now = Date.now();
  const toDelete = Object.values(codesMap || {}).filter((item) => now > (item.expiresAt || 0)).map((item) => item.code);
  if (!toDelete.length) return;
  codeCleanupLock = true;
  try { await Promise.all(toDelete.map((code) => remove(ref(db, `rooms/manche1/accessCodes/${code}`)))); }
  finally { codeCleanupLock = false; }
}

async function saveOverlayFontSize(value) {
  const px = Number(value);
  if (!Number.isFinite(px)) return;
  const clamped = Math.max(24, Math.min(180, Math.round(px)));
  overlayFontSizeInput.value = String(clamped);
  if (overlaySettings.questionFontSizePx === clamped) return;
  overlaySettings.questionFontSizePx = clamped;
  await update(ref(db, "rooms/manche1/overlaySettings"), { questionFontSizePx: clamped, updatedAt: Date.now() });
}

async function restoreSession() {
  const savedAdminId = normalizeAdminId(localStorage.getItem(SESSION_KEY) || "");
  if (!savedAdminId) { showAuth(); await setActiveRound("manche1"); return; }
  if (!(await get(ref(db, `admins/${savedAdminId}`))).exists()) { clearSession(); showAuth(); await setActiveRound("manche1"); return; }
  await loginSuccess(savedAdminId);
}

restoreSession().catch((error) => {
  clearSession();
  showAuth();
  setMessage(authMessage, `Erreur session : ${error.message}`, "error");
});
