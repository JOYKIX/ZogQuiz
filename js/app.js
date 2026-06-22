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
import { initMortSubiteAdmin } from "./mort-subite.js";
import { initManche6Admin } from "./manche6.js";
import { initViewerAdmin } from "./viewer-admin.js";
import { parseAcceptedAnswers, normalizeViewerAnswer } from "./viewer-utils.js";
import { formatTimer as formatTimerDisplay } from "./timer-format.js";
import { showConfirm, showPrompt } from "./modal.js";
import {
  GUEST_ACCOUNTS_PATH,
  GUEST_LOGIN_INDEX_PATH,
  createGuestAccount,
  normalizeBuzzerSoundFile,
  removeGuestAccount,
  setGuestAccountPassword,
  updateParticipantColor as saveParticipantColor,
} from "./guest-accounts.js";
import {
  getDefaultParticipantColor,
  normalizeParticipantColor,
  groupParticipantsByColor,
  computeReadableTextColor,
} from "./participants.js";

const $ = (id) => document.getElementById(id);

const authSection = $("auth-section");
const dashboard = $("dashboard");
const authMessage = $("auth-message");
const adminEmail = $("admin-email");
const logoutBtn = $("logout");
const loginForm = $("login-form");
const breadcrumb = $("breadcrumb");
const toast = $("toast");

const guestAccountForm = $("guest-account-form");
const guestLoginIdInput = $("guest-login-id");
const guestPasswordInput = $("guest-password");
const guestBuzzerSoundInput = $("guest-buzzer-sound");
const guestAccountsList = $("guest-accounts-list");
const guestAccountsMessage = $("guest-accounts-message");

const adminAccountForm = $("admin-account-form");
const adminAccountIdInput = $("admin-account-id");
const adminAccountPasswordInput = $("admin-account-password");
const adminAccountsList = $("admin-accounts-list");
const adminAccountsMessage = $("admin-accounts-message");

const participantQuestionForm = $("participant-question-form");
const viewerQuestionForm = $("viewer-question-form");
const participantQuestionsList = $("participant-questions-list");
const viewerQuestionsList = $("viewer-questions-list");
const viewerAfterParticipantInput = $("viewer-after-participant");

const toggleAnswerBtn = $("toggle-answer");
const unlockBuzzerBtn = $("unlock-buzzer");
const disableBuzzerBtn = $("disable-buzzer");
const markCorrectBtn = $("mark-correct");
const markWrongBtn = $("mark-wrong");
const round1PrevQuestionBtn = $("round1-prev-question");
const round1NextQuestionBtn = $("round1-next-question");
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

const activeRoundStatusHeader = $("active-round-status-header");
const sessionStatusHeader = $("session-status-header");

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
const m2LiveAnswers = $("m2-live-answers");
const m2LivePrevBtn = $("m2-live-prev");
const m2LiveNextBtn = $("m2-live-next");
const m2ResetAnswersBtn = $("m2-reset-answers");
const m2QuestionSearch = $("m2-question-search");
const m2QuestionCount = $("m2-question-count");
const m2EditorMode = $("m2-editor-mode");
const m2NewQuestionBtn = $("m2-new-question");
const m2SaveQuestionBtn = $("m2-save-question");

const m3ThemeForm = $("m3-theme-form");
const m3ThemeName = $("m3-theme-name");
const m3ThemeList = $("m3-theme-list");
const m3UnlockThemesBtn = $("m3-unlock-themes");
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
const overlayRound3QuestionMinSizeInput = $("overlay-round3-question-min-size");
const overlayRound3PaddingInput = $("overlay-round3-padding");
const overlayRound3LineHeightInput = $("overlay-round3-line-height");
const overlayRound3ThemeColorInput = $("overlay-round3-theme-color");
const overlayRound3FontWeightInput = $("overlay-round3-font-weight");
const overlayRound3AlignInput = $("overlay-round3-align");
const overlayRound3MaxWidthInput = $("overlay-round3-max-width");
const overlayRound3TimerSizeInput = $("overlay-round3-timer-size");
const overlayRound3TimerColorInput = $("overlay-round3-timer-color");
const overlayRound3TimerCircleColorInput = $("overlay-round3-timer-circle-color");
const overlayRound3TimerFormatInput = $("overlay-round3-timer-format");
const overlayRound3TimerFontWeightInput = $("overlay-round3-timer-font-weight");
const overlayRound3TimerAlignInput = $("overlay-round3-timer-align");
const overlayRound3TimerPaddingInput = $("overlay-round3-timer-padding");
const overlayRound3TimerLineHeightInput = $("overlay-round3-timer-line-height");
const overlayRound3TimerMaxWidthInput = $("overlay-round3-timer-max-width");
const overlayRound3ThemeOverlayTextColorInput = $("overlay-round3-theme-overlay-text-color");
const overlayRound3ThemeOverlayBackgroundColorInput = $("overlay-round3-theme-overlay-background-color");
const overlayRound3ThemeOverlayActiveBorderColorInput = $("overlay-round3-theme-overlay-active-border-color");
const overlayRound3ThemeOverlayFontSizeInput = $("overlay-round3-theme-overlay-font-size");
const overlayRound3ThemeOverlayFontWeightInput = $("overlay-round3-theme-overlay-font-weight");
const overlayRound3ThemeOverlayAlignInput = $("overlay-round3-theme-overlay-align");
const overlayRound3ThemeOverlayColumnsInput = $("overlay-round3-theme-overlay-columns");
const overlayRound3ThemeOverlayMaxWidthInput = $("overlay-round3-theme-overlay-max-width");
const overlayRound3ThemeOverlayPaddingInput = $("overlay-round3-theme-overlay-padding");
const overlayRound3ThemeOverlayColumnGapInput = $("overlay-round3-theme-overlay-column-gap");
const overlayRound3ThemeOverlayRowGapInput = $("overlay-round3-theme-overlay-row-gap");
const overlayRound3ThemeOverlayBackgroundWidthInput = $("overlay-round3-theme-overlay-background-width");
const overlayRound3ThemeOverlayPaddingYInput = $("overlay-round3-theme-overlay-padding-y");
const overlayRound3ThemeOverlayPaddingXInput = $("overlay-round3-theme-overlay-padding-x");
const overlayRound3ThemeOverlayRadiusInput = $("overlay-round3-theme-overlay-radius");
const overlayRound3ThemeOverlayBorderWidthInput = $("overlay-round3-theme-overlay-border-width");
const overlayRound3ThemeOverlayLineHeightInput = $("overlay-round3-theme-overlay-line-height");
const overlayRound3ThemeOverlayLetterSpacingInput = $("overlay-round3-theme-overlay-letter-spacing");

const overlayRound4MaxFontSizeInput = $("overlay-round4-max-font-size");
const overlayRound4MinFontSizeInput = $("overlay-round4-min-font-size");
const overlayRound4TextColorInput = $("overlay-round4-text-color");
const overlayRound4FontWeightInput = $("overlay-round4-font-weight");
const overlayRound4ShadowInput = $("overlay-round4-shadow");
const overlayRound4AlignInput = $("overlay-round4-align");
const overlayRound4PaddingInput = $("overlay-round4-padding");
const overlayRound4LineHeightInput = $("overlay-round4-line-height");
const overlayRound4MaxWidthInput = $("overlay-round4-max-width");
const m4LiveScores = $("m4-live-scores");

const overlayRound6QuestionSizeInput = $("overlay-round6-question-size");
const overlayRound6QuestionMinSizeInput = $("overlay-round6-question-min-size");
const overlayRound6QuestionColorInput = $("overlay-round6-question-color");
const overlayRound6QuestionFontWeightInput = $("overlay-round6-question-font-weight");
const overlayRound6QuestionAlignInput = $("overlay-round6-question-align");
const overlayRound6QuestionVerticalAlignInput = $("overlay-round6-question-vertical-align");
const overlayRound6QuestionPaddingInput = $("overlay-round6-question-padding");
const overlayRound6QuestionMaxWidthInput = $("overlay-round6-question-max-width");
const overlayRound6TimerSizeInput = $("overlay-round6-timer-size");
const overlayRound6TimerColorInput = $("overlay-round6-timer-color");
const overlayRound6TimerLeftRectColorInput = $("overlay-round6-timer-left-rect-color");
const overlayRound6TimerRightRectColorInput = $("overlay-round6-timer-right-rect-color");
const overlayRound6TimerFormatInput = $("overlay-round6-timer-format");
const overlayRound6TimerParticipantXInput = $("overlay-round6-timer-participant-x");
const overlayRound6TimerParticipantYInput = $("overlay-round6-timer-participant-y");
const overlayRound6TimerViewerXInput = $("overlay-round6-timer-viewer-x");
const overlayRound6TimerViewerYInput = $("overlay-round6-timer-viewer-y");

const overlayRound5NameSizeInput = $("overlay-round5-name-size");
const overlayRound5HpSizeInput = $("overlay-round5-hp-size");
const overlayRound5TextColorInput = $("overlay-round5-text-color");
const overlayRound5HealthColorInput = $("overlay-round5-health-color");
const overlayRound5DangerColorInput = $("overlay-round5-danger-color");
const overlayRound5BarHeightInput = $("overlay-round5-bar-height");
const overlayRound5CornerRadiusInput = $("overlay-round5-corner-radius");
const overlayRound5MaxWidthInput = $("overlay-round5-max-width");
const overlayRound5ScreenPaddingInput = $("overlay-round5-screen-padding");
const overlayRound5BarGapInput = $("overlay-round5-bar-gap");
const overlayRound5FrameOpacityInput = $("overlay-round5-frame-opacity");
const overlayRound5DimmedOpacityInput = $("overlay-round5-dimmed-opacity");
const overlayRound5MaxHpInput = $("overlay-round5-max-hp");

