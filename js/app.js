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
import { OVERLAY_CONFIGS_PATH, OVERLAY_DEFAULTS, normalizeOverlayConfig } from "./overlay-config.js";
import { initManche4Admin } from "./manche4.js";
import { initManche5Admin } from "./manche5.js";
import { initViewerAdmin } from "./viewer-admin.js";
import { parseAcceptedAnswers, normalizeViewerAnswer } from "./viewer-utils.js";
import { showConfirm, showPrompt } from "./modal.js";
import {
  GUEST_ACCOUNTS_PATH,
  GUEST_LOGIN_INDEX_PATH,
  createGuestAccount,
  normalizeBuzzerSoundFile,
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
const guestBuzzerSoundInput = $("guest-buzzer-sound");
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
const m1LiveScores = $("m1-live-scores");
const quickLeaderboard = $("quick-leaderboard");
const scoreboardPreview = $("scoreboard-preview");
const overlayRound1MaxFontSizeInput = $("overlay-round1-max-font-size");
const overlayRound1MinFontSizeInput = $("overlay-round1-min-font-size");
const overlayRound1ColorInput = $("overlay-round1-text-color");
const overlayRound1FontWeightInput = $("overlay-round1-font-weight");
const overlayRound1ShadowInput = $("overlay-round1-text-shadow");
const overlayRound1AlignInput = $("overlay-round1-align");
const overlayRound1VerticalAlignInput = $("overlay-round1-vertical-align");
const overlayRound1PaddingInput = $("overlay-round1-safe-padding");
const overlayRound1MaxWidthInput = $("overlay-round1-max-width");

const overlayRound2MaxWidthInput = $("overlay-round2-max-width");
const overlayRound2MaxHeightInput = $("overlay-round2-max-height");
const overlayRound2RadiusInput = $("overlay-round2-radius");

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
const m2OverviewStatus = $("m2-overview-status");
const m2LiveScores = $("m2-live-scores");
const m2LiveCurrentImage = $("m2-live-current-image");
const m2LiveCurrentTitle = $("m2-live-current-title");
const m2LiveCurrentLocation = $("m2-live-current-location");
const m2LiveCurrentQuestion = $("m2-live-current-question");
const m2LivePrevBtn = $("m2-live-prev");
const m2LiveNextBtn = $("m2-live-next");

const m3ThemeForm = $("m3-theme-form");
const m3ThemeName = $("m3-theme-name");
const m3ThemeList = $("m3-theme-list");
const m3PlayerList = $("m3-player-list");
const m3ActivePlayer = $("m3-active-player");
const m3ActiveTheme = $("m3-active-theme");
const m3CurrentQuestion = $("m3-current-question");
const m3Timer = $("m3-timer");
const m3TimerStatus = $("m3-timer-status");
const m3LivePlayer = $("m3-live-player");
const m3LiveTheme = $("m3-live-theme");
const m3LiveQuestion = $("m3-live-question");
const m3LiveTimer = $("m3-live-timer");
const m3LiveScores = $("m3-live-scores");
const m3StartBtn = $("m3-start");
const m3PauseBtn = $("m3-pause");
const m3ResumeBtn = $("m3-resume");
const m3ResetBtn = $("m3-reset");
const m3PassBtn = $("m3-pass");
const m3CorrectBtn = $("m3-correct");
const m3NextBtn = $("m3-next");
const overlayRound3QuestionSizeInput = $("overlay-round3-question-size");
const overlayRound3ThemeSizeInput = $("overlay-round3-theme-size");
const overlayRound3TimerSizeInput = $("overlay-round3-timer-size");
const overlayRound3QuestionColorInput = $("overlay-round3-question-color");
const overlayRound3ThemeColorInput = $("overlay-round3-theme-color");
const overlayRound3TimerColorInput = $("overlay-round3-timer-color");
const overlayRound3FontWeightInput = $("overlay-round3-font-weight");
const overlayRound3AlignInput = $("overlay-round3-align");
const overlayRound3GapInput = $("overlay-round3-gap");
const overlayRound3MaxWidthInput = $("overlay-round3-max-width");

const overlayRound4ClueSizeInput = $("overlay-round4-clue-size");
const overlayRound4ClueColorInput = $("overlay-round4-clue-color");
const overlayRound4WordSizeInput = $("overlay-round4-word-size");
const overlayRound4CellRadiusInput = $("overlay-round4-cell-radius");
const overlayRound4MarkerSizeInput = $("overlay-round4-marker-size");
const overlayRound4MarkerOpacityInput = $("overlay-round4-marker-opacity");
const overlayRound4GridMaxWidthInput = $("overlay-round4-grid-max-width");
const overlayRound4GridGapInput = $("overlay-round4-grid-gap");
const m4LiveScores = $("m4-live-scores");

const overlayRound5PrimarySizeInput = $("overlay-round5-primary-size");
const overlayRound5SecondarySizeInput = $("overlay-round5-secondary-size");
const overlayRound5PrimaryColorInput = $("overlay-round5-primary-color");
const overlayRound5SecondaryColorInput = $("overlay-round5-secondary-color");
const overlayRound5PlayingColorInput = $("overlay-round5-playing-color");
const overlayRound5PausedColorInput = $("overlay-round5-paused-color");
const overlayRound5StoppedColorInput = $("overlay-round5-stopped-color");
const overlayRound5ProgressHeightInput = $("overlay-round5-progress-height");
const overlayRound5CornerRadiusInput = $("overlay-round5-corner-radius");
const overlayRound5MaxWidthInput = $("overlay-round5-max-width");
const overlayRound5DecorationOpacityInput = $("overlay-round5-decoration-opacity");
const overlayRound5ProgressMaxInput = $("overlay-round5-progress-max");
const m5LiveScores = $("m5-live-scores");

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
const activeRoundSectionByRound = { manche1: "live", manche2: "live", manche3: "live", manche4: "live", manche5: "live", finale: "overview" };

let liveState = null;
let overlayConfigs = {
  round1: { ...OVERLAY_DEFAULTS.round1 },
  round2: { ...OVERLAY_DEFAULTS.round2 },
  round3: { ...OVERLAY_DEFAULTS.round3 },
  round4: { ...OVERLAY_DEFAULTS.round4 },
  round5: { ...OVERLAY_DEFAULTS.round5 },
};
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

const triggerBuzzSound = createBuzzSoundTrigger({
  resolveBuzzerFile: (state) => sessionsById[state?.lockedBySessionId]?.buzzerSound || "buzzer.mp3",
});

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
  if (workspace === "dashboard") return "Live";
  if (workspace === "players") return "Joueurs";
  if (workspace === "broadcast") return "Diffusion";
  return `Rondes • ${formatRound(editingRound)}`;
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
  if (!(await showConfirm("Réinitialiser les participants et le classement ?", { title: "Reset participants" }))) return;
  await resetParticipantsAndLeaderboard();
  showToast("Participants réinitialisés");
});
resetAllBtn?.addEventListener("click", async () => {
  if (!isLoggedIn()) return;
  if (!(await showConfirm("Confirmer le reset complet du quiz ?", { title: "Reset complet" }))) return;
  await resetCompleteQuiz();
  showToast("Quiz réinitialisé");
});

