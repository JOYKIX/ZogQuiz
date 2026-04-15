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
} from "./firebase.js";
import { createBuzzSoundTrigger } from "./audio.js";
import { initManche4Admin } from "./manche4.js";
import {
  GUEST_ACCOUNTS_PATH,
  GUEST_LOGIN_INDEX_PATH,
  createGuestAccount,
  removeGuestAccount,
  setGuestAccountPassword,
} from "./guest-accounts.js";

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

const guestAccountForm = $("guest-account-form");
const guestLoginIdInput = $("guest-login-id");
const guestPasswordInput = $("guest-password");
const guestAccountsList = $("guest-accounts-list");
const guestAccountsMessage = $("guest-accounts-message");

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
const overlayRound1FontSizeInput = $("overlay-round1-font-size");
const overlayRound1ColorInput = $("overlay-round1-text-color");

const sessionStatus = $("session-status");
const activeRoundStatus = $("active-round-status");
const editingRoundStatus = $("editing-round-status");
const liveRoundStatus = $("live-round-status");
const currentQuestionStatus = $("current-question-status");
const buzzerStatus = $("buzzer-status");
const lastBuzzStatus = $("last-buzz-status");
const pushLiveRoundBtn = $("push-live-round");
const resetParticipantsBtn = $("reset-participants");
const resetAllBtn = $("reset-all");

const m2QuestionForm = $("m2-question-form");
const m2ImageInput = $("m2-image");
const m2WorkInput = $("m2-work");
const m2LocationInput = $("m2-location");
const m2QuestionTextInput = $("m2-question-text");
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
const overlayRound3FontSizeInput = $("overlay-round3-font-size");
const overlayRound3ColorInput = $("overlay-round3-text-color");

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
let editingRound = "manche1";
let broadcastRound = "manche1";
let activeWorkspace = "dashboard";
const activeRoundSectionByRound = { manche1: "overview", manche2: "overview", manche3: "overview", manche4: "overview", manche5: "overview", finale: "overview" };

let liveState = null;
let round1OverlaySettings = { questionFontSizePx: 72, questionColor: "#ffffff" };
let round3OverlaySettings = { questionFontSizePx: 72, questionColor: "#ffffff" };
let sessionsById = {};
let participantQuestions = {};
let viewerQuestions = {};
let manche2Questions = {};
let manche2State = null;
let buzzesById = {};
let guestAccountsById = {};
let manche3Themes = {};
let manche3State = null;
let m3Ticker = null;

const triggerBuzzSound = createBuzzSoundTrigger();

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
  return `Manches • ${formatRound(editingRound)}`;
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

function updateRoundIndicators() {
  activeRoundStatus.textContent = formatRound(editingRound);
  if (editingRoundStatus) editingRoundStatus.textContent = formatRound(editingRound);
  if (liveRoundStatus) liveRoundStatus.textContent = formatRound(broadcastRound);
}

async function setEditingRound(round) {
  editingRound = round;
  updateRoundIndicators();
  roundTabs.forEach((btn) => {
    const isActive = btn.dataset.round === round;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
  roundPanels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.roundPanel !== round));
  activateRoundSection(round, activeRoundSectionByRound[round] || "overview");
  if (activeWorkspace === "rounds") breadcrumb.textContent = workspaceLabel("rounds");
}

workspaceLinks.forEach((btn) => btn.addEventListener("click", () => activateWorkspace(btn.dataset.workspace)));
quickNavBtns.forEach((btn) => btn.addEventListener("click", () => activateWorkspace(btn.dataset.workspaceTarget)));
roundTabs.forEach((btn) => btn.addEventListener("click", async () => setEditingRound(btn.dataset.round)));
roundSectionTabs.forEach((btn) => btn.addEventListener("click", () => activateRoundSection(btn.dataset.round, btn.dataset.roundSection)));
pushLiveRoundBtn?.addEventListener("click", async () => {
  if (!isLoggedIn()) return;
  await update(ref(db, "quiz/state"), { liveRound: editingRound, updatedAt: Date.now(), updatedBy: currentAdminId });
  showToast(`${formatRound(editingRound)} envoyée en direct`);
});
resetParticipantsBtn?.addEventListener("click", async () => {
  if (!isLoggedIn()) return;
  if (!window.confirm("Réinitialiser les participants et le classement ?")) return;
  await resetParticipantsAndLeaderboard();
  showToast("Participants réinitialisés");
});
resetAllBtn?.addEventListener("click", async () => {
  if (!isLoggedIn()) return;
  if (!window.confirm("Confirmer le reset complet du quiz ?")) return;
  await resetCompleteQuiz();
  showToast("Quiz réinitialisé");
});