const workspaceLinks = Array.from(document.querySelectorAll(".nav-item[data-workspace]"));
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
const activeRoundSectionByRound = { manche1: "live", manche2: "live", manche3: "live", manche4: "live", manche5: "overview", manche6: "overview", finale: "overview" };

let liveState = null;
let overlayConfigs = {
  round1: { ...OVERLAY_DEFAULTS.round1 },
  round2: { ...OVERLAY_DEFAULTS.round2 },
  round3: { ...OVERLAY_DEFAULTS.round3 },
  round3Timer: { ...OVERLAY_DEFAULTS.round3Timer },
  round3ThemeOverlay: { ...OVERLAY_DEFAULTS.round3ThemeOverlay },
  round4: { ...OVERLAY_DEFAULTS.round4 },
  round5: { ...OVERLAY_DEFAULTS.round5 },
  round6: { ...OVERLAY_DEFAULTS.round6 },
  round6Timer: { ...OVERLAY_DEFAULTS.round6Timer },
};
let sessionsById = {};
let adminsById = {};
let participantQuestions = {};
let viewerQuestions = {};
const round1EditingQuestion = { participants: null, viewers: null };
let manche2Questions = {};
let manche2State = null;
let manche2Answers = {};
let viewerLiveState = null;
let manche2ViewerQuestions = {};
let selectedManche2QuestionId = null;
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

function isSafeAdminId(adminId) {
  return /^[a-z0-9_-]{3,40}$/.test(adminId);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  if (sessionStatusHeader) sessionStatusHeader.textContent = "Connecté";
}

function showAuth() {
  authSection.classList.remove("hidden");
  dashboard.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  adminEmail.textContent = "Hors ligne";
  sessionStatus.textContent = "Hors ligne";
  if (sessionStatusHeader) sessionStatusHeader.textContent = "Hors ligne";
}