activateWorkspace("dashboard");
activateRoundSection("manche1", "live");

initManche4Admin({
  getCurrentAdminId: () => currentAdminId,
  setMessage,
  showToast,
  activateRoundSection,
});
initManche5Admin({
  getCurrentAdminId: () => currentAdminId,
  setMessage,
  showToast,
});
initViewerAdmin({
  getCurrentAdminId: () => currentAdminId,
  setMessage,
  showToast,
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
      buzzerSound: guestBuzzerSoundInput?.value || "",
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

[
  overlayRound1MaxFontSizeInput, overlayRound1MinFontSizeInput, overlayRound1ColorInput, overlayRound1FontWeightInput,
  overlayRound1ShadowInput, overlayRound1AlignInput, overlayRound1VerticalAlignInput, overlayRound1PaddingInput, overlayRound1MaxWidthInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round1")));
[
  overlayRound2MaxWidthInput, overlayRound2MaxHeightInput, overlayRound2RadiusInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round2")));
[
  overlayRound3QuestionSizeInput, overlayRound3ThemeSizeInput, overlayRound3TimerSizeInput,
  overlayRound3QuestionColorInput, overlayRound3ThemeColorInput, overlayRound3TimerColorInput,
  overlayRound3FontWeightInput, overlayRound3AlignInput, overlayRound3GapInput, overlayRound3MaxWidthInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round3")));
[
  overlayRound4ClueSizeInput, overlayRound4ClueColorInput, overlayRound4WordSizeInput,
  overlayRound4CellRadiusInput, overlayRound4MarkerSizeInput, overlayRound4MarkerOpacityInput,
  overlayRound4GridMaxWidthInput, overlayRound4GridGapInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round4")));
[
  overlayRound5PrimarySizeInput, overlayRound5SecondarySizeInput, overlayRound5PrimaryColorInput,
  overlayRound5SecondaryColorInput, overlayRound5PlayingColorInput, overlayRound5PausedColorInput,
  overlayRound5StoppedColorInput, overlayRound5ProgressHeightInput, overlayRound5CornerRadiusInput,
  overlayRound5MaxWidthInput, overlayRound5DecorationOpacityInput, overlayRound5ProgressMaxInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round5")));

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
m2LivePrevBtn?.addEventListener("click", async () => moveRound2Image(-1));
m2LiveNextBtn?.addEventListener("click", async () => moveRound2Image(1));

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
  const rawAnswer = answerInput.value.trim();
  if (!question || !rawAnswer) return;

  const listSnap = await get(ref(db, `rooms/manche1/questions/${type}`));
  const order = Object.keys(listSnap.val() || {}).length + 1;

  const payload = { type, text: question, answer: rawAnswer, order, createdAt: Date.now(), createdBy: currentAdminId };
  if (type === "viewers") {
    const acceptedAnswers = parseAcceptedAnswers(rawAnswer);
    payload.acceptedAnswers = acceptedAnswers;
    payload.normalizedAnswers = acceptedAnswers.map((value) => normalizeViewerAnswer(value)).filter(Boolean);
    payload.answer = acceptedAnswers[0] || rawAnswer;
    payload.points = Math.max(1, Number($("viewer-points")?.value || 1));
    payload.timerSeconds = Math.max(0, Number($("viewer-timer")?.value || 0));
    payload.settings = {
      firstCorrectOnly: Boolean($("viewer-first-correct-only")?.checked),
      allowMultipleWinners: Boolean($("viewer-allow-multi")?.checked),
      caseSensitive: false,
    };
  }

  const questionRef = push(ref(db, `rooms/manche1/questions/${type}`));
  await set(questionRef, payload);
  questionInput.value = "";
  answerInput.value = "";
  if (type === "viewers") {
    if ($("viewer-points")) $("viewer-points").value = "1";
    if ($("viewer-timer")) $("viewer-timer").value = "30";
    if ($("viewer-first-correct-only")) $("viewer-first-correct-only").checked = true;
    if ($("viewer-allow-multi")) $("viewer-allow-multi").checked = false;
  }
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

  onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/round1`), (snap) => {
    overlayConfigs.round1 = normalizeOverlayConfig("round1", snap.val() || OVERLAY_DEFAULTS.round1);
    syncOverlayInputs();
  });
  onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/round2`), (snap) => {
    overlayConfigs.round2 = normalizeOverlayConfig("round2", snap.val() || OVERLAY_DEFAULTS.round2);
    syncOverlayInputs();
  });
  onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/round3`), (snap) => {
    overlayConfigs.round3 = normalizeOverlayConfig("round3", snap.val() || OVERLAY_DEFAULTS.round3);
    syncOverlayInputs();
  });
  onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/round4`), (snap) => {
    overlayConfigs.round4 = normalizeOverlayConfig("round4", snap.val() || OVERLAY_DEFAULTS.round4);
    syncOverlayInputs();
  });
  onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/round5`), (snap) => {
    overlayConfigs.round5 = normalizeOverlayConfig("round5", snap.val() || OVERLAY_DEFAULTS.round5);
    syncOverlayInputs();
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
    const buzzerSound = String(account.buzzerSound || "").trim() || "buzzer.mp3 (défaut)";
    const createdAtLabel = account.createdAt ? new Date(account.createdAt).toLocaleString() : "—";
    li.innerHTML = `
      <div class="question-head"><strong>${account.loginId || account.id}</strong><span class="question-active-chip">${status}</span></div>
      <p><strong>Pseudo :</strong> ${displayName}</p>
      <p><strong>Buzzer :</strong> ${buzzerSound}</p>
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
  const nextPassword = await showPrompt("Nouveau mot de passe (6 caractères min)", {
    title: "Réinitialiser le mot de passe",
    inputLabel: "Nouveau mot de passe",
    placeholder: "6 caractères minimum",
    confirmText: "Mettre à jour",
  });
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
  if (!(await showConfirm(`Supprimer le compte ${account.loginId || accountId} ?`, { title: "Suppression du compte" }))) return;
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
    update(ref(db, "blindtestLive"), {
      active: false,
      playbackState: "stopped",
      trackIndex: 0,
      trackId: null,
      pausedAtSeconds: 0,
      startedAt: null,
      syncVersion: Date.now(),
      updatedAt: Date.now(),
      updatedBy: currentAdminId,
    }),
    set(ref(db, "rooms/viewers/liveState"), { active: false, status: "idle", updatedAt: Date.now(), updatedBy: currentAdminId }),
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
    remove(ref(db, "rooms/viewers/questions")),
    remove(ref(db, "rooms/viewers/attempts")),
    remove(ref(db, "rooms/viewers/winners")),
    remove(ref(db, "rooms/viewers/chatFeed")),
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
    set(ref(db, "blindtestLive"), {
      active: false,
      trackIndex: 0,
      trackId: null,
      playbackState: "stopped",
      pausedAtSeconds: 0,
      startedAt: null,
      syncVersion: Date.now(),
      lastError: "",
      updatedAt: Date.now(),
      updatedBy: currentAdminId,
    }),
    set(ref(db, "rooms/viewers/liveState"), { active: false, status: "idle", updatedAt: Date.now(), updatedBy: currentAdminId }),
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

async function updateParticipantBuzzer(sessionId, rawValue) {
  if (!sessionId) return;
  let normalized = "";
  try {
    normalized = normalizeBuzzerSoundFile(rawValue);
  } catch (_error) {
    showToast("Nom de fichier invalide (ex: buzzer1.mp3).", "error");
    return;
  }
  const updatedAt = Date.now();
  await Promise.all([
    update(ref(db, `rooms/manche1/guestSessions/${sessionId}`), {
      buzzerSound: normalized,
      updatedAt,
    }),
    update(ref(db, `${GUEST_ACCOUNTS_PATH}/${sessionId}`), {
      buzzerSound: normalized,
      updatedAt,
      updatedBy: currentAdminId || "admin",
    }),
  ]);
  showToast(normalized ? "Buzzer personnalisé enregistré." : "Buzzer par défaut réactivé.");
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

function renderParticipantsAdminList(target, entries, emptyText) {
  if (!target) return;
  target.innerHTML = "";
  if (!entries.length) return (target.innerHTML = `<li class="empty-state">${emptyText}</li>`);

  entries.forEach((p) => {
    const li = document.createElement("li");
    li.className = "leader-item has-buzzer";
    li.innerHTML = `<span class="leader-name">${p.nickname || "Anonyme"}</span><span class="leader-score">${p.score} pt</span>`;

    if (p.id) {
      const actionWrap = document.createElement("div");
      actionWrap.className = "score-actions";
      [-1, 1].forEach((delta) => {
        const button = document.createElement("button");
        button.className = delta < 0 ? "btn btn-danger mini-btn" : "btn btn-secondary mini-btn";
        button.textContent = `${delta > 0 ? "+" : ""}${delta}`;
        button.addEventListener("click", () => updateParticipantScore(p.id, delta));
        actionWrap.appendChild(button);
      });

      const buzzerWrap = document.createElement("div");
      buzzerWrap.className = "participant-buzzer";

      const buzzerInput = document.createElement("input");
      buzzerInput.type = "text";
      buzzerInput.placeholder = "buzzer1.mp3";
      buzzerInput.value = p.buzzerSound || "";
      buzzerInput.setAttribute("list", "buzzer-presets");

      const saveBtn = document.createElement("button");
      saveBtn.className = "btn btn-secondary mini-btn";
      saveBtn.textContent = "Son";
      saveBtn.title = "Enregistrer le buzzer";
      saveBtn.addEventListener("click", () => updateParticipantBuzzer(p.id, buzzerInput.value));
      buzzerInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        updateParticipantBuzzer(p.id, buzzerInput.value);
      });

      buzzerWrap.append(buzzerInput, saveBtn);
      li.append(actionWrap, buzzerWrap);
    }

    target.appendChild(li);
  });
}

function sortedSessions() {
  return Object.entries(sessionsById).map(([id, s]) => ({ id, ...s, score: Number(s.score || 0) })).sort((a, b) => b.score - a.score || (a.joinedAt || 0) - (b.joinedAt || 0));
}

function renderParticipants() {
  const entries = sortedSessions();
  renderParticipantsAdminList(participantsList, entries, "Aucun participant.");
  renderLeaderboardList(m1ParticipantsList, entries, "Aucun participant.", true, [-1, 1]);
  renderLeaderboardList(m1LiveScores, entries, "Aucun participant.", true, [1, 2, 3, -1]);
  renderLeaderboardList(quickLeaderboard, entries.slice(0, 5), "Le classement apparaîtra ici.");
  renderLeaderboardList(scoreboardPreview, entries.slice(0, 5), "Le classement apparaîtra ici.");
}

function renderRound2Participants() {
  const entries = sortedSessions();
  renderLeaderboardList(m2ParticipantsList, entries, "Aucun participant.", true, [1, 2, -1, -2]);
  renderLeaderboardList(m2LiveScores, entries, "Aucun participant.", true, [1, 2, 3, -1]);
  renderLeaderboardList(m3LiveScores, entries, "Aucun participant.", true, [1, 2, -1]);
  renderLeaderboardList(m4LiveScores, entries, "Aucun participant.", true, [1, 2, 3, -1]);
  renderLeaderboardList(m5LiveScores, entries, "Aucun participant.", true, [1, 2, 3, -1]);
}

function renderRound1QuestionList(type, data, container) {
  const entries = Object.entries(data || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  container.innerHTML = "";
  if (!entries.length) return (container.innerHTML = "<li class='empty-state'>Aucune question.</li>");

  for (const [id, q] of entries) {
    const li = document.createElement("li");
    li.className = "question-item";
    const isActive = liveState?.currentQuestionId === id;
    const aliases = Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length ? q.acceptedAnswers.join(' · ') : q.answer;
    const modeLabel = type === 'viewers' ? `Mode viewers · ${Number(q.points || 1)} pt · ${Number(q.timerSeconds || 0)}s` : 'Mode participants';
    li.innerHTML = `<div class="question-head"><strong>Q${q.order}</strong>${isActive ? '<span class="question-active-chip">Active</span>' : ""}</div><p>${q.text}</p><p class="muted">Réponses acceptées : ${aliases}</p><p class="muted">${modeLabel}</p>`;

    const actions = document.createElement("div");
    actions.className = "row question-actions";

    const askBtn = document.createElement("button");
    askBtn.className = isActive ? "btn btn-secondary" : "btn btn-primary";
    askBtn.textContent = isActive ? "En direct" : "Lancer";
    askBtn.disabled = isActive;
    askBtn.addEventListener("click", async () => {
      const now = Date.now();
      await clearBuzzData();
      await update(ref(db, "rooms/manche1/state"), { currentType: type, currentQuestionId: id, showAnswer: false, buzzerLocked: false, lockedBySessionId: null, lockedByNickname: "", lockedAt: 0, updatedAt: now });
      if (type === 'viewers') {
        const timerSeconds = Number(q.timerSeconds || 0);
        await set(ref(db, "rooms/viewers/liveState"), {
          active: true,
          status: 'active',
          mode: 'viewer-question',
          round: 'manche1',
          questionId: id,
          settings: q.settings || { firstCorrectOnly: true, allowMultipleWinners: false, caseSensitive: false },
          points: Number(q.points || 1),
          timerSeconds,
          startedAt: now,
          endsAt: timerSeconds > 0 ? now + timerSeconds * 1000 : null,
          updatedAt: now,
          updatedBy: currentAdminId,
        });
      }
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

    if (type === "viewers") {
      const stopBtn = document.createElement("button");
      stopBtn.className = "btn btn-secondary";
      stopBtn.textContent = "Stop";
      stopBtn.addEventListener("click", async () => {
        await update(ref(db, "rooms/viewers/liveState"), { active: false, status: "stopped", endedAt: Date.now(), updatedAt: Date.now(), updatedBy: currentAdminId || "admin" });
        if (liveState?.currentQuestionId === id) {
          await update(ref(db, "rooms/manche1/state"), { currentType: "participants", currentQuestionId: null, showAnswer: false, updatedAt: Date.now() });
        }
      });

      const resetBtn = document.createElement("button");
      resetBtn.className = "btn btn-danger";
      resetBtn.textContent = "Reset";
      resetBtn.addEventListener("click", async () => {
        const sessionKey = `manche1:${id}`;
        await Promise.all([
          remove(ref(db, `rooms/viewers/winners/${sessionKey}`)),
          remove(ref(db, `rooms/viewers/attempts/${sessionKey}`)),
          remove(ref(db, `rooms/manche1/viewerWinners/${id}`)),
        ]);
      });
      actions.append(stopBtn, resetBtn);
    }

    actions.append(askBtn, editBtn, deleteBtn);
    li.appendChild(actions);
    container.appendChild(li);
  }
}

async function editRound1Question(type, questionId, currentQuestion) {
  const text = await showPrompt("Modifier le texte de la question", {
    title: "Éditer la question",
    inputLabel: "Texte de la question",
    defaultValue: currentQuestion?.text || "",
    confirmText: "Enregistrer",
  });
  if (text === null) return;
  const answer = await showPrompt(type === "viewers" ? "Modifier les réponses acceptées (une ligne = un alias)" : "Modifier la réponse", {
    title: "Éditer la réponse",
    inputLabel: type === "viewers" ? "Réponses acceptées" : "Réponse",
    defaultValue: type === "viewers" ? (currentQuestion?.acceptedAnswers || [currentQuestion?.answer || ""]).join("\n") : (currentQuestion?.answer || ""),
    confirmText: "Enregistrer",
  });
  if (answer === null) return;
  const nextText = text.trim();
  const nextAnswer = answer.trim();
  if (!nextText || !nextAnswer) return showToast("Question et réponse obligatoires.", "error");
  const payload = {
    text: nextText,
    answer: nextAnswer,
    updatedAt: Date.now(),
    updatedBy: currentAdminId,
  };
  if (type === "viewers") {
    const acceptedAnswers = parseAcceptedAnswers(nextAnswer);
    payload.acceptedAnswers = acceptedAnswers;
    payload.normalizedAnswers = acceptedAnswers.map((value) => normalizeViewerAnswer(value)).filter(Boolean);
    payload.answer = acceptedAnswers[0] || nextAnswer;
  }
  await update(ref(db, `rooms/manche1/questions/${type}/${questionId}`), payload);
  showToast("Question mise à jour");
}

async function deleteRound1Question(type, questionId) {
  if (!(await showConfirm("Supprimer cette question ?", { title: "Suppression" }))) return;
  const isActive = liveState?.currentQuestionId === questionId;
  await remove(ref(db, `rooms/manche1/questions/${type}/${questionId}`));
  if (isActive) {
    await update(ref(db, "rooms/manche1/state"), { currentType: "participants", currentQuestionId: null, showAnswer: false, buzzerLocked: false, lockedBySessionId: null, lockedByNickname: "", lockedAt: 0, updatedAt: Date.now() });
    await update(ref(db, "rooms/viewers/liveState"), { active: false, status: "stopped", endedAt: Date.now(), updatedAt: Date.now(), updatedBy: currentAdminId || "admin" });
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
    const resolvedName =
      b.nickname
      || sessionsById[b.sessionId]?.nickname
      || sessionsById[b.accountId]?.nickname
      || b.loginId
      || "Anonyme";
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${resolvedName}`;
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
      if (!(await showConfirm("Supprimer cette image ?", { title: "Suppression" }))) return;
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

function sortedRound2Entries() {
  return Object.entries(manche2Questions || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
}

async function moveRound2Image(step) {
  const entries = sortedRound2Entries();
  if (!entries.length) return;
  const currentIndex = entries.findIndex(([id]) => id === manche2State?.activeQuestionId);
  const fallbackIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex = Math.max(0, Math.min(entries.length - 1, fallbackIndex + step));
  const [nextId] = entries[nextIndex];
  if (!nextId || nextId === manche2State?.activeQuestionId) return;
  await update(ref(db, "rooms/manche2/state"), { activeQuestionId: nextId, updatedAt: Date.now(), updatedBy: currentAdminId });
}

async function editRound2Question(questionId, item) {
  const work = await showPrompt("Modifier l'œuvre", {
    title: "Éditer la question manche 2",
    inputLabel: "Œuvre",
    defaultValue: item.work || "",
    confirmText: "Continuer",
  });
  if (work === null) return;
  const location = await showPrompt("Modifier le lieu", {
    title: "Éditer la question manche 2",
    inputLabel: "Lieu",
    defaultValue: item.location || "",
    confirmText: "Continuer",
  });
  if (location === null) return;
  const questionText = await showPrompt("Modifier le texte de la question (optionnel)", {
    title: "Éditer la question manche 2",
    inputLabel: "Question (optionnelle)",
    defaultValue: item.questionText || "",
    confirmText: "Enregistrer",
  });
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
  const lockedByName = liveState?.lockedByNickname
    || sessionsById[liveState?.lockedBySessionId]?.nickname
    || "—";
  currentQuestionStatus.textContent = question ? question.text : "Aucune";
  activeQuestion.textContent = question ? `Question active : ${question.text}` : "Aucune question active.";
  const activeQuestionLive = $("active-question-live");
  if (activeQuestionLive) activeQuestionLive.textContent = question ? `Question active : ${question.text}` : "Aucune question active.";
  const buzzerOpen = Boolean(liveState?.currentQuestionId) && !liveState?.buzzerLocked && liveState?.currentType !== "viewers";
  buzzerStatus.textContent = liveState?.currentType === "viewers" ? "Désactivé" : buzzerOpen ? "Ouvert" : "Verrouillé";
  lastBuzzStatus.textContent = lockedByName;
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

  const lockedByName = liveState.lockedByNickname || sessionsById[liveState.lockedBySessionId]?.nickname || "Quelqu’un";
  if (liveState.buzzerLocked) {
    buzzLive.textContent = `🔔 ${lockedByName}`;
    buzzPriorityName.textContent = lockedByName;
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
  const statusText = active ? `Image live : ${active.work}` : "Aucune image active.";
  setMessage(m2LiveStatus, statusText);
  setMessage(m2OverviewStatus, statusText);
  if (m2LiveCurrentImage) {
    if (active?.imageDataUrl) {
      m2LiveCurrentImage.src = active.imageDataUrl;
      m2LiveCurrentImage.classList.remove("hidden");
    } else {
      m2LiveCurrentImage.removeAttribute("src");
      m2LiveCurrentImage.classList.add("hidden");
    }
  }
  if (m2LiveCurrentTitle) m2LiveCurrentTitle.textContent = active?.work || "—";
  if (m2LiveCurrentLocation) m2LiveCurrentLocation.textContent = active?.location || "—";
  if (m2LiveCurrentQuestion) m2LiveCurrentQuestion.textContent = active?.questionText || "—";
  const entries = sortedRound2Entries();
  const currentIndex = entries.findIndex(([id]) => id === manche2State?.activeQuestionId);
  if (m2LivePrevBtn) m2LivePrevBtn.disabled = currentIndex <= 0;
  if (m2LiveNextBtn) m2LiveNextBtn.disabled = currentIndex < 0 || currentIndex >= entries.length - 1;
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
      const nextName = await showPrompt("Nouveau nom du thème", {
        title: "Renommer le thème",
        inputLabel: "Nom du thème",
        defaultValue: theme.name || "",
        confirmText: "Renommer",
      });
      if (!nextName) return;
      await update(ref(db, `rooms/manche3/themes/${themeId}`), { name: nextName.trim(), updatedAt: Date.now(), updatedBy: currentAdminId });
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Supprimer thème";
    deleteBtn.addEventListener("click", async () => {
      if (!(await showConfirm("Supprimer ce thème ?", { title: "Suppression du thème" }))) return;
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
  const text = await showPrompt("Modifier la question", {
    title: "Éditer la question manche 3",
    inputLabel: "Question",
    defaultValue: currentQuestion?.text || "",
    confirmText: "Enregistrer",
  });
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
  if (m3LivePlayer) m3LivePlayer.textContent = getRound3ActivePlayerName();
  if (m3LiveTheme) m3LiveTheme.textContent = activeTheme?.name || "Aucun";
  if (m3LiveQuestion) m3LiveQuestion.textContent = current?.text || (activeTheme ? "Fin de la liste." : "En attente du choix du thème");
  if (m3LiveTimer) m3LiveTimer.textContent = formatTimer(remaining);

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

function syncOverlayInputs() {
  const r1 = overlayConfigs.round1;
  if (overlayRound1MaxFontSizeInput) overlayRound1MaxFontSizeInput.value = String(r1.maxFontSizePx);
  if (overlayRound1MinFontSizeInput) overlayRound1MinFontSizeInput.value = String(r1.minFontSizePx);
  if (overlayRound1ColorInput) overlayRound1ColorInput.value = r1.textColor;
  if (overlayRound1FontWeightInput) overlayRound1FontWeightInput.value = String(r1.fontWeight);
  if (overlayRound1ShadowInput) overlayRound1ShadowInput.checked = Boolean(r1.textShadow);
  if (overlayRound1AlignInput) overlayRound1AlignInput.value = r1.horizontalAlign;
  if (overlayRound1VerticalAlignInput) overlayRound1VerticalAlignInput.value = r1.verticalAlign;
  if (overlayRound1PaddingInput) overlayRound1PaddingInput.value = String(r1.safePaddingPx);
  if (overlayRound1MaxWidthInput) overlayRound1MaxWidthInput.value = String(r1.maxWidthPx);

  const r2 = overlayConfigs.round2;
  if (overlayRound2MaxWidthInput) overlayRound2MaxWidthInput.value = String(r2.maxWidthPx);
  if (overlayRound2MaxHeightInput) overlayRound2MaxHeightInput.value = String(r2.maxHeightPx);
  if (overlayRound2RadiusInput) overlayRound2RadiusInput.value = String(r2.borderRadiusPx);

  const r3 = overlayConfigs.round3;
  if (overlayRound3QuestionSizeInput) overlayRound3QuestionSizeInput.value = String(r3.questionFontSizePx);
  if (overlayRound3ThemeSizeInput) overlayRound3ThemeSizeInput.value = String(r3.themeFontSizePx);
  if (overlayRound3TimerSizeInput) overlayRound3TimerSizeInput.value = String(r3.timerFontSizePx);
  if (overlayRound3QuestionColorInput) overlayRound3QuestionColorInput.value = r3.questionColor;
  if (overlayRound3ThemeColorInput) overlayRound3ThemeColorInput.value = r3.themeColor;
  if (overlayRound3TimerColorInput) overlayRound3TimerColorInput.value = r3.timerColor;
  if (overlayRound3FontWeightInput) overlayRound3FontWeightInput.value = String(r3.fontWeight);
  if (overlayRound3AlignInput) overlayRound3AlignInput.value = r3.align;
  if (overlayRound3GapInput) overlayRound3GapInput.value = String(r3.blockGapPx);
  if (overlayRound3MaxWidthInput) overlayRound3MaxWidthInput.value = String(r3.maxWidthPx);

  const r4 = overlayConfigs.round4;
  if (overlayRound4ClueSizeInput) overlayRound4ClueSizeInput.value = String(r4.clueFontSizePx);
  if (overlayRound4ClueColorInput) overlayRound4ClueColorInput.value = r4.clueColor;
  if (overlayRound4WordSizeInput) overlayRound4WordSizeInput.value = String(r4.wordFontSizePx);
  if (overlayRound4CellRadiusInput) overlayRound4CellRadiusInput.value = String(r4.cellRadiusPx);
  if (overlayRound4MarkerSizeInput) overlayRound4MarkerSizeInput.value = String(r4.markerSizePx);
  if (overlayRound4MarkerOpacityInput) overlayRound4MarkerOpacityInput.value = String(r4.markerOpacity);
  if (overlayRound4GridMaxWidthInput) overlayRound4GridMaxWidthInput.value = String(r4.gridMaxWidthPx);
  if (overlayRound4GridGapInput) overlayRound4GridGapInput.value = String(r4.gridGapPx);

  const r5 = overlayConfigs.round5;
  if (overlayRound5PrimarySizeInput) overlayRound5PrimarySizeInput.value = String(r5.primaryFontSizePx);
  if (overlayRound5SecondarySizeInput) overlayRound5SecondarySizeInput.value = String(r5.secondaryFontSizePx);
  if (overlayRound5PrimaryColorInput) overlayRound5PrimaryColorInput.value = r5.primaryColor;
  if (overlayRound5SecondaryColorInput) overlayRound5SecondaryColorInput.value = r5.secondaryColor;
  if (overlayRound5PlayingColorInput) overlayRound5PlayingColorInput.value = r5.playingColor;
  if (overlayRound5PausedColorInput) overlayRound5PausedColorInput.value = r5.pausedColor;
  if (overlayRound5StoppedColorInput) overlayRound5StoppedColorInput.value = r5.stoppedColor;
  if (overlayRound5ProgressHeightInput) overlayRound5ProgressHeightInput.value = String(r5.progressHeightPx);
  if (overlayRound5CornerRadiusInput) overlayRound5CornerRadiusInput.value = String(r5.cornerRadiusPx);
  if (overlayRound5MaxWidthInput) overlayRound5MaxWidthInput.value = String(r5.maxWidthPx);
  if (overlayRound5DecorationOpacityInput) overlayRound5DecorationOpacityInput.value = String(r5.decorationOpacity);
  if (overlayRound5ProgressMaxInput) overlayRound5ProgressMaxInput.value = String(r5.progressMaxSeconds);
}

function readOverlayConfigInputs(roundKey) {
  if (roundKey === "round1") {
    return {
      maxFontSizePx: overlayRound1MaxFontSizeInput?.value,
      minFontSizePx: overlayRound1MinFontSizeInput?.value,
      textColor: overlayRound1ColorInput?.value,
      fontWeight: overlayRound1FontWeightInput?.value,
      textShadow: overlayRound1ShadowInput?.checked,
      horizontalAlign: overlayRound1AlignInput?.value,
      verticalAlign: overlayRound1VerticalAlignInput?.value,
      safePaddingPx: overlayRound1PaddingInput?.value,
      maxWidthPx: overlayRound1MaxWidthInput?.value,
    };
  }
  if (roundKey === "round2") {
    return {
      maxWidthPx: overlayRound2MaxWidthInput?.value,
      maxHeightPx: overlayRound2MaxHeightInput?.value,
      borderRadiusPx: overlayRound2RadiusInput?.value,
    };
  }
  if (roundKey === "round3") {
    return {
      questionFontSizePx: overlayRound3QuestionSizeInput?.value,
      themeFontSizePx: overlayRound3ThemeSizeInput?.value,
      timerFontSizePx: overlayRound3TimerSizeInput?.value,
      questionColor: overlayRound3QuestionColorInput?.value,
      themeColor: overlayRound3ThemeColorInput?.value,
      timerColor: overlayRound3TimerColorInput?.value,
      fontWeight: overlayRound3FontWeightInput?.value,
      align: overlayRound3AlignInput?.value,
      blockGapPx: overlayRound3GapInput?.value,
      maxWidthPx: overlayRound3MaxWidthInput?.value,
    };
  }
  if (roundKey === "round4") {
    return {
      clueFontSizePx: overlayRound4ClueSizeInput?.value,
      clueColor: overlayRound4ClueColorInput?.value,
      wordFontSizePx: overlayRound4WordSizeInput?.value,
      cellRadiusPx: overlayRound4CellRadiusInput?.value,
      markerSizePx: overlayRound4MarkerSizeInput?.value,
      markerOpacity: overlayRound4MarkerOpacityInput?.value,
      gridMaxWidthPx: overlayRound4GridMaxWidthInput?.value,
      gridGapPx: overlayRound4GridGapInput?.value,
    };
  }
  if (roundKey === "round5") {
    return {
      primaryFontSizePx: overlayRound5PrimarySizeInput?.value,
      secondaryFontSizePx: overlayRound5SecondarySizeInput?.value,
      primaryColor: overlayRound5PrimaryColorInput?.value,
      secondaryColor: overlayRound5SecondaryColorInput?.value,
      playingColor: overlayRound5PlayingColorInput?.value,
      pausedColor: overlayRound5PausedColorInput?.value,
      stoppedColor: overlayRound5StoppedColorInput?.value,
      progressHeightPx: overlayRound5ProgressHeightInput?.value,
      cornerRadiusPx: overlayRound5CornerRadiusInput?.value,
      maxWidthPx: overlayRound5MaxWidthInput?.value,
      decorationOpacity: overlayRound5DecorationOpacityInput?.value,
      progressMaxSeconds: overlayRound5ProgressMaxInput?.value,
    };
  }
  return {};
}

async function saveOverlayConfig(roundKey) {
  const next = normalizeOverlayConfig(roundKey, readOverlayConfigInputs(roundKey));
  const prev = overlayConfigs[roundKey] || {};
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  overlayConfigs[roundKey] = next;
  syncOverlayInputs();
  await update(ref(db, `${OVERLAY_CONFIGS_PATH}/${roundKey}`), { ...next, updatedAt: Date.now(), updatedBy: currentAdminId || "admin" });
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
