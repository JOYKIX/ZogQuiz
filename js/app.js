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
const quickLeaderboard = document.getElementById("quick-leaderboard");
const scoreboardPreview = document.getElementById("scoreboard-preview");

const sessionStatus = document.getElementById("session-status");
const currentQuestionStatus = document.getElementById("current-question-status");
const buzzerStatus = document.getElementById("buzzer-status");
const lastBuzzStatus = document.getElementById("last-buzz-status");

const sideLinks = Array.from(document.querySelectorAll(".side-link"));
const sectionPanels = Array.from(document.querySelectorAll("[data-section-panel]"));
const roundTabs = Array.from(document.querySelectorAll(".round-tab"));
const roundPanels = Array.from(document.querySelectorAll(".round-panel"));
const menuButtons = Array.from(document.querySelectorAll(".submenu-btn"));
const menuPanels = Array.from(document.querySelectorAll(".submenu-panel"));

const SESSION_KEY = "zogquiz_admin_id";
let currentAdminId = null;
let liveState = null;
let sessionsById = {};
let participantQuestions = {};
let viewerQuestions = {};
let codeCleanupLock = false;

function normalizeAdminId(rawId) {
  return rawId.trim().toLowerCase();
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

function activateSection(section) {
  sideLinks.forEach((btn) => {
    const active = btn.dataset.section === section;
    btn.classList.toggle("active", active);
  });
  sectionPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.sectionPanel !== section);
  });
}

function activateRound(round) {
  roundTabs.forEach((btn) => {
    const active = btn.dataset.round === round;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  roundPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.roundPanel !== round);
  });
}

function activateMenu(menu) {
  menuButtons.forEach((btn) => {
    const active = btn.dataset.menu === menu;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  menuPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.menuPanel !== menu);
  });
}

for (const btn of sideLinks) {
  btn.addEventListener("click", () => activateSection(btn.dataset.section));
}
for (const btn of roundTabs) {
  btn.addEventListener("click", () => activateRound(btn.dataset.round));
}
for (const btn of menuButtons) {
  btn.addEventListener("click", () => activateMenu(btn.dataset.menu));
}

activateSection("overview");
activateRound("manche1");
activateMenu("creation");

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
    setMessage(authMessage, "Création du compte...", "loading");
    const adminId = normalizeAdminId(document.getElementById("signup-id").value);
    const password = document.getElementById("signup-password").value;
    if (!adminId || !password) throw new Error("ID et mot de passe obligatoires.");

    const adminRef = ref(db, `admins/${adminId}`);
    if ((await get(adminRef)).exists()) throw new Error("Cet ID existe déjà.");

    await set(adminRef, { adminId, passwordHash: await hashPassword(password), createdAt: Date.now() });
    await loginSuccess(adminId, "Compte créé.");
    setMessage(authMessage, "Compte créé.", "success");
  } catch (error) {
    setMessage(authMessage, `Impossible de créer le compte : ${error.message}`, "error");
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

    await loginSuccess(adminId, "Connecté.");
    setMessage(authMessage, "Connexion réussie.", "success");
  } catch (error) {
    setMessage(authMessage, `Connexion impossible : ${error.message}`, "error");
  }
});

async function loginSuccess(adminId) {
  setSession(adminId);
  await ensureRoundsSeed(adminId);
  initRoundLiveListeners();
  listenCodes();
  showDashboard(adminId);
}

logoutBtn.addEventListener("click", () => {
  clearSession();
  showAuth();
  setMessage(authMessage, "Déconnecté.", "default");
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
});

participantQuestionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createQuestion("participants", "participant-question", "participant-answer");
});

viewerQuestionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createQuestion("viewers", "viewer-question", "viewer-answer");
});

async function createQuestion(type, questionInputId, answerInputId) {
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
}

toggleAnswerBtn.addEventListener("click", async () => {
  if (!liveState?.currentQuestionId) return;
  const next = !liveState.showAnswer;
  await update(ref(db, "rooms/manche1/state"), { showAnswer: next, updatedAt: Date.now() });
});