activateWorkspace("dashboard");
activateRoundSection("manche1", "overview");

initManche4Admin({
  getCurrentAdminId: () => currentAdminId,
  setMessage,
  showToast,
  activateRoundSection,
});

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

guestAccountForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isLoggedIn()) return;
  try {
    setMessage(guestAccountsMessage, "Création...", "loading");
    await createGuestAccount({
      loginId: guestLoginIdInput.value,
      password: guestPasswordInput.value,
      createdBy: currentAdminId,
    });
    guestAccountForm.reset();
    setMessage(guestAccountsMessage, "Compte invité créé.", "success");
    showToast("Compte invité créé");
  } catch (error) {
    setMessage(guestAccountsMessage, error.message, "error");
  }
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

overlayRound1FontSizeInput.addEventListener("change", async () => saveRound1OverlaySettings());
overlayRound1FontSizeInput.addEventListener("blur", async () => saveRound1OverlaySettings());
overlayRound1ColorInput.addEventListener("input", async () => saveRound1OverlaySettings());
overlayRound3FontSizeInput.addEventListener("change", async () => saveRound3OverlaySettings());
overlayRound3FontSizeInput.addEventListener("blur", async () => saveRound3OverlaySettings());
overlayRound3ColorInput.addEventListener("input", async () => saveRound3OverlaySettings());

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
  await setEditingRound("manche1");
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
  const questionText = m2QuestionTextInput.value.trim();
  if (!file || !work || !location) return;
  if (!file.type.startsWith("image/")) return setMessage(m2LiveStatus, "Image invalide.", "error");
  if (file.size > MAX_IMAGE_SIZE) return setMessage(m2LiveStatus, "Image trop lourde (3 Mo max).", "error");

  setMessage(m2LiveStatus, "Upload...", "loading");
  const imageDataUrl = await readFileAsDataURL(file);
  const listSnap = await get(ref(db, "rooms/manche2/questions"));
  const order = Object.keys(listSnap.val() || {}).length + 1;
  const questionRef = push(ref(db, "rooms/manche2/questions"));
  await set(questionRef, { imageDataUrl, work, location, questionText, fileName: file.name, mimeType: file.type, order, createdAt: Date.now(), createdBy: currentAdminId });
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
  onValue(ref(db, "quiz/state"), (snap) => {
    const state = snap.val() || {};
    broadcastRound = state.liveRound || state.activeRound || "manche1";
    updateRoundIndicators();
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
    triggerBuzzSound(liveState);
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

  onValue(ref(db, GUEST_ACCOUNTS_PATH), (snapshot) => {
    guestAccountsById = snapshot.val() || {};
    renderGuestAccounts();
  });

  onValue(ref(db, "rooms/manche1/overlaySettings"), (snap) => {
    round1OverlaySettings = normalizeOverlaySettings(snap.val() || {}, 72);
    overlayRound1FontSizeInput.value = String(round1OverlaySettings.questionFontSizePx);
    overlayRound1ColorInput.value = round1OverlaySettings.questionColor;
  });

  onValue(ref(db, "rooms/manche3/overlaySettings"), (snap) => {
    round3OverlaySettings = normalizeOverlaySettings(snap.val() || {}, 72);
    overlayRound3FontSizeInput.value = String(round3OverlaySettings.questionFontSizePx);
    overlayRound3ColorInput.value = round3OverlaySettings.questionColor;
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

function renderGuestAccounts() {
  if (!guestAccountsList) return;
  const entries = Object.entries(guestAccountsById || {}).map(([id, account]) => ({
    id,
    ...account,
    createdAt: Number(account?.createdAt || 0),
  })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  guestAccountsList.innerHTML = "";
  if (!entries.length) {
    guestAccountsList.innerHTML = "<li class='empty-state'>Aucun compte invité.</li>";
    return;
  }

  for (const account of entries) {
    const li = document.createElement("li");
    li.className = "question-item";
    const status = account.active ? "Actif" : "Désactivé";
    const displayName = String(account.displayName || "").trim() || "Non défini";
    const createdAtLabel = account.createdAt ? new Date(account.createdAt).toLocaleString() : "—";
    li.innerHTML = `
      <div class="question-head"><strong>${account.loginId || account.id}</strong><span class="question-active-chip">${status}</span></div>
      <p><strong>Pseudo :</strong> ${displayName}</p>
      <p class="muted">Créé le : ${createdAtLabel}</p>
    `;

    const actions = document.createElement("div");
    actions.className = "row";

    const resetPasswordBtn = document.createElement("button");
    resetPasswordBtn.className = "btn btn-secondary";
    resetPasswordBtn.textContent = "Réinitialiser mdp";
    resetPasswordBtn.addEventListener("click", async () => resetGuestPassword(account.id));

    const toggleBtn = document.createElement("button");
    toggleBtn.className = account.active ? "btn btn-danger" : "btn btn-primary";
    toggleBtn.textContent = account.active ? "Désactiver" : "Activer";
    toggleBtn.addEventListener("click", async () => toggleGuestAccountStatus(account.id, !account.active));

    const resetDisplayNameBtn = document.createElement("button");
    resetDisplayNameBtn.className = "btn btn-secondary";
    resetDisplayNameBtn.textContent = "Reset pseudo";
    resetDisplayNameBtn.addEventListener("click", async () => resetGuestDisplayName(account.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.addEventListener("click", async () => deleteGuestAccountById(account.id));

    actions.append(resetPasswordBtn, resetDisplayNameBtn, toggleBtn, deleteBtn);
    li.appendChild(actions);
    guestAccountsList.appendChild(li);
  }
}

async function resetGuestPassword(accountId) {
  const nextPassword = window.prompt("Nouveau mot de passe (6 caractères min)");
  if (nextPassword === null) return;
  try {
    await setGuestAccountPassword(accountId, nextPassword, currentAdminId);
    showToast("Mot de passe mis à jour");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function toggleGuestAccountStatus(accountId, active) {
  await update(ref(db, `${GUEST_ACCOUNTS_PATH}/${accountId}`), {
    active,
    updatedAt: Date.now(),
    updatedBy: currentAdminId,
  });
  if (!active) {
    await remove(ref(db, `rooms/manche1/guestSessions/${accountId}`));
  }
  showToast(active ? "Compte activé" : "Compte désactivé");
}

async function resetGuestDisplayName(accountId) {
  await update(ref(db, `${GUEST_ACCOUNTS_PATH}/${accountId}`), {
    displayName: "",
    updatedAt: Date.now(),
    updatedBy: currentAdminId,
  });
  await update(ref(db, `rooms/manche1/guestSessions/${accountId}`), { nickname: "" });
  showToast("Pseudo réinitialisé");
}

async function deleteGuestAccountById(accountId) {
  const account = guestAccountsById[accountId];
  if (!account) return;
  if (!window.confirm(`Supprimer le compte ${account.loginId || accountId} ?`)) return;
  await removeGuestAccount({ ...account, accountId });
  await remove(ref(db, `rooms/manche1/guestSessions/${accountId}`));
  if (manche3State?.activePlayerId === accountId) {
    await update(ref(db, "rooms/manche3/state"), {
      activePlayerId: null,
      activeThemeId: null,
      questionIndex: 0,
      timerStatus: "idle",
      timerRemainingMs: ROUND3_DURATION_MS,
      timerEndsAt: null,
      turnEnded: false,
      updatedAt: Date.now(),
      updatedBy: currentAdminId,
    });
  }
  showToast("Compte supprimé");
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

async function resetParticipantsAndLeaderboard() {
  await Promise.all([
    remove(ref(db, "rooms/manche1/guestSessions")),
    remove(ref(db, "rooms/manche1/buzzes")),
    remove(ref(db, "rooms/manche1/questionBlocks")),
    update(ref(db, "rooms/manche1/state"), {
      buzzerLocked: false,
      lockedBySessionId: null,
      lockedByNickname: "",
      lockedAt: 0,
      updatedAt: Date.now(),
    }),
    update(ref(db, "rooms/manche3/state"), {
      activePlayerId: null,
      activeThemeId: null,
      questionIndex: 0,
      timerStatus: "idle",
      timerRemainingMs: ROUND3_DURATION_MS,
      timerEndsAt: null,
      turnEnded: false,
      updatedAt: Date.now(),
      updatedBy: currentAdminId,
    }),
    update(ref(db, "rooms/manche4/state"), {
      playerProgress: {},
      allowedPlayers: [],
      active: false,
      finished: false,
      currentClue: "",
      cluePhase: 1,
      updatedAt: Date.now(),
      updatedBy: currentAdminId,
    }),
  ]);
}

async function resetCompleteQuiz() {
  const targetRound = "manche1";
  await Promise.all([
    remove(ref(db, "rooms/manche1/questions")),
    remove(ref(db, "rooms/manche1/guestSessions")),
    remove(ref(db, "rooms/manche1/buzzes")),
    remove(ref(db, "rooms/manche1/questionBlocks")),
    remove(ref(db, GUEST_ACCOUNTS_PATH)),
    remove(ref(db, GUEST_LOGIN_INDEX_PATH)),
    remove(ref(db, "rooms/manche2/questions")),
    remove(ref(db, "rooms/manche3/themes")),
    remove(ref(db, "rooms/manche4/grids")),
    update(ref(db, "rooms/manche1/state"), {
      currentType: "participants",
      currentQuestionId: null,
      showAnswer: false,
      buzzerLocked: false,
      lockedBySessionId: null,
      lockedByNickname: "",
      lockedAt: 0,
      updatedAt: Date.now(),
    }),
    update(ref(db, "rooms/manche2/state"), {
      activeQuestionId: null,
      updatedAt: Date.now(),
      updatedBy: currentAdminId,
    }),
    update(ref(db, "rooms/manche3/state"), {
      activePlayerId: null,
      activeThemeId: null,
      questionIndex: 0,
      timerStatus: "idle",
      timerRemainingMs: ROUND3_DURATION_MS,
      timerEndsAt: null,
      turnEnded: false,
      updatedAt: Date.now(),
      updatedBy: currentAdminId,
    }),
    set(ref(db, "rooms/manche4/state"), {
      active: false,
      currentGridId: null,
      cluePhase: 1,
      currentClue: "",
      allowedPlayers: [],
      grids: [],
      playerProgress: {},
      finished: false,
      updatedAt: Date.now(),
      updatedBy: currentAdminId,
    }),
    update(ref(db, "quiz/state"), {
      activeRound: targetRound,
      liveRound: targetRound,
      updatedAt: Date.now(),
      updatedBy: currentAdminId,
    }),
  ]);
  await setEditingRound(targetRound);
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

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Éditer";
    editBtn.addEventListener("click", async () => editRound1Question(type, id, q));

    actions.append(askBtn, editBtn, deleteBtn);
    li.appendChild(actions);
    container.appendChild(li);
  }
}

async function editRound1Question(type, questionId, currentQuestion) {
  const text = window.prompt("Modifier le texte de la question", currentQuestion?.text || "");
  if (text === null) return;
  const answer = window.prompt("Modifier la réponse", currentQuestion?.answer || "");
  if (answer === null) return;
  const nextText = text.trim();
  const nextAnswer = answer.trim();
  if (!nextText || !nextAnswer) return showToast("Question et réponse obligatoires.", "error");
  await update(ref(db, `rooms/manche1/questions/${type}/${questionId}`), {
    text: nextText,
    answer: nextAnswer,
    updatedAt: Date.now(),
    updatedBy: currentAdminId,
  });
  showToast("Question mise à jour");
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
    li.innerHTML = `<div class="question-head"><strong>Q${item.order || "?"}</strong>${isActive ? '<span class="question-active-chip">Active</span>' : ""}</div><img src="${item.imageDataUrl}" alt="Question manche 2" class="m2-thumb" /><p><strong>Œuvre :</strong> ${item.work}</p><p><strong>Lieu :</strong> ${item.location}</p><p><strong>Question :</strong> ${item.questionText || "—"}</p>`;
    const actions = document.createElement("div");
    actions.className = "row";

    const liveBtn = document.createElement("button");
    liveBtn.className = isActive ? "btn btn-secondary" : "btn btn-primary";
    liveBtn.textContent = isActive ? "Affichée" : "Afficher";
    liveBtn.disabled = isActive;
    liveBtn.addEventListener("click", async () => {
      await update(ref(db, "rooms/manche2/state"), { activeQuestionId: id, updatedAt: Date.now(), updatedBy: currentAdminId });
      await setEditingRound("manche2");
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

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Éditer";
    editBtn.addEventListener("click", async () => editRound2Question(id, item));

    actions.append(liveBtn, editBtn, deleteBtn);
    li.appendChild(actions);
    m2QuestionsList.appendChild(li);
  }
}

async function editRound2Question(questionId, item) {
  const work = window.prompt("Modifier l'œuvre", item.work || "");
  if (work === null) return;
  const location = window.prompt("Modifier le lieu", item.location || "");
  if (location === null) return;
  const questionText = window.prompt("Modifier le texte de la question (optionnel)", item.questionText || "");
  if (questionText === null) return;
  const nextWork = work.trim();
  const nextLocation = location.trim();
  if (!nextWork || !nextLocation) return showToast("Œuvre et lieu obligatoires.", "error");
  await update(ref(db, `rooms/manche2/questions/${questionId}`), {
    work: nextWork,
    location: nextLocation,
    questionText: questionText.trim(),
    updatedAt: Date.now(),
    updatedBy: currentAdminId,
  });
  showToast("Question manche 2 mise à jour");
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
        const edit = document.createElement("button");
        edit.className = "btn btn-secondary mini-btn";
        edit.textContent = "Éditer";
        edit.addEventListener("click", async () => editRound3Question(themeId, questionId, q));
        const del = document.createElement("button");
        del.className = "btn btn-danger mini-btn";
        del.textContent = "Suppr.";
        del.addEventListener("click", async () => remove(ref(db, `rooms/manche3/themes/${themeId}/questions/${questionId}`)));
        item.append(label, edit, del);
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

async function editRound3Question(themeId, questionId, currentQuestion) {
  const text = window.prompt("Modifier la question", currentQuestion?.text || "");
  if (text === null) return;
  const nextText = text.trim();
  if (!nextText) return showToast("Le texte de la question est obligatoire.", "error");
  await update(ref(db, `rooms/manche3/themes/${themeId}/questions/${questionId}`), {
    text: nextText,
    updatedAt: Date.now(),
    updatedBy: currentAdminId,
  });
  showToast("Question manche 3 mise à jour");
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

function clampOverlayFontSize(value, fallback = 72) {
  const px = Number(value);
  if (!Number.isFinite(px)) return fallback;
  return Math.max(24, Math.min(180, Math.round(px)));
}

function sanitizeOverlayColor(value, fallback = "#ffffff") {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function normalizeOverlaySettings(settings, fallbackFontSize = 72) {
  return {
    questionFontSizePx: clampOverlayFontSize(settings.questionFontSizePx, fallbackFontSize),
    questionColor: sanitizeOverlayColor(settings.questionColor, "#ffffff"),
  };
}

async function saveRound1OverlaySettings() {
  const nextSettings = normalizeOverlaySettings({
    questionFontSizePx: overlayRound1FontSizeInput.value,
    questionColor: overlayRound1ColorInput.value,
  }, round1OverlaySettings.questionFontSizePx || 72);
  overlayRound1FontSizeInput.value = String(nextSettings.questionFontSizePx);
  overlayRound1ColorInput.value = nextSettings.questionColor;
  if (
    round1OverlaySettings.questionFontSizePx === nextSettings.questionFontSizePx
    && round1OverlaySettings.questionColor === nextSettings.questionColor
  ) return;
  round1OverlaySettings = nextSettings;
  await update(ref(db, "rooms/manche1/overlaySettings"), { ...nextSettings, updatedAt: Date.now() });
}

async function saveRound3OverlaySettings() {
  const nextSettings = normalizeOverlaySettings({
    questionFontSizePx: overlayRound3FontSizeInput.value,
    questionColor: overlayRound3ColorInput.value,
  }, round3OverlaySettings.questionFontSizePx || 72);
  overlayRound3FontSizeInput.value = String(nextSettings.questionFontSizePx);
  overlayRound3ColorInput.value = nextSettings.questionColor;
  if (
    round3OverlaySettings.questionFontSizePx === nextSettings.questionFontSizePx
    && round3OverlaySettings.questionColor === nextSettings.questionColor
  ) return;
  round3OverlaySettings = nextSettings;
  await update(ref(db, "rooms/manche3/overlaySettings"), { ...nextSettings, updatedAt: Date.now() });
}

async function restoreSession() {
  const savedAdminId = normalizeAdminId(localStorage.getItem(SESSION_KEY) || "");
  if (!savedAdminId) { showAuth(); await setEditingRound("manche1"); return; }
  if (!(await get(ref(db, `admins/${savedAdminId}`))).exists()) { clearSession(); showAuth(); await setEditingRound("manche1"); return; }
  await loginSuccess(savedAdminId);
}

restoreSession().catch((error) => {
  clearSession();
  showAuth();
  setMessage(authMessage, `Erreur session : ${error.message}`, "error");
});