function workspaceLabel(workspace) {
  if (workspace === "dashboard") return "Live";
  if (workspace === "players") return "Joueurs";
  if (workspace === "admins") return "Admins";
  if (workspace === "broadcast") return "Diffusion";
  if (workspace === "cam-config") return "Cam config";
  return `Rondes • ${formatRound(editingRound)}`;
}
function formatRound(round) {
  if (round === "finale") return "Finale";
  if (round === "manche6") return "Manche 6";
  if (round === "manche4") return "Manche 4";
  return round.replace("manche", "Manche ");
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
m2QuestionSearch?.addEventListener("input", () => renderRound2Questions());
m2NewQuestionBtn?.addEventListener("click", () => {
  selectRound2Question(null);
  m2WorkInput?.focus();
});
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

// Blindtest (ancienne manche 4) administré via le module manche4.
initManche4Admin({
  getCurrentAdminId: () => currentAdminId,
  setMessage,
  showToast,
});

initMortSubiteAdmin({
  getCurrentAdminId: () => currentAdminId,
  getSessionsById: () => sessionsById,
});

initManche6Admin({
  getCurrentAdminId: () => currentAdminId,
  showToast,
});

initViewerAdmin({
  getCurrentAdminId: () => currentAdminId,
  setMessage,
  showToast,
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

adminAccountForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isLoggedIn()) return;
  try {
    setMessage(adminAccountsMessage, "Création...", "loading");
    await createAdminAccount({
      adminId: adminAccountIdInput.value,
      password: adminAccountPasswordInput.value,
    });
    adminAccountForm.reset();
    setMessage(adminAccountsMessage, "Compte admin créé.", "success");
    showToast("Compte admin créé");
  } catch (error) {
    setMessage(adminAccountsMessage, error.message, "error");
  }
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
  await saveRound1Question("participants", "participant-question", "participant-answer");
});
viewerQuestionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveRound1Question("viewers", "viewer-question", "viewer-answer");
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
disableBuzzerBtn?.addEventListener("click", async () => {
  if (!liveState?.currentQuestionId || liveState.currentType === "viewers") return;
  await disableBuzzer();
  showToast("Buzzer désactivé");
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
  overlayRound3QuestionSizeInput, overlayRound3QuestionMinSizeInput, overlayRound3PaddingInput, overlayRound3LineHeightInput,
  overlayRound3ThemeColorInput, overlayRound3FontWeightInput, overlayRound3AlignInput, overlayRound3MaxWidthInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round3")));
[
  overlayRound3TimerSizeInput, overlayRound3TimerColorInput, overlayRound3TimerCircleColorInput, overlayRound3TimerFormatInput, overlayRound3TimerFontWeightInput,
  overlayRound3TimerAlignInput, overlayRound3TimerPaddingInput, overlayRound3TimerLineHeightInput, overlayRound3TimerMaxWidthInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round3Timer")));
[
  overlayRound3ThemeOverlayTextColorInput, overlayRound3ThemeOverlayBackgroundColorInput, overlayRound3ThemeOverlayActiveBorderColorInput,
  overlayRound3ThemeOverlayFontSizeInput, overlayRound3ThemeOverlayFontWeightInput, overlayRound3ThemeOverlayAlignInput,
  overlayRound3ThemeOverlayColumnsInput, overlayRound3ThemeOverlayMaxWidthInput, overlayRound3ThemeOverlayPaddingInput,
  overlayRound3ThemeOverlayColumnGapInput, overlayRound3ThemeOverlayRowGapInput, overlayRound3ThemeOverlayBackgroundWidthInput,
  overlayRound3ThemeOverlayPaddingYInput, overlayRound3ThemeOverlayPaddingXInput, overlayRound3ThemeOverlayRadiusInput,
  overlayRound3ThemeOverlayBorderWidthInput, overlayRound3ThemeOverlayLineHeightInput, overlayRound3ThemeOverlayLetterSpacingInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round3ThemeOverlay")));
[
  overlayRound4MaxFontSizeInput, overlayRound4MinFontSizeInput, overlayRound4TextColorInput, overlayRound4FontWeightInput,
  overlayRound4ShadowInput, overlayRound4AlignInput, overlayRound4PaddingInput, overlayRound4LineHeightInput, overlayRound4MaxWidthInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round4")));
[
  overlayRound6QuestionSizeInput, overlayRound6QuestionMinSizeInput, overlayRound6QuestionColorInput, overlayRound6QuestionFontWeightInput,
  overlayRound6QuestionAlignInput, overlayRound6QuestionVerticalAlignInput, overlayRound6QuestionPaddingInput, overlayRound6QuestionMaxWidthInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round6")));
[
  overlayRound6TimerSizeInput, overlayRound6TimerColorInput, overlayRound6TimerLeftRectColorInput, overlayRound6TimerRightRectColorInput, overlayRound6TimerFormatInput,
  overlayRound6TimerParticipantXInput, overlayRound6TimerParticipantYInput, overlayRound6TimerViewerXInput, overlayRound6TimerViewerYInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round6Timer")));
[
  overlayRound5NameSizeInput, overlayRound5HpSizeInput, overlayRound5TextColorInput,
  overlayRound5HealthColorInput, overlayRound5DangerColorInput, overlayRound5BarHeightInput,
  overlayRound5CornerRadiusInput, overlayRound5MaxWidthInput, overlayRound5ScreenPaddingInput,
  overlayRound5BarGapInput, overlayRound5FrameOpacityInput, overlayRound5DimmedOpacityInput,
  overlayRound5MaxHpInput,
].forEach((input) => input?.addEventListener("input", async () => saveOverlayConfig("round5")));

m3ThemeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = m3ThemeName.value.trim();
  if (!name) return;
  const themeRef = push(ref(db, "rooms/manche3/themes"));
  await set(themeRef, { name, questions: {}, locked: false, createdAt: Date.now(), createdBy: currentAdminId });
  m3ThemeForm.reset();
  showToast("Thème ajouté");
});

m3StartBtn.addEventListener("click", async () => round3Start());
m3PauseBtn.addEventListener("click", async () => round3Pause());
m3ResumeBtn.addEventListener("click", async () => round3Resume());
m3ResetBtn.addEventListener("click", async () => round3Reset());
m3UnlockThemesBtn?.addEventListener("click", async () => unlockRound3Themes());
m3NextBtn.addEventListener("click", async () => round3Advance(false));
m3PassBtn.addEventListener("click", async () => round3Advance(false));
m3CorrectBtn.addEventListener("click", async () => round3Advance(true));
m2LivePrevBtn?.addEventListener("click", async () => moveRound2Image(-1));
m2LiveNextBtn?.addEventListener("click", async () => moveRound2Image(1));
m2ResetAnswersBtn?.addEventListener("click", resetRound2Answers);
round1PrevQuestionBtn?.addEventListener("click", async () => moveRound1Question(-1));
round1NextQuestionBtn?.addEventListener("click", async () => moveRound1Question(1));

async function loginSuccess(adminId) {
  setSession(adminId);
  await ensureRoundsSeed(adminId);
  await setEditingRound("manche1");
  initListeners();
  showDashboard(adminId);
}

function resetRound1QuestionForm(type, questionInputId, answerInputId) {
  const questionInput = $(questionInputId);
  const answerInput = $(answerInputId);
  if (questionInput) questionInput.value = "";
  if (answerInput) answerInput.value = "";
  round1EditingQuestion[type] = null;
  const submitButton = (type === "viewers" ? viewerQuestionForm : participantQuestionForm)?.querySelector("button[type=submit]");
  if (submitButton) submitButton.textContent = "Ajouter";
  if (type === "viewers") {
    if ($("viewer-points")) $("viewer-points").value = "1";
    if ($("viewer-timer")) $("viewer-timer").value = "30";
    if ($("viewer-first-correct-only")) $("viewer-first-correct-only").checked = true;
    if ($("viewer-allow-multi")) $("viewer-allow-multi").checked = false;
    if (viewerAfterParticipantInput) viewerAfterParticipantInput.value = "0";
  }
}

function fillRound1QuestionForm(type, questionId, currentQuestion) {
  const questionInputId = type === "viewers" ? "viewer-question" : "participant-question";
  const answerInputId = type === "viewers" ? "viewer-answer" : "participant-answer";
  const questionInput = $(questionInputId);
  const answerInput = $(answerInputId);
  round1EditingQuestion[type] = questionId;
  const submitButton = (type === "viewers" ? viewerQuestionForm : participantQuestionForm)?.querySelector("button[type=submit]");
  if (submitButton) submitButton.textContent = "Enregistrer";
  if (questionInput) questionInput.value = currentQuestion?.text || "";
  if (answerInput) {
    answerInput.value = type === "viewers"
      ? (currentQuestion?.acceptedAnswers || [currentQuestion?.answer || ""]).join("\n")
      : (currentQuestion?.answer || "");
  }
  if (type === "viewers") {
    if ($("viewer-points")) $("viewer-points").value = String(Math.max(1, Number(currentQuestion?.points || 1)));
    if ($("viewer-timer")) $("viewer-timer").value = String(Math.max(0, Number(currentQuestion?.timerSeconds || 0)));
    if ($("viewer-first-correct-only")) $("viewer-first-correct-only").checked = Boolean(currentQuestion?.settings?.firstCorrectOnly ?? true);
    if ($("viewer-allow-multi")) $("viewer-allow-multi").checked = Boolean(currentQuestion?.settings?.allowMultipleWinners);
    if (viewerAfterParticipantInput) viewerAfterParticipantInput.value = String(Math.max(0, Number(currentQuestion?.afterParticipantOrder || 0)));
  }
  questionInput?.focus();
}

async function saveRound1Question(type, questionInputId, answerInputId) {
  const questionInput = $(questionInputId);
  const answerInput = $(answerInputId);
  const question = questionInput.value.trim();
  const rawAnswer = answerInput.value.trim();
  if (!question || !rawAnswer) return;

  const editingQuestionId = round1EditingQuestion[type];
  const payload = editingQuestionId
    ? { text: question, answer: rawAnswer, updatedAt: Date.now(), updatedBy: currentAdminId }
    : { type, text: question, answer: rawAnswer, order: 0, createdAt: Date.now(), createdBy: currentAdminId };
  if (type === "viewers") {
    const acceptedAnswers = parseAcceptedAnswers(rawAnswer);
    payload.acceptedAnswers = acceptedAnswers;
    payload.aliases = acceptedAnswers;
    payload.normalizedAnswers = acceptedAnswers.map((value) => normalizeViewerAnswer(value)).filter(Boolean);
    payload.answer = acceptedAnswers[0] || rawAnswer;
    payload.points = Math.max(1, Number($("viewer-points")?.value || 1));
    payload.timerSeconds = Math.max(0, Number($("viewer-timer")?.value || 0));
    payload.afterParticipantOrder = Math.max(0, Number(viewerAfterParticipantInput?.value || 0));
    payload.settings = {
      firstCorrectOnly: Boolean($("viewer-first-correct-only")?.checked),
      allowMultipleWinners: Boolean($("viewer-allow-multi")?.checked),
      caseSensitive: false,
    };
  }

  if (editingQuestionId) {
    await update(ref(db, `rooms/manche1/questions/${type}/${editingQuestionId}`), payload);
    showToast("Question mise à jour");
  } else {
    const listSnap = await get(ref(db, `rooms/manche1/questions/${type}`));
    payload.order = Object.keys(listSnap.val() || {}).length + 1;
    const questionRef = push(ref(db, `rooms/manche1/questions/${type}`));
    await set(questionRef, payload);
    showToast("Question ajoutée");
  }
  if (type === "viewers" && editingQuestionId && liveState?.currentType === "viewers" && liveState?.currentQuestionId === editingQuestionId) {
    const now = Date.now();
    await update(ref(db, "rooms/viewers/liveState"), {
      points: payload.points,
      timerSeconds: payload.timerSeconds,
      endsAt: payload.timerSeconds > 0 ? now + payload.timerSeconds * 1000 : null,
      updatedAt: now,
      updatedBy: currentAdminId || "admin",
    });
  }
  resetRound1QuestionForm(type, questionInputId, answerInputId);
}

async function createRound2Question() {
  const file = m2ImageInput.files?.[0];
  const work = m2WorkInput.value.trim();
  const location = m2LocationInput.value.trim();
  const questionText = m2QuestionTextInput.value.trim();
  if (!work || !location) return showToast("Œuvre et lieu obligatoires.", "error");
  if (!selectedManche2QuestionId && !file) return showToast("Image obligatoire pour une nouvelle question.", "error");
  if (file && !file.type.startsWith("image/")) return setMessage(m2LiveStatus, "Image invalide.", "error");
  if (file && file.size > MAX_IMAGE_SIZE) return setMessage(m2LiveStatus, "Image trop lourde (3 Mo max).", "error");

  setMessage(m2LiveStatus, selectedManche2QuestionId ? "Mise à jour..." : "Upload...", "loading");
  const imageDataUrl = file ? await readFileAsDataURL(file) : null;
  if (selectedManche2QuestionId) {
    const patch = { work, location, questionText, updatedAt: Date.now(), updatedBy: currentAdminId };
    if (imageDataUrl) {
      patch.imageDataUrl = imageDataUrl;
      patch.fileName = file.name;
      patch.mimeType = file.type;
    }
    await update(ref(db, `rooms/manche2/questions/${selectedManche2QuestionId}`), patch);
  } else {
    const listSnap = await get(ref(db, "rooms/manche2/questions"));
    const order = Object.keys(listSnap.val() || {}).length + 1;
    const questionRef = push(ref(db, "rooms/manche2/questions"));
    await set(questionRef, { imageDataUrl, work, location, questionText, fileName: file.name, mimeType: file.type, order, createdAt: Date.now(), createdBy: currentAdminId });
  }
  m2QuestionForm.reset();
  selectRound2Question(null);
  setMessage(m2LiveStatus, "Question enregistrée.", "success");
  showToast("Question manche 2 enregistrée");
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

  onValue(ref(db, "admins"), (snap) => {
    adminsById = snap.val() || {};
    renderAdminAccounts();
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
    ensureParticipantColorsInFirebase();
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
    renderRound3State();
  });
  onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/round3Timer`), (snap) => {
    overlayConfigs.round3Timer = normalizeOverlayConfig("round3Timer", snap.val() || OVERLAY_DEFAULTS.round3Timer);
    syncOverlayInputs();
    renderRound3State();
  });
  onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/round3ThemeOverlay`), (snap) => {
    overlayConfigs.round3ThemeOverlay = normalizeOverlayConfig("round3ThemeOverlay", snap.val() || OVERLAY_DEFAULTS.round3ThemeOverlay);
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
  onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/round6`), (snap) => {
    overlayConfigs.round6 = normalizeOverlayConfig("round6", snap.val() || OVERLAY_DEFAULTS.round6);
    syncOverlayInputs();
  });
  onValue(ref(db, `${OVERLAY_CONFIGS_PATH}/round6Timer`), (snap) => {
    overlayConfigs.round6Timer = normalizeOverlayConfig("round6Timer", snap.val() || OVERLAY_DEFAULTS.round6Timer);
    syncOverlayInputs();
  });

  onValue(ref(db, "rooms/manche2/questions"), (snap) => { manche2Questions = snap.val() || {}; renderRound2Questions(); updateRound2Status(); });
  onValue(ref(db, "rooms/manche2/state"), (snap) => { manche2State = snap.val() || {}; renderRound2Questions(); updateRound2Status(); });
  onValue(ref(db, "rooms/manche2/answers"), (snap) => { manche2Answers = snap.val() || {}; updateRound2Status(); });
  onValue(ref(db, "rooms/viewers/liveState"), (snap) => { viewerLiveState = snap.val() || null; updateRound2Status(); });
  onValue(ref(db, "rooms/viewers/questions/manche2"), (snap) => { manche2ViewerQuestions = snap.val() || {}; updateRound2Status(); });
  onValue(ref(db, "rooms/manche3/themes"), (snap) => { manche3Themes = snap.val() || {}; renderRound3Themes(); renderRound3State(); });
  onValue(ref(db, "rooms/manche3/state"), (snap) => {
    manche3State = snap.val() || null;
    renderRound3State();
    startRound3Ticker();
  });
}

async function ensureParticipantColorsInFirebase() {
  const updates = [];
  const takenColors = Object.values(sessionsById)
    .map((session) => (session?.color ? normalizeParticipantColor(session.color) : ""))
    .filter(Boolean);
  Object.entries(sessionsById).forEach(([sessionId, session]) => {
    const normalizedColor = normalizeParticipantColor(session?.color, getDefaultParticipantColor(sessionId, takenColors));
    if (String(session?.color || "").toLowerCase() === normalizedColor) return;
    updates.push(
      saveParticipantColor({
        participantId: sessionId,
        color: normalizedColor,
        updatedBy: currentAdminId || "system",
      }).catch(() => {})
    );
  });
  if (updates.length) await Promise.all(updates);
}

async function createAdminAccount({ adminId, password }) {
  const normalizedAdminId = normalizeAdminId(adminId || "");
  const cleanPassword = String(password || "");
  if (!normalizedAdminId || !cleanPassword) throw new Error("ID et mot de passe obligatoires.");
  if (!isSafeAdminId(normalizedAdminId)) throw new Error("L’ID admin doit contenir 3 à 40 caractères : lettres, chiffres, tirets ou underscores.");
  if (cleanPassword.length < 6) throw new Error("Le mot de passe doit contenir au moins 6 caractères.");

  const adminRef = ref(db, `admins/${normalizedAdminId}`);
  if ((await get(adminRef)).exists()) throw new Error("Cet ID admin existe déjà.");

  await set(adminRef, {
    adminId: normalizedAdminId,
    passwordHash: await hashPassword(cleanPassword),
    createdAt: Date.now(),
    createdBy: currentAdminId,
    updatedAt: Date.now(),
    updatedBy: currentAdminId,
  });
}

function renderAdminAccounts() {
  if (!adminAccountsList) return;
  const entries = Object.entries(adminsById || {}).map(([id, admin]) => ({
    id,
    ...admin,
    createdAt: Number(admin?.createdAt || 0),
  })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  adminAccountsList.innerHTML = "";
  if (!entries.length) {
    adminAccountsList.innerHTML = "<li class='empty-state'>Aucun compte admin.</li>";
    return;
  }

  for (const admin of entries) {
    const li = document.createElement("li");
    li.className = "question-item";
    const createdAtLabel = admin.createdAt ? new Date(admin.createdAt).toLocaleString() : "—";
    const isCurrent = admin.id === currentAdminId;
    li.innerHTML = `
      <div class="question-head"><strong>${escapeHtml(admin.adminId || admin.id)}</strong><span class="question-active-chip">${isCurrent ? "Session actuelle" : "Admin"}</span></div>
      <p class="muted">Créé le : ${escapeHtml(createdAtLabel)}</p>
      <p class="muted">Créé par : ${escapeHtml(admin.createdBy || "—")}</p>
    `;

    const actions = document.createElement("div");
    actions.className = "row";

    const renameBtn = document.createElement("button");
    renameBtn.className = "btn btn-secondary";
    renameBtn.textContent = "Modifier l’ID";
    renameBtn.addEventListener("click", async () => renameAdminAccount(admin.id));

    const resetPasswordBtn = document.createElement("button");
    resetPasswordBtn.className = "btn btn-secondary";
    resetPasswordBtn.textContent = "Réinitialiser mdp";
    resetPasswordBtn.addEventListener("click", async () => resetAdminPassword(admin.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.disabled = isCurrent;
    deleteBtn.title = isCurrent ? "Impossible de supprimer la session admin actuelle." : "Supprimer cet admin";
    deleteBtn.addEventListener("click", async () => deleteAdminAccount(admin.id));

    actions.append(renameBtn, resetPasswordBtn, deleteBtn);
    li.appendChild(actions);
    adminAccountsList.appendChild(li);
  }
}

async function renameAdminAccount(adminId) {
  const account = adminsById[adminId];
  if (!account) return;
  const nextAdminId = await showPrompt("Nouvel ID admin", {
    title: "Modifier l’ID admin",
    inputLabel: "ID admin",
    defaultValue: adminId,
    confirmText: "Modifier",
  });
  if (nextAdminId === null) return;

  const normalizedNextId = normalizeAdminId(nextAdminId);
  if (!normalizedNextId) return showToast("ID admin obligatoire", "error");
  if (!isSafeAdminId(normalizedNextId)) return showToast("ID admin invalide : 3 à 40 caractères, lettres, chiffres, tirets ou underscores", "error");
  if (normalizedNextId === adminId) return;
  if ((await get(ref(db, `admins/${normalizedNextId}`))).exists()) return showToast("Cet ID admin existe déjà", "error");

  await set(ref(db, `admins/${normalizedNextId}`), {
    ...account,
    adminId: normalizedNextId,
    updatedAt: Date.now(),
    updatedBy: currentAdminId,
  });
  await remove(ref(db, `admins/${adminId}`));
  if (adminId === currentAdminId) {
    setSession(normalizedNextId);
    adminEmail.textContent = `Connecté : ${normalizedNextId}`;
  }
  showToast("ID admin modifié");
}

async function resetAdminPassword(adminId) {
  if (!adminsById[adminId]) return;
  const nextPassword = await showPrompt("Nouveau mot de passe (6 caractères min)", {
    title: "Réinitialiser le mot de passe admin",
    inputLabel: "Nouveau mot de passe",
    placeholder: "6 caractères minimum",
    confirmText: "Mettre à jour",
  });
  if (nextPassword === null) return;
  if (String(nextPassword).length < 6) return showToast("Le mot de passe doit contenir au moins 6 caractères", "error");

  await update(ref(db, `admins/${adminId}`), {
    passwordHash: await hashPassword(nextPassword),
    updatedAt: Date.now(),
    updatedBy: currentAdminId,
  });
  showToast("Mot de passe admin mis à jour");
}

async function deleteAdminAccount(adminId) {
  const account = adminsById[adminId];
  if (!account) return;
  if (adminId === currentAdminId) return showToast("Impossible de supprimer la session admin actuelle", "error");
  if (!(await showConfirm(`Supprimer le compte admin ${account.adminId || adminId} ?`, { title: "Suppression admin" }))) return;
  await remove(ref(db, `admins/${adminId}`));
  showToast("Compte admin supprimé");
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
      showAnswer: false,
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
    buzzerLocked: false, buzzerDisabled: false, lockedBySessionId: null, lockedByNickname: "", lockedAt: 0, updatedAt: Date.now(),
  });
}

async function disableBuzzer() {
  await update(ref(db, "rooms/manche1/state"), {
    buzzerDisabled: true,
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

async function resetParticipantsAndLeaderboard() {
  await Promise.all([
    remove(ref(db, "rooms/manche1/guestSessions")),
    remove(ref(db, "rooms/manche1/buzzes")),
    remove(ref(db, "rooms/manche1/questionBlocks")),
    update(ref(db, "rooms/manche1/state"), {
      buzzerLocked: false,
      buzzerDisabled: false,
      lockedBySessionId: null,
      lockedByNickname: "",
      lockedAt: 0,
      updatedAt: Date.now(),
    }),
    update(ref(db, "rooms/manche3/state"), {
      activePlayerId: null,
      activeThemeId: null,
      questionIndex: 0,
      showAnswer: false,
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
    update(ref(db, "rooms/manche4/blindtest/live"), {
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
    remove(ref(db, "rooms/manche2/answers")),
    remove(ref(db, "rooms/manche3/themes")),
    remove(ref(db, "rooms/manche3/answers")),
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
      buzzerDisabled: false,
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
      showAnswer: false,
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
    set(ref(db, "rooms/manche4/blindtest/live"), {
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
    set(ref(db, "rooms/manche6/state"), {
      name: "Manche 6",
      phase: "setup",
      status: "idle",
      durationMs: 60000,
      activePlayer: "participant",
      players: {
        participant: { id: null, type: "participant", name: "Participant", score: 0, source: "manual" },
        viewer: { id: null, type: "viewer", name: "Viewer", score: 0, source: "manual" },
      },
      timers: { participant: { remainingMs: 60000 }, viewer: { remainingMs: 60000 } },
      timerStartedAt: null,
      currentQuestion: "",
      currentAnswer: "",
      currentQuestionId: null,
      questionDeck: [],
      questionBank: [],
      questionDrawnIds: [],
      answers: { participant: "", viewer: "" },
      winner: null,
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

async function updateParticipantColor(sessionId, rawColor) {
  if (!sessionId) return;
  try {
    await saveParticipantColor({
      participantId: sessionId,
      color: normalizeParticipantColor(rawColor, getDefaultParticipantColor(sessionId)),
      updatedBy: currentAdminId || "admin",
    });
    showToast("Couleur enregistrée.");
  } catch (error) {
    showToast(error.message || "Impossible de sauvegarder la couleur.", "error");
  }
}

function renderLeaderboardList(target, entries, emptyText, includeActions = false, actions = [1, -1]) {
  if (!target) return;
  target.innerHTML = "";
  if (!entries.length) return (target.innerHTML = `<li class="empty-state">${emptyText}</li>`);

  entries.forEach((p) => {
    const color = normalizeParticipantColor(p.color, getDefaultParticipantColor(p.id));
    const li = document.createElement("li");
    li.className = "leader-item";
    li.innerHTML = `<span class="leader-name"><span class="leader-color-dot" style="background-color:${color}"></span>${p.nickname || "Anonyme"}</span><span class="leader-score">${p.score} pt</span>`;
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

  const duplicatesByColor = groupParticipantsByColor(
    Object.fromEntries(entries.map((entry) => [entry.id, entry]))
  );

  entries.forEach((p) => {
    const li = document.createElement("li");
    li.className = "leader-item has-buzzer";
    const color = normalizeParticipantColor(p.color, getDefaultParticipantColor(p.id));
    const textColor = computeReadableTextColor(color);
    li.innerHTML = `<span class="leader-name"><span class="leader-color-dot" style="background-color:${color}"></span>${p.nickname || "Anonyme"}</span><span class="leader-score">${p.score} pt</span>`;

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

      const colorWrap = document.createElement("div");
      colorWrap.className = "participant-color";

      const swatch = document.createElement("span");
      swatch.className = "participant-color-swatch";
      swatch.style.backgroundColor = color;
      swatch.style.color = textColor;
      swatch.textContent = color.toUpperCase();

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = color;
      colorInput.title = "Couleur du participant";

      const hexInput = document.createElement("input");
      hexInput.type = "text";
      hexInput.value = color.toUpperCase();
      hexInput.placeholder = "#AABBCC";
      hexInput.pattern = "^#[0-9A-Fa-f]{6}$";
      hexInput.maxLength = 7;

      const syncPreview = (value) => {
        const nextColor = normalizeParticipantColor(value, color);
        swatch.style.backgroundColor = nextColor;
        swatch.style.color = computeReadableTextColor(nextColor);
        swatch.textContent = nextColor.toUpperCase();
      };

      colorInput.addEventListener("input", () => {
        hexInput.value = colorInput.value.toUpperCase();
        syncPreview(colorInput.value);
      });
      colorInput.addEventListener("change", () => updateParticipantColor(p.id, colorInput.value));

      hexInput.addEventListener("input", () => syncPreview(hexInput.value));
      hexInput.addEventListener("blur", () => {
        const normalized = normalizeParticipantColor(hexInput.value, color);
        colorInput.value = normalized;
        hexInput.value = normalized.toUpperCase();
        updateParticipantColor(p.id, normalized);
      });
      hexInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        hexInput.blur();
      });

      const duplicateWarning = document.createElement("p");
      duplicateWarning.className = "participant-color-warning hidden";
      const sameColorParticipants = duplicatesByColor.get(color) || [];
      if (sameColorParticipants.length > 1) {
        duplicateWarning.classList.remove("hidden");
        duplicateWarning.textContent = "⚠ Couleur identique à un autre participant.";
      }

      colorWrap.append(swatch, colorInput, hexInput, duplicateWarning);
      li.append(actionWrap, buzzerWrap, colorWrap);
    }

    target.appendChild(li);
  });
}

function sortedSessions() {
  const takenColors = Object.values(sessionsById)
    .map((session) => (session?.color ? normalizeParticipantColor(session.color) : ""))
    .filter(Boolean);
  return Object.entries(sessionsById)
    .map(([id, session]) => ({
      id,
      ...session,
      color: normalizeParticipantColor(session?.color, getDefaultParticipantColor(id, takenColors)),
      score: Number(session.score || 0),
    }))
    .sort((a, b) => b.score - a.score || (a.joinedAt || 0) - (b.joinedAt || 0));
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
    const afterLabel = type === 'viewers' && Number(q.afterParticipantOrder || 0) > 0 ? ` · après QP${Number(q.afterParticipantOrder || 0)}` : '';
    const modeLabel = type === 'viewers' ? `Mode viewers · ${Number(q.points || 1)} pt · ${Number(q.timerSeconds || 0)}s${afterLabel}` : 'Mode participants';
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
      await update(ref(db, "rooms/manche1/state"), { currentType: type, currentQuestionId: id, showAnswer: false, buzzerLocked: false, buzzerDisabled: false, lockedBySessionId: null, lockedByNickname: "", lockedAt: 0, updatedAt: now });
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
    editBtn.addEventListener("click", () => fillRound1QuestionForm(type, id, q));

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

function getRound1OrderedQuestions() {
  return [
    ...Object.entries(participantQuestions || {}).map(([id, question]) => ({ id, type: "participants", question, sortOrder: Number(question?.order || 0) })),
    ...Object.entries(viewerQuestions || {}).map(([id, question]) => {
      const afterParticipantOrder = Number(question?.afterParticipantOrder || 0);
      return {
        id,
        type: "viewers",
        question,
        sortOrder: afterParticipantOrder > 0 ? afterParticipantOrder + 0.5 : Number(question?.order || 0),
      };
    }),
  ].sort((a, b) => a.sortOrder - b.sortOrder || (a.question?.order || 0) - (b.question?.order || 0));
}

async function syncRound1ViewerLiveState(target, now) {
  if (target?.type === "viewers") {
    const q = target.question || {};
    const timerSeconds = Number(q.timerSeconds || 0);
    await set(ref(db, "rooms/viewers/liveState"), {
      active: true,
      status: "active",
      mode: "viewer-question",
      round: "manche1",
      questionId: target.id,
      settings: q.settings || { firstCorrectOnly: true, allowMultipleWinners: false, caseSensitive: false },
      points: Number(q.points || 1),
      timerSeconds,
      startedAt: now,
      endsAt: timerSeconds > 0 ? now + timerSeconds * 1000 : null,
      updatedAt: now,
      updatedBy: currentAdminId || "admin",
    });
    return;
  }
  await update(ref(db, "rooms/viewers/liveState"), {
    active: false,
    status: "stopped",
    endedAt: now,
    updatedAt: now,
    updatedBy: currentAdminId || "admin",
  });
}

async function moveRound1Question(direction) {
  const entries = getRound1OrderedQuestions();
  if (!entries.length) return;
  const currentIndex = entries.findIndex((item) => item.id === liveState?.currentQuestionId);
  const fallbackIndex = direction > 0 ? -1 : entries.length;
  const nextIndex = Math.min(entries.length - 1, Math.max(0, (currentIndex === -1 ? fallbackIndex : currentIndex) + direction));
  const target = entries[nextIndex];
  if (!target || target.id === liveState?.currentQuestionId) return;

  const now = Date.now();
  await clearBuzzData();
  await update(ref(db, "rooms/manche1/state"), {
    currentType: target.type,
    currentQuestionId: target.id,
    showAnswer: false,
    buzzerLocked: false,
    buzzerDisabled: false,
    lockedBySessionId: null,
    lockedByNickname: "",
    lockedAt: 0,
    updatedAt: now,
  });
  await syncRound1ViewerLiveState(target, now);
}

async function deleteRound1Question(type, questionId) {
  if (!(await showConfirm("Supprimer cette question ?", { title: "Suppression" }))) return;
  const isActive = liveState?.currentQuestionId === questionId;
  await remove(ref(db, `rooms/manche1/questions/${type}/${questionId}`));
  if (isActive) {
    await update(ref(db, "rooms/manche1/state"), { currentType: "participants", currentQuestionId: null, showAnswer: false, buzzerLocked: false, buzzerDisabled: false, lockedBySessionId: null, lockedByNickname: "", lockedAt: 0, updatedAt: Date.now() });
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
  const search = (m2QuestionSearch?.value || "").trim().toLowerCase();
  const entries = Object.entries(manche2Questions || {})
    .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
    .filter(([, item]) => !search || `${item.work || ""} ${item.location || ""} ${item.questionText || ""}`.toLowerCase().includes(search));
  if (m2QuestionCount) m2QuestionCount.textContent = `${entries.length} question${entries.length > 1 ? "s" : ""}`;
  m2QuestionsList.innerHTML = "";
  if (!entries.length) return (m2QuestionsList.innerHTML = "<li class='empty-state'>Aucune question pour cette manche.</li>");

  for (const [id, item] of entries) {
    const li = document.createElement("li");
    const isActive = manche2State?.activeQuestionId === id;
    li.className = `question-item question-card ${selectedManche2QuestionId === id ? "selected" : ""}`;
    li.innerHTML = `<div class="question-head"><strong>Q${item.order || "?"}</strong>${isActive ? '<span class="question-active-chip">Active</span>' : ""}</div><p><strong>Œuvre :</strong> ${item.work}</p><p><strong>Lieu :</strong> ${item.location}</p><p><strong>Question :</strong> ${item.questionText || "—"}</p>`;

    const image = document.createElement("img");
    image.className = "m2-thumb";
    image.alt = "Question manche 2";
    image.loading = "lazy";
    image.decoding = "async";
    image.src = item.imageDataUrl;
    li.insertBefore(image, li.querySelector("p"));
    li.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      selectRound2Question(id);
    });
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
      await remove(ref(db, `rooms/manche2/answers/${id}`));
      if (manche2State?.activeQuestionId === id) {
        await update(ref(db, "rooms/manche2/state"), { activeQuestionId: null, updatedAt: Date.now(), updatedBy: currentAdminId });
      }
    });

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Éditer";
    editBtn.addEventListener("click", () => {
      selectRound2Question(id);
      activateRoundSection("manche2", "questions");
      m2ImageInput?.focus();
      showToast("Question chargée dans l’éditeur : vous pouvez aussi remplacer l’image.");
    });

    actions.append(liveBtn, editBtn, deleteBtn);
    li.appendChild(actions);
    m2QuestionsList.appendChild(li);
  }
}

function selectRound2Question(questionId) {
  selectedManche2QuestionId = questionId;
  const item = questionId ? manche2Questions?.[questionId] : null;
  if (m2EditorMode) m2EditorMode.textContent = item ? `Édition • Q${item.order || "?"}` : "";
  if (m2WorkInput) m2WorkInput.value = item?.work || "";
  if (m2LocationInput) m2LocationInput.value = item?.location || "";
  if (m2QuestionTextInput) m2QuestionTextInput.value = item?.questionText || "";
  if (m2ImageInput) {
    m2ImageInput.value = "";
    m2ImageInput.required = !item;
  }
  if (m2SaveQuestionBtn) m2SaveQuestionBtn.textContent = item ? "Mettre à jour" : "Enregistrer";
  renderRound2Questions();
}

function sortedRound2Entries() {
  return Object.entries(manche2Questions || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
}

function sortedViewerQuestionsForRound(roundQuestions) {
  return Object.entries(roundQuestions || {}).sort((a, b) => {
    const afterDiff = Number(a[1]?.afterParticipantOrder || 0) - Number(b[1]?.afterParticipantOrder || 0);
    if (afterDiff) return afterDiff;
    return Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0);
  });
}

function buildParticipantViewerSequence(participantEntries, viewerQuestions) {
  const viewersByParticipantOrder = new Map();
  sortedViewerQuestionsForRound(viewerQuestions).forEach(([id, question]) => {
    const afterOrder = Number(question?.afterParticipantOrder || 0);
    if (afterOrder <= 0) return;
    const list = viewersByParticipantOrder.get(afterOrder) || [];
    list.push({ type: "viewer", id, question });
    viewersByParticipantOrder.set(afterOrder, list);
  });

  return participantEntries.flatMap(([id, question], index) => {
    const participantOrder = Number(question?.order || index + 1);
    return [
      { type: "participant", id, question },
      ...(viewersByParticipantOrder.get(participantOrder) || []),
    ];
  });
}

async function activateViewerQuestion(round, questionId, question) {
  const now = Date.now();
  const timerSeconds = Number(question?.timerSeconds || 0);
  await set(ref(db, "rooms/viewers/liveState"), {
    active: true,
    status: "active",
    mode: "viewer-question",
    round,
    questionId,
    settings: question?.settings || {},
    points: Number(question?.points || 1),
    timerSeconds,
    media: question?.imageDataUrl
      ? { kind: "image", fileName: question.fileName || "image" }
      : question?.audioDataUrl
        ? { kind: "audio", fileName: question.audioFileName || "musique" }
        : question?.youtubeUrl
          ? { kind: "youtube", youtubeUrl: question.youtubeUrl, videoId: question.videoId || "" }
          : null,
    startedAt: now,
    endsAt: timerSeconds > 0 ? now + timerSeconds * 1000 : null,
    updatedAt: now,
    updatedBy: currentAdminId || "admin",
  });
}

async function stopViewerQuestion() {
  await update(ref(db, "rooms/viewers/liveState"), {
    active: false,
    status: "stopped",
    endedAt: Date.now(),
    updatedAt: Date.now(),
    updatedBy: currentAdminId || "admin",
  });
}

async function moveRound2Image(step) {
  const participantEntries = sortedRound2Entries();
  const sequence = buildParticipantViewerSequence(participantEntries, manche2ViewerQuestions);
  if (!sequence.length) return;

  const currentViewerId = viewerLiveState?.active && viewerLiveState?.round === "manche2" ? viewerLiveState.questionId : null;
  const currentIndex = currentViewerId
    ? sequence.findIndex((item) => item.type === "viewer" && item.id === currentViewerId)
    : sequence.findIndex((item) => item.type === "participant" && item.id === manche2State?.activeQuestionId);
  const fallbackIndex = currentIndex < 0 ? (step > 0 ? -1 : sequence.length) : currentIndex;
  const nextIndex = Math.max(0, Math.min(sequence.length - 1, fallbackIndex + step));
  const nextItem = sequence[nextIndex];
  if (!nextItem) return;

  if (nextItem.type === "viewer") {
    if (currentViewerId === nextItem.id) return;
    await activateViewerQuestion("manche2", nextItem.id, nextItem.question);
    return;
  }

  if (!currentViewerId && nextItem.id === manche2State?.activeQuestionId) return;
  await stopViewerQuestion();
  await update(ref(db, "rooms/manche2/state"), { activeQuestionId: nextItem.id, updatedAt: Date.now(), updatedBy: currentAdminId });
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
  const buzzerDisabled = Boolean(liveState?.buzzerDisabled);
  const buzzerOpen = Boolean(liveState?.currentQuestionId) && !liveState?.buzzerLocked && !buzzerDisabled && liveState?.currentType !== "viewers";
  buzzerStatus.textContent = liveState?.currentType === "viewers" || buzzerDisabled ? "Désactivé" : buzzerOpen ? "Ouvert" : "Verrouillé";
  lastBuzzStatus.textContent = lockedByName;
}

function updateRound1Status() {
  if (!liveState) return;
  const typeLabel = liveState.currentType === "viewers" ? "Question viewers" : "Question participants";
  const answerLabel = liveState.showAnswer ? "réponse visible" : "réponse cachée";
  const buzzerLabel = liveState.currentType === "viewers" || liveState.buzzerDisabled ? "buzzer off" : liveState.buzzerLocked ? "buzzer verrouillé" : "buzzer ouvert";
  setMessage(roundStatus, `${typeLabel} • ${answerLabel} • ${buzzerLabel}`);

  toggleAnswerBtn.textContent = liveState.showAnswer ? "Masquer la réponse" : "Afficher la réponse";
  const hasQuestion = Boolean(liveState.currentQuestionId);
  toggleAnswerBtn.disabled = !hasQuestion;
  unlockBuzzerBtn.disabled = !hasQuestion || liveState.currentType === "viewers";
  if (disableBuzzerBtn) disableBuzzerBtn.disabled = !hasQuestion || liveState.currentType === "viewers" || liveState.buzzerDisabled;
  markCorrectBtn.disabled = !liveState.lockedBySessionId;
  markWrongBtn.disabled = !liveState.lockedBySessionId || !hasQuestion;
  buzzPlusBtn.disabled = !liveState.lockedBySessionId;
  buzzMinusBtn.disabled = !liveState.lockedBySessionId;
  const orderedQuestions = getRound1OrderedQuestions();
  const currentIndex = orderedQuestions.findIndex((item) => item.id === liveState.currentQuestionId);
  if (round1PrevQuestionBtn) round1PrevQuestionBtn.disabled = !orderedQuestions.length || currentIndex <= 0;
  if (round1NextQuestionBtn) round1NextQuestionBtn.disabled = !orderedQuestions.length || currentIndex === -1 || currentIndex >= orderedQuestions.length - 1;

  const lockedByName = liveState.lockedByNickname || sessionsById[liveState.lockedBySessionId]?.nickname || "Quelqu’un";
  if (liveState.buzzerLocked) {
    buzzLive.textContent = `🔔 ${lockedByName}`;
    buzzPriorityName.textContent = lockedByName;
  } else if (liveState.currentType === "viewers") {
    buzzLive.textContent = "Mode viewers";
    buzzPriorityName.textContent = "Mode viewers";
  } else if (liveState.buzzerDisabled) {
    buzzLive.textContent = "Buzzer désactivé";
    buzzPriorityName.textContent = "Désactivé";
  } else {
    buzzLive.textContent = "En attente";
    buzzPriorityName.textContent = "Personne";
  }
}

async function resetRound2Answers() {
  if (!(await showConfirm("Réinitialiser toutes les réponses écrites de la manche 2 ?", { title: "Réinitialisation manche 2" }))) return;
  await remove(ref(db, "rooms/manche2/answers"));
  setMessage(m2LiveStatus, "Réponses de la manche 2 réinitialisées.", "success");
  showToast("Réponses manche 2 réinitialisées");
}

function renderRound2LiveAnswers() {
  if (!m2LiveAnswers) return;
  const questionId = manche2State?.activeQuestionId || null;
  m2LiveAnswers.innerHTML = "";
  if (!questionId) {
    m2LiveAnswers.innerHTML = "<li class='empty-state'>Aucune image active.</li>";
    return;
  }

  const entries = Object.values(manche2Answers?.[questionId] || {})
    .filter((item) => String(item?.answer || "").trim())
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (!entries.length) {
    m2LiveAnswers.innerHTML = "<li class='empty-state'>Aucune réponse écrite pour cette image.</li>";
    return;
  }

  entries.forEach((item) => {
    const li = document.createElement("li");
    li.className = "answer-item";

    const name = document.createElement("strong");
    name.textContent = item.nickname || item.loginId || item.accountId || "Invité";

    const answer = document.createElement("p");
    answer.textContent = item.answer || "—";

    const meta = document.createElement("small");
    meta.className = "muted";
    meta.textContent = item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

    li.append(name, answer, meta);
    m2LiveAnswers.appendChild(li);
  });
}

function updateRound2Status() {
  const active = manche2State?.activeQuestionId ? manche2Questions[manche2State.activeQuestionId] : null;
  const answerCount = manche2State?.activeQuestionId ? Object.values(manche2Answers?.[manche2State.activeQuestionId] || {}).filter((item) => String(item?.answer || "").trim()).length : 0;
  const statusText = active ? `Image live : ${active.work} • ${answerCount} réponse${answerCount > 1 ? "s" : ""}` : "Aucune image active.";
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
  renderRound2LiveAnswers();
  const entries = sortedRound2Entries();
  const currentIndex = entries.findIndex(([id]) => id === manche2State?.activeQuestionId);
  if (m2LivePrevBtn) m2LivePrevBtn.disabled = currentIndex <= 0;
  if (m2LiveNextBtn) m2LiveNextBtn.disabled = currentIndex < 0 || currentIndex >= entries.length - 1;
}

function formatRound3Timer(ms) {
  return formatTimerDisplay(ms, overlayConfigs.round3Timer?.timerFormat);
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
      const updates = {
        "rooms/manche3/state/activePlayerId": p.id,
        "rooms/manche3/state/activeThemeId": null,
        "rooms/manche3/state/questionIndex": 0,
        "rooms/manche3/state/showAnswer": false,
        "rooms/manche3/state/timerStatus": "idle",
        "rooms/manche3/state/timerRemainingMs": ROUND3_DURATION_MS,
        "rooms/manche3/state/timerEndsAt": null,
        "rooms/manche3/state/turnEnded": false,
        "rooms/manche3/state/updatedAt": Date.now(),
        "rooms/manche3/state/updatedBy": currentAdminId,
      };
      const activeThemeId = manche3State?.activeThemeId;
      if (activeThemeId && manche3Themes?.[activeThemeId]) {
        updates[`rooms/manche3/themes/${activeThemeId}/locked`] = true;
        updates[`rooms/manche3/themes/${activeThemeId}/lockedAt`] = Date.now();
        updates[`rooms/manche3/themes/${activeThemeId}/lockedBy`] = manche3State?.activePlayerId || null;
      }
      await update(ref(db), updates);
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
    m3ThemeList.innerHTML = "<li class='empty-state'>Aucun thème.</li>";
    return;
  }

  for (const [themeId, theme] of entries) {
    const li = document.createElement("li");
    li.className = "question-item";
    const questionEntries = Object.entries(theme.questions || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
    const questions = questionEntries.map((entry) => entry[1]);
    const isActive = manche3State?.activeThemeId === themeId;
    const isLocked = Boolean(theme.locked);
    li.innerHTML = `<div class="question-head"><strong>${theme.name}</strong>${isActive ? '<span class="question-active-chip">Actif</span>' : ''}${isLocked ? '<span class="question-active-chip">Verrouillé</span>' : ''}</div><p class="muted">${questions.length} question(s)</p>`;

    const addForm = document.createElement("form");
    addForm.className = "row";
    const qInput = document.createElement("input");
    qInput.placeholder = "question.mp3";
    qInput.required = true;
    qInput.setAttribute("aria-label", `Ajouter le fichier question au thème ${theme.name}`);
    const answerInput = document.createElement("input");
    answerInput.placeholder = "reponse.mp4";
    answerInput.setAttribute("aria-label", `Ajouter le fichier réponse au thème ${theme.name}`);
    const addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.className = "btn btn-secondary";
    addBtn.textContent = "Ajouter question";
    addForm.append(qInput, answerInput, addBtn);
    addForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const questionFileName = qInput.value.trim();
      const answerFileName = answerInput.value.trim();
      if (!questionFileName) return;
      const qRef = push(ref(db, `rooms/manche3/themes/${themeId}/questions`));
      await set(qRef, { text: questionFileName, questionFileName, answerFileName, order: questions.length + 1, createdAt: Date.now(), createdBy: currentAdminId });
      qInput.value = "";
      answerInput.value = "";
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
        label.textContent = `${idx + 1}. ${q.questionFileName || q.text}${q.answerFileName ? ` → ${q.answerFileName}` : ""}`;
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
        await update(ref(db, "rooms/manche3/state"), { activeThemeId: null, questionIndex: 0, showAnswer: false, updatedAt: Date.now(), updatedBy: currentAdminId });
      }
    });
    actions.append(renameBtn, deleteBtn);

    li.append(addForm, qList, actions);
    m3ThemeList.appendChild(li);
  }
}

async function editRound3Question(themeId, questionId, currentQuestion) {
  const questionFileName = await showPrompt("Modifier le fichier question", {
    title: "Éditer la question manche 3",
    inputLabel: "Question",
    defaultValue: currentQuestion?.questionFileName || currentQuestion?.text || "",
    confirmText: "Suivant",
  });
  if (questionFileName === null) return;
  const nextQuestionFileName = questionFileName.trim();
  if (!nextQuestionFileName) return showToast("Le fichier question est obligatoire.", "error");
  const answerFileName = await showPrompt("Modifier le fichier réponse", {
    title: "Éditer la réponse manche 3",
    inputLabel: "Réponse",
    defaultValue: currentQuestion?.answerFileName || "",
    confirmText: "Enregistrer",
  });
  if (answerFileName === null) return;
  await update(ref(db, `rooms/manche3/themes/${themeId}/questions/${questionId}`), {
    text: nextQuestionFileName,
    questionFileName: nextQuestionFileName,
    answerFileName: answerFileName.trim(),
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
  m3CurrentQuestion.textContent = current?.questionFileName || current?.text || (activeTheme ? "Fin de la liste." : "En attente du choix du thème");
  m3Timer.textContent = formatRound3Timer(remaining);
  if (m3LivePlayer) m3LivePlayer.textContent = getRound3ActivePlayerName();
  if (m3LiveTheme) m3LiveTheme.textContent = activeTheme?.name || "Aucun";
  if (m3LiveQuestion) m3LiveQuestion.textContent = current?.questionFileName || current?.text || (activeTheme ? "Fin de la liste." : "En attente du choix du thème");
  if (m3LiveTimer) m3LiveTimer.textContent = formatRound3Timer(remaining);

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

async function unlockRound3Themes() {
  const updates = {};
  for (const themeId of Object.keys(manche3Themes || {})) {
    updates[`rooms/manche3/themes/${themeId}/locked`] = false;
    updates[`rooms/manche3/themes/${themeId}/lockedAt`] = null;
    updates[`rooms/manche3/themes/${themeId}/lockedBy`] = null;
  }
  if (!Object.keys(updates).length) return;
  updates["rooms/manche3/state/activeThemeId"] = null;
  updates["rooms/manche3/state/questionIndex"] = 0;
  updates["rooms/manche3/state/showAnswer"] = false;
  updates["rooms/manche3/state/updatedAt"] = Date.now();
  updates["rooms/manche3/state/updatedBy"] = currentAdminId;
  await update(ref(db), updates);
  showToast("Thèmes reset");
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
    questionIndex: 0, showAnswer: false, updatedAt: Date.now(), updatedBy: currentAdminId,
  });
}

async function round3Advance(isCorrect) {
  const remaining = round3RemainingMs();
  if (remaining <= 0 || manche3State?.timerStatus === "ended") return;
  if (isCorrect) {
    if (!manche3State?.showAnswer && manche3State?.activePlayerId) await updateParticipantScore(manche3State.activePlayerId, 1);
    await update(ref(db, "rooms/manche3/state"), { showAnswer: true, updatedAt: Date.now(), updatedBy: currentAdminId });
    return;
  }
  await update(ref(db, "rooms/manche3/state"), { questionIndex: Number(manche3State?.questionIndex || 0) + 1, showAnswer: false, updatedAt: Date.now(), updatedBy: currentAdminId });
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
  if (overlayRound3QuestionSizeInput) overlayRound3QuestionSizeInput.value = String(r3.questionMaxFontSizePx);
  if (overlayRound3QuestionMinSizeInput) overlayRound3QuestionMinSizeInput.value = String(r3.questionMinFontSizePx);
  if (overlayRound3PaddingInput) overlayRound3PaddingInput.value = String(r3.questionPaddingPx);
  if (overlayRound3LineHeightInput) overlayRound3LineHeightInput.value = String(r3.questionLineHeight);
  if (overlayRound3ThemeColorInput) overlayRound3ThemeColorInput.value = r3.themeColor;
  if (overlayRound3FontWeightInput) overlayRound3FontWeightInput.value = String(r3.fontWeight);
  if (overlayRound3AlignInput) overlayRound3AlignInput.value = r3.align;
  if (overlayRound3MaxWidthInput) overlayRound3MaxWidthInput.value = String(r3.maxWidthPx);

  const r3Timer = overlayConfigs.round3Timer;
  if (overlayRound3TimerSizeInput) overlayRound3TimerSizeInput.value = String(r3Timer.timerFontSizePx);
  if (overlayRound3TimerColorInput) overlayRound3TimerColorInput.value = r3Timer.timerColor;
  if (overlayRound3TimerCircleColorInput) overlayRound3TimerCircleColorInput.value = r3Timer.timerCircleColor;
  if (overlayRound3TimerFormatInput) overlayRound3TimerFormatInput.value = r3Timer.timerFormat;
  if (overlayRound3TimerFontWeightInput) overlayRound3TimerFontWeightInput.value = String(r3Timer.fontWeight);
  if (overlayRound3TimerAlignInput) overlayRound3TimerAlignInput.value = r3Timer.align;
  if (overlayRound3TimerPaddingInput) overlayRound3TimerPaddingInput.value = String(r3Timer.paddingPx);
  if (overlayRound3TimerLineHeightInput) overlayRound3TimerLineHeightInput.value = String(r3Timer.lineHeight);
  if (overlayRound3TimerMaxWidthInput) overlayRound3TimerMaxWidthInput.value = String(r3Timer.maxWidthPx);

  const r3ThemeOverlay = overlayConfigs.round3ThemeOverlay;
  if (overlayRound3ThemeOverlayTextColorInput) overlayRound3ThemeOverlayTextColorInput.value = r3ThemeOverlay.textColor;
  if (overlayRound3ThemeOverlayBackgroundColorInput) overlayRound3ThemeOverlayBackgroundColorInput.value = r3ThemeOverlay.backgroundColor;
  if (overlayRound3ThemeOverlayActiveBorderColorInput) overlayRound3ThemeOverlayActiveBorderColorInput.value = r3ThemeOverlay.activeBorderColor;
  if (overlayRound3ThemeOverlayFontSizeInput) overlayRound3ThemeOverlayFontSizeInput.value = String(r3ThemeOverlay.fontSizePx);
  if (overlayRound3ThemeOverlayFontWeightInput) overlayRound3ThemeOverlayFontWeightInput.value = String(r3ThemeOverlay.fontWeight);
  if (overlayRound3ThemeOverlayAlignInput) overlayRound3ThemeOverlayAlignInput.value = r3ThemeOverlay.align;
  if (overlayRound3ThemeOverlayColumnsInput) overlayRound3ThemeOverlayColumnsInput.value = String(r3ThemeOverlay.columns);
  if (overlayRound3ThemeOverlayMaxWidthInput) overlayRound3ThemeOverlayMaxWidthInput.value = String(r3ThemeOverlay.maxWidthPx);
  if (overlayRound3ThemeOverlayPaddingInput) overlayRound3ThemeOverlayPaddingInput.value = String(r3ThemeOverlay.paddingPx);
  if (overlayRound3ThemeOverlayColumnGapInput) overlayRound3ThemeOverlayColumnGapInput.value = String(r3ThemeOverlay.columnGapPx);
  if (overlayRound3ThemeOverlayRowGapInput) overlayRound3ThemeOverlayRowGapInput.value = String(r3ThemeOverlay.rowGapPx);
  if (overlayRound3ThemeOverlayBackgroundWidthInput) overlayRound3ThemeOverlayBackgroundWidthInput.value = String(r3ThemeOverlay.itemBackgroundWidthPercent);
  if (overlayRound3ThemeOverlayPaddingYInput) overlayRound3ThemeOverlayPaddingYInput.value = String(r3ThemeOverlay.itemPaddingYPx);
  if (overlayRound3ThemeOverlayPaddingXInput) overlayRound3ThemeOverlayPaddingXInput.value = String(r3ThemeOverlay.itemPaddingXPx);
  if (overlayRound3ThemeOverlayRadiusInput) overlayRound3ThemeOverlayRadiusInput.value = String(r3ThemeOverlay.borderRadiusPx);
  if (overlayRound3ThemeOverlayBorderWidthInput) overlayRound3ThemeOverlayBorderWidthInput.value = String(r3ThemeOverlay.borderWidthPx);
  if (overlayRound3ThemeOverlayLineHeightInput) overlayRound3ThemeOverlayLineHeightInput.value = String(r3ThemeOverlay.lineHeight);
  if (overlayRound3ThemeOverlayLetterSpacingInput) overlayRound3ThemeOverlayLetterSpacingInput.value = String(r3ThemeOverlay.letterSpacingEm);

  const r4 = overlayConfigs.round4;
  if (overlayRound4MaxFontSizeInput) overlayRound4MaxFontSizeInput.value = String(r4.maxFontSizePx);
  if (overlayRound4MinFontSizeInput) overlayRound4MinFontSizeInput.value = String(r4.minFontSizePx);
  if (overlayRound4TextColorInput) overlayRound4TextColorInput.value = r4.textColor;
  if (overlayRound4FontWeightInput) overlayRound4FontWeightInput.value = String(r4.fontWeight);
  if (overlayRound4ShadowInput) overlayRound4ShadowInput.checked = Boolean(r4.textShadow);
  if (overlayRound4AlignInput) overlayRound4AlignInput.value = r4.align;
  if (overlayRound4PaddingInput) overlayRound4PaddingInput.value = String(r4.paddingPx);
  if (overlayRound4LineHeightInput) overlayRound4LineHeightInput.value = String(r4.lineHeight);
  if (overlayRound4MaxWidthInput) overlayRound4MaxWidthInput.value = String(r4.maxWidthPx);

  const r6 = overlayConfigs.round6;
  if (overlayRound6QuestionSizeInput) overlayRound6QuestionSizeInput.value = String(r6.fontSizePx);
  if (overlayRound6QuestionColorInput) overlayRound6QuestionColorInput.value = r6.textColor;
  if (overlayRound6QuestionFontWeightInput) overlayRound6QuestionFontWeightInput.value = String(r6.fontWeight);
  if (overlayRound6QuestionAlignInput) overlayRound6QuestionAlignInput.value = r6.horizontalAlign;
  if (overlayRound6QuestionVerticalAlignInput) overlayRound6QuestionVerticalAlignInput.value = r6.verticalAlign;
  if (overlayRound6QuestionPaddingInput) overlayRound6QuestionPaddingInput.value = String(r6.safePaddingPx);
  if (overlayRound6QuestionMaxWidthInput) overlayRound6QuestionMaxWidthInput.value = String(r6.maxWidthPx);

  const r6Timer = overlayConfigs.round6Timer;
  if (overlayRound6TimerSizeInput) overlayRound6TimerSizeInput.value = String(r6Timer.timerFontSizePx);
  if (overlayRound6TimerColorInput) overlayRound6TimerColorInput.value = r6Timer.timerColor;
  if (overlayRound6TimerLeftRectColorInput) overlayRound6TimerLeftRectColorInput.value = r6Timer.leftRectangleColor;
  if (overlayRound6TimerRightRectColorInput) overlayRound6TimerRightRectColorInput.value = r6Timer.rightRectangleColor;
  if (overlayRound6TimerFormatInput) overlayRound6TimerFormatInput.value = r6Timer.timerFormat;
  if (overlayRound6TimerParticipantXInput) overlayRound6TimerParticipantXInput.value = String(r6Timer.participantXPercent);
  if (overlayRound6TimerParticipantYInput) overlayRound6TimerParticipantYInput.value = String(r6Timer.participantYPercent);
  if (overlayRound6TimerViewerXInput) overlayRound6TimerViewerXInput.value = String(r6Timer.viewerXPercent);
  if (overlayRound6TimerViewerYInput) overlayRound6TimerViewerYInput.value = String(r6Timer.viewerYPercent);

  const r5 = overlayConfigs.round5;
  if (overlayRound5NameSizeInput) overlayRound5NameSizeInput.value = String(r5.nameFontSizePx);
  if (overlayRound5HpSizeInput) overlayRound5HpSizeInput.value = String(r5.hpFontSizePx);
  if (overlayRound5TextColorInput) overlayRound5TextColorInput.value = r5.textColor;
  if (overlayRound5HealthColorInput) overlayRound5HealthColorInput.value = r5.healthColor;
  if (overlayRound5DangerColorInput) overlayRound5DangerColorInput.value = r5.dangerColor;
  if (overlayRound5BarHeightInput) overlayRound5BarHeightInput.value = String(r5.barHeightPx);
  if (overlayRound5CornerRadiusInput) overlayRound5CornerRadiusInput.value = String(r5.cornerRadiusPx);
  if (overlayRound5MaxWidthInput) overlayRound5MaxWidthInput.value = String(r5.maxWidthPx);
  if (overlayRound5ScreenPaddingInput) overlayRound5ScreenPaddingInput.value = String(r5.screenPaddingPx);
  if (overlayRound5BarGapInput) overlayRound5BarGapInput.value = String(r5.barGapPx);
  if (overlayRound5FrameOpacityInput) overlayRound5FrameOpacityInput.value = String(r5.frameOpacity);
  if (overlayRound5DimmedOpacityInput) overlayRound5DimmedOpacityInput.value = String(r5.dimmedOpacity);
  if (overlayRound5MaxHpInput) overlayRound5MaxHpInput.value = String(r5.maxHp);
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
      questionMaxFontSizePx: overlayRound3QuestionSizeInput?.value,
      questionMinFontSizePx: overlayRound3QuestionMinSizeInput?.value,
      questionPaddingPx: overlayRound3PaddingInput?.value,
      questionLineHeight: overlayRound3LineHeightInput?.value,
      themeColor: overlayRound3ThemeColorInput?.value,
      fontWeight: overlayRound3FontWeightInput?.value,
      align: overlayRound3AlignInput?.value,
      maxWidthPx: overlayRound3MaxWidthInput?.value,
    };
  }
  if (roundKey === "round3Timer") {
    return {
      timerFontSizePx: overlayRound3TimerSizeInput?.value,
      timerColor: overlayRound3TimerColorInput?.value,
      timerCircleColor: overlayRound3TimerCircleColorInput?.value,
      timerFormat: overlayRound3TimerFormatInput?.value,
      fontWeight: overlayRound3TimerFontWeightInput?.value,
      align: overlayRound3TimerAlignInput?.value,
      paddingPx: overlayRound3TimerPaddingInput?.value,
      lineHeight: overlayRound3TimerLineHeightInput?.value,
      maxWidthPx: overlayRound3TimerMaxWidthInput?.value,
    };
  }
  if (roundKey === "round3ThemeOverlay") {
    return {
      textColor: overlayRound3ThemeOverlayTextColorInput?.value,
      backgroundColor: overlayRound3ThemeOverlayBackgroundColorInput?.value,
      activeBorderColor: overlayRound3ThemeOverlayActiveBorderColorInput?.value,
      fontSizePx: overlayRound3ThemeOverlayFontSizeInput?.value,
      fontWeight: overlayRound3ThemeOverlayFontWeightInput?.value,
      align: overlayRound3ThemeOverlayAlignInput?.value,
      columns: overlayRound3ThemeOverlayColumnsInput?.value,
      maxWidthPx: overlayRound3ThemeOverlayMaxWidthInput?.value,
      paddingPx: overlayRound3ThemeOverlayPaddingInput?.value,
      columnGapPx: overlayRound3ThemeOverlayColumnGapInput?.value,
      rowGapPx: overlayRound3ThemeOverlayRowGapInput?.value,
      itemBackgroundWidthPercent: overlayRound3ThemeOverlayBackgroundWidthInput?.value,
      itemPaddingYPx: overlayRound3ThemeOverlayPaddingYInput?.value,
      itemPaddingXPx: overlayRound3ThemeOverlayPaddingXInput?.value,
      borderRadiusPx: overlayRound3ThemeOverlayRadiusInput?.value,
      borderWidthPx: overlayRound3ThemeOverlayBorderWidthInput?.value,
      lineHeight: overlayRound3ThemeOverlayLineHeightInput?.value,
      letterSpacingEm: overlayRound3ThemeOverlayLetterSpacingInput?.value,
    };
  }
  if (roundKey === "round4") {
    return {
      maxFontSizePx: overlayRound4MaxFontSizeInput?.value,
      minFontSizePx: overlayRound4MinFontSizeInput?.value,
      textColor: overlayRound4TextColorInput?.value,
      fontWeight: overlayRound4FontWeightInput?.value,
      textShadow: overlayRound4ShadowInput?.checked,
      align: overlayRound4AlignInput?.value,
      paddingPx: overlayRound4PaddingInput?.value,
      lineHeight: overlayRound4LineHeightInput?.value,
      maxWidthPx: overlayRound4MaxWidthInput?.value,
    };
  }
  if (roundKey === "round6") {
    return {
      fontSizePx: overlayRound6QuestionSizeInput?.value,
      textColor: overlayRound6QuestionColorInput?.value,
      fontWeight: overlayRound6QuestionFontWeightInput?.value,
      horizontalAlign: overlayRound6QuestionAlignInput?.value,
      verticalAlign: overlayRound6QuestionVerticalAlignInput?.value,
      safePaddingPx: overlayRound6QuestionPaddingInput?.value,
      maxWidthPx: overlayRound6QuestionMaxWidthInput?.value,
    };
  }
  if (roundKey === "round6Timer") {
    return {
      timerFontSizePx: overlayRound6TimerSizeInput?.value,
      timerColor: overlayRound6TimerColorInput?.value,
      leftRectangleColor: overlayRound6TimerLeftRectColorInput?.value,
      rightRectangleColor: overlayRound6TimerRightRectColorInput?.value,
      timerFormat: overlayRound6TimerFormatInput?.value,
      participantXPercent: overlayRound6TimerParticipantXInput?.value,
      participantYPercent: overlayRound6TimerParticipantYInput?.value,
      viewerXPercent: overlayRound6TimerViewerXInput?.value,
      viewerYPercent: overlayRound6TimerViewerYInput?.value,
    };
  }
  if (roundKey === "round5") {
    return {
      nameFontSizePx: overlayRound5NameSizeInput?.value,
      hpFontSizePx: overlayRound5HpSizeInput?.value,
      textColor: overlayRound5TextColorInput?.value,
      healthColor: overlayRound5HealthColorInput?.value,
      dangerColor: overlayRound5DangerColorInput?.value,
      barHeightPx: overlayRound5BarHeightInput?.value,
      cornerRadiusPx: overlayRound5CornerRadiusInput?.value,
      maxWidthPx: overlayRound5MaxWidthInput?.value,
      screenPaddingPx: overlayRound5ScreenPaddingInput?.value,
      barGapPx: overlayRound5BarGapInput?.value,
      frameOpacity: overlayRound5FrameOpacityInput?.value,
      dimmedOpacity: overlayRound5DimmedOpacityInput?.value,
      maxHp: overlayRound5MaxHpInput?.value,
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