unlockBuzzerBtn.addEventListener("click", async () => {
  await unlockBuzzer();
});

markCorrectBtn.addEventListener("click", async () => {
  if (!liveState?.lockedBySessionId) return;
  const sessionId = liveState.lockedBySessionId;
  const score = Number(sessionsById[sessionId]?.score || 0) + 1;
  await update(ref(db, `rooms/manche1/guestSessions/${sessionId}`), { score, lastWinAt: Date.now() });
  await unlockBuzzer();
});

markWrongBtn.addEventListener("click", async () => {
  if (!liveState?.lockedBySessionId || !liveState?.currentQuestionId) return;
  const sessionId = liveState.lockedBySessionId;
  const questionId = liveState.currentQuestionId;
  await set(ref(db, `rooms/manche1/questionBlocks/${questionId}/${sessionId}`), true);
  await unlockBuzzer();
});

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
  await Promise.all([remove(ref(db, "rooms/manche1/buzzes")), remove(ref(db, "rooms/manche1/questionBlocks"))]);
}

function getQuestionById(questionId) {
  if (!questionId) return null;
  return participantQuestions[questionId] || viewerQuestions[questionId] || null;
}

function renderQuestionList(type, data, container) {
  const entries = Object.entries(data || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  container.innerHTML = "";
  if (!entries.length) {
    container.innerHTML = "<li>Aucune question pour le moment.</li>";
    return;
  }

  for (const [id, q] of entries) {
    const li = document.createElement("li");
    li.className = "question-item";
    const active = liveState?.currentQuestionId === id;
    li.innerHTML = `<strong>Q${q.order}</strong> ${q.text}<br/><span class="muted">Réponse: ${q.answer}</span>`;

    const actions = document.createElement("div");
    actions.className = "row";
    const askBtn = document.createElement("button");
    askBtn.className = active ? "secondary" : "";
    askBtn.textContent = active ? "Question active" : "Lancer cette question";
    askBtn.disabled = active;
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
      activateSection("live");
    });
    actions.appendChild(askBtn);
    li.appendChild(actions);
    container.appendChild(li);
  }
}

function initRoundLiveListeners() {
  onValue(ref(db, "rooms/manche1/questions/participants"), (snap) => {
    participantQuestions = snap.val() || {};
    renderQuestionList("participants", participantQuestions, participantQuestionsList);
    refreshLiveSnapshot();
  });

  onValue(ref(db, "rooms/manche1/questions/viewers"), (snap) => {
    viewerQuestions = snap.val() || {};
    renderQuestionList("viewers", viewerQuestions, viewerQuestionsList);
    refreshLiveSnapshot();
  });

  onValue(ref(db, "rooms/manche1/state"), (snap) => {
    liveState = snap.val() || {};
    updateRoundStatus();
    renderQuestionList("participants", participantQuestions, participantQuestionsList);
    renderQuestionList("viewers", viewerQuestions, viewerQuestionsList);
    refreshLiveSnapshot();
  });

  onValue(ref(db, "rooms/manche1/guestSessions"), (snap) => {
    sessionsById = snap.val() || {};
    renderParticipants();
    refreshLiveSnapshot();
  });
}

async function giveManualPoint(sessionId) {
  const score = Number(sessionsById[sessionId]?.score || 0) + 1;
  await update(ref(db, `rooms/manche1/guestSessions/${sessionId}`), { score, lastManualPointAt: Date.now() });
}

function renderLeaderboardList(target, entries, emptyText) {
  if (!target) return;
  target.innerHTML = "";

  if (!entries.length) {
    target.innerHTML = `<li>${emptyText}</li>`;
    return;
  }

  for (const p of entries) {
    const li = document.createElement("li");
    li.className = "leader-item";
    const button = document.createElement("button");
    button.textContent = `${p.nickname || "Anonyme"} — ${p.score} pt`;
    button.disabled = !p.id;
    if (p.id) button.addEventListener("click", () => giveManualPoint(p.id));
    li.appendChild(button);
    target.appendChild(li);
  }
}

function renderParticipants() {
  const entries = Object.entries(sessionsById)
    .map(([id, s]) => ({ id, ...s, score: Number(s.score || 0) }))
    .sort((a, b) => b.score - a.score || (a.joinedAt || 0) - (b.joinedAt || 0));

  renderLeaderboardList(participantsList, entries, "Aucun participant pour le moment.");
  renderLeaderboardList(quickLeaderboard, entries.slice(0, 5), "Le classement apparaîtra ici.");
  renderLeaderboardList(scoreboardPreview, entries.slice(0, 5), "Le classement apparaîtra ici.");
}

function refreshLiveSnapshot() {
  const question = getQuestionById(liveState?.currentQuestionId);
  currentQuestionStatus.textContent = question ? question.text : "Aucune";
  activeQuestion.textContent = question
    ? `Question active : ${question.text}`
    : "Aucune question active.";

  const buzzerOpen = Boolean(liveState?.currentQuestionId) && !liveState?.buzzerLocked && liveState?.currentType !== "viewers";
  buzzerStatus.textContent = liveState?.currentType === "viewers" ? "Désactivé (viewers)" : buzzerOpen ? "Ouvert" : "Verrouillé";

  if (liveState?.lockedByNickname) {
    lastBuzzStatus.textContent = liveState.lockedByNickname;
  } else {
    lastBuzzStatus.textContent = "—";
  }
}

function updateRoundStatus() {
  if (!liveState) return;
  const typeLabel = liveState.currentType === "viewers" ? "Question viewers" : "Question participants";
  const showAnswer = liveState.showAnswer ? "Réponse visible" : "Réponse cachée";
  const buzzerState = liveState.currentType === "viewers"
    ? "buzzer désactivé"
    : liveState.buzzerLocked
      ? "buzzer verrouillé"
      : "buzzer ouvert";

  setMessage(roundStatus, `${typeLabel} • ${showAnswer} • ${buzzerState}`);
  toggleAnswerBtn.textContent = liveState.showAnswer ? "Masquer la réponse" : "Afficher la réponse";

  const hasActiveQuestion = Boolean(liveState.currentQuestionId);
  toggleAnswerBtn.disabled = !hasActiveQuestion;
  unlockBuzzerBtn.disabled = !hasActiveQuestion || liveState.currentType === "viewers";
  markCorrectBtn.disabled = !liveState.lockedBySessionId;
  markWrongBtn.disabled = !liveState.lockedBySessionId || !liveState.currentQuestionId;

  if (liveState.buzzerLocked && liveState.lockedByNickname) {
    buzzLive.textContent = `🔔 ${liveState.lockedByNickname} a buzzé.`;
  } else if (liveState.currentType === "viewers") {
    buzzLive.textContent = "Mode viewers : buzzer désactivé.";
  } else {
    buzzLive.textContent = "En attente d'un buzz.";
  }
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

function listenCodes() {
  onValue(ref(db, "rooms/manche1/accessCodes"), async (snapshot) => {
    const value = snapshot.val() || {};
    await cleanupExpiredCodes(value);

    const entries = Object.values(value)
      .filter((item) => Date.now() <= (item.expiresAt || 0))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    codesList.innerHTML = "";
    if (!entries.length) {
      codesList.innerHTML = "<li>Aucun code actif.</li>";
      return;
    }

    for (const item of entries.slice(0, 20)) {
      const li = document.createElement("li");
      li.textContent = `${item.code} • expire ${new Date(item.expiresAt).toLocaleTimeString()}`;
      codesList.appendChild(li);
    }
  });
}

async function restoreSession() {
  const savedAdminId = normalizeAdminId(localStorage.getItem(SESSION_KEY) || "");
  if (!savedAdminId) return showAuth();

  if (!(await get(ref(db, `admins/${savedAdminId}`))).exists()) {
    clearSession();
    return showAuth();
  }

  await loginSuccess(savedAdminId);
}

restoreSession().catch((error) => {
  clearSession();
  showAuth();
  setMessage(authMessage, `Erreur session : ${error.message}`, "error");
});
