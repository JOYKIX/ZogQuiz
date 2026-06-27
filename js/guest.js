import { db, ref, get, set, push, onValue, runTransaction, update } from "./firebase.js";
import { createBuzzSoundTrigger } from "./audio.js";
import { initManche4Guest } from "./manche4.js";
import { initMortSubiteGuest } from "./mort-subite.js";
import { initManche6Display } from "./manche6.js";
import { createGuestCameraController, initGuestCameraWall } from "./guest-camera-webrtc.js";
import { createVoiceChatController } from "./voice-chat.js";
import {
  GUEST_ACCOUNTS_PATH,
  GUEST_LOGIN_INDEX_PATH,
  hashSecret,
  normalizeLoginId,
  getGuestLoginIndexKey,
  normalizeBuzzerSoundFile,
  validateDisplayName,
} from "./guest-accounts.js";
import { getDefaultParticipantColor, normalizeParticipantColor } from "./participants.js";

const guestAuthScreen = document.getElementById("guest-auth-screen");
const guestAppRoot = document.getElementById("guest-app");
const round1Root = document.getElementById("guest-round1");
const round2Root = document.getElementById("guest-round2");
const round3Root = document.getElementById("guest-round3");
const round4Root = document.getElementById("guest-round4");
const round5Root = document.getElementById("guest-round5");
const round6Root = document.getElementById("guest-round6");

const guestLoginForm = document.getElementById("guest-login-form");
const guestDisplayNameForm = document.getElementById("guest-display-name-form");
const guestMessage = document.getElementById("guest-message");
const guestSessionMeta = document.getElementById("guest-session-meta");
const guestTitle = document.getElementById("guest-title");
const guestCurrentRoundLabel = document.querySelector(".guest-current-round");
const guestLogoutBtn = document.getElementById("guest-logout");
const buzzerPanel = document.getElementById("buzzer-panel");
const buzzBtn = document.getElementById("buzz-btn");
const buzzFeedback = document.getElementById("buzz-feedback");
const buzzKeybindLabel = document.getElementById("buzz-keybind-label");
const buzzKeybindChangeBtn = document.getElementById("buzz-keybind-change");
const buzzKeybindHint = document.getElementById("buzz-keybind-hint");
const guestCameraPanel = document.getElementById("guest-camera-panel");
const guestCameraToggle = document.getElementById("guest-camera-toggle");
const guestCameraStatus = document.getElementById("guest-camera-status");
const guestCameraPreview = document.getElementById("guest-camera-preview");
const guestCameraDevice = document.getElementById("guest-camera-device");
const guestCameraDeviceField = document.getElementById("guest-camera-device-field");
const guestSelfCameraRender = document.getElementById("guest-self-camera-render");
const guestVoicePanel = document.getElementById("guest-voice-panel");
const guestVoiceJoin = document.getElementById("guest-voice-join");
const guestVoiceMute = document.getElementById("guest-voice-mute");
const guestVoiceKeyChange = document.getElementById("guest-voice-key-change");
const guestVoiceKeyReset = document.getElementById("guest-voice-key-reset");
const guestVoiceKeyLabel = document.getElementById("guest-voice-key-label");
const guestVoiceKeyHint = document.getElementById("guest-voice-key-hint");
const guestVoiceKeyConflict = document.getElementById("guest-voice-key-conflict");
const guestVoiceStatus = document.getElementById("guest-voice-status");
const guestVoiceUsers = document.getElementById("guest-voice-users");
const guestVoiceDevice = document.getElementById("guest-voice-device");
const guestVoiceDeviceField = document.getElementById("guest-voice-device-field");
const guestVoiceMonitor = document.getElementById("guest-voice-monitor");
const guestAdminCameraPanel = document.getElementById("guest-admin-camera-panel");
const guestAdminCameraWall = document.getElementById("guest-admin-camera-wall");
const guestAdminCameraStatus = document.getElementById("guest-admin-camera-status");
const guestAdminCameraRender = document.getElementById("guest-admin-camera-render");
const guestCameraWallPanel = document.getElementById("guest-camera-wall-panel");
const guestCameraWall = document.getElementById("guest-camera-wall");
const guestCameraWallStatus = document.getElementById("guest-camera-wall-status");
const guestParticipantsCameraRender = document.getElementById("guest-participants-camera-render");

const m2Image = document.getElementById("m2-live-image");
const m2Empty = document.getElementById("m2-empty");
const m2AnswerForm = document.getElementById("m2-answer-form");
const m2AnswerInput = document.getElementById("m2-answer-input");
const m2AnswerSubmit = document.getElementById("m2-answer-submit");
const m2AnswerStatus = document.getElementById("m2-answer-status");

const m3GuestStatus = document.getElementById("m3-guest-status");
const m3GuestPlayer = document.getElementById("m3-guest-player");
const m3GuestTheme = document.getElementById("m3-guest-theme");
const m3GuestTimer = document.getElementById("m3-guest-timer");
const m3GuestHelp = document.getElementById("m3-guest-help");
const m3ThemeButtons = document.getElementById("m3-theme-buttons");
const m3AnswerForm = document.getElementById("m3-answer-form");
const m3AnswerInput = document.getElementById("m3-answer-input");
const m3AnswerStatus = document.getElementById("m3-answer-status");

const LEGACY_GUEST_STORAGE_KEY = "zogquiz.guestSession.v2";
const GUEST_CLIENT_STORAGE_KEY = "zogquiz.guestClientId.v1";
const BUZZ_KEYBIND_STORAGE_KEY = "zogquiz.guestBuzzKeybind.v1";
const ROUND1_STATE_PATH = "rooms/manche1/state";
const ROUND1_GUEST_SESSIONS_PATH = "rooms/manche1/guestSessions";
const ROUND1_QUESTION_BLOCKS_PATH = "rooms/manche1/questionBlocks";
const ROUND1_BUZZES_PATH = "rooms/manche1/buzzes";
const GUEST_CLIENT_SESSIONS_PATH = "rooms/manche1/guestClientSessions";
const CLIENT_SESSION_HEARTBEAT_MS = 20000;
const DEFAULT_BUZZ_KEY = "Space";
const ROUND_NAMES = {
  manche1: "Le sprint de Takumi",
  manche2: "L'Enquête de Conan",
  manche3: "L'Examen de Koro-Sensei",
  manche4: "Les musiques de Kōsei",
  manche5: "Le Grand Terrassement",
  manche6: "La Guerre au Sommet",
};

const FRIENDLY_KEY_NAMES = {
  Space: "Espace",
  Enter: "Entrée",
  Escape: "Échap",
  Tab: "Tabulation",
  Backspace: "Retour arrière",
  Delete: "Suppr",
  ArrowUp: "Flèche haut",
  ArrowDown: "Flèche bas",
  ArrowLeft: "Flèche gauche",
  ArrowRight: "Flèche droite",
};

let liveRound = "manche1";
let guestAuth = {
  account: null,
  accountId: null,
  nickname: "",
  status: "logged_out",
};
let liveState = null;
let currentQuestionBlocked = false;
let watchingRound1 = false;
let manche2Questions = {};
let manche2State = null;
let manche2Answers = {};
let lastRenderedRound2QuestionId = null;
let round3State = null;
let round3Themes = {};
let round3Answers = {};
let lastRenderedRound3AnswerKey = null;
let sessionsById = {};
let manche4Controller = null;
let guestCameraController = null;
let guestCameraWallController = null;
let guestVoiceController = null;
let buzzKeybindCode = DEFAULT_BUZZ_KEY;
let isKeybindCaptureActive = false;
let clientSessionHeartbeat = null;
let round3TimerTicker = null;


function safeFirebaseKey(value) {
  return String(value || "").replace(/[.#$\[\]\/]/g, "_").slice(0, 120);
}
function isAccountActive(account) {
  return account?.active !== false;
}

function normalizeBuzzKeyCode(code) {
  return String(code || "").trim() || DEFAULT_BUZZ_KEY;
}

function readStoredBuzzKeybind() {
  try {
    return normalizeBuzzKeyCode(localStorage.getItem(BUZZ_KEYBIND_STORAGE_KEY));
  } catch {
    return DEFAULT_BUZZ_KEY;
  }
}

function writeStoredBuzzKeybind(code) {
  const normalized = normalizeBuzzKeyCode(code);
  try {
    localStorage.setItem(BUZZ_KEYBIND_STORAGE_KEY, normalized);
  } catch {}
  if (guestAuth.accountId) {
    update(ref(db, `${GUEST_ACCOUNTS_PATH}/${guestAuth.accountId}`), {
      buzzKeyCode: normalized,
      updatedAt: Date.now(),
    }).catch(() => {});
    touchRealtimeClientSession();
  }
}

function formatKeybindLabel(code) {
  if (FRIENDLY_KEY_NAMES[code]) return FRIENDLY_KEY_NAMES[code];
  if (!code) return FRIENDLY_KEY_NAMES[DEFAULT_BUZZ_KEY];
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

function renderBuzzKeybind() {
  if (!buzzKeybindLabel) return;
  buzzKeybindLabel.textContent = `Touche actuelle : ${formatKeybindLabel(buzzKeybindCode)}`;
}

function isTypingContext(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  if (tagName === "textarea" || tagName === "select") return true;
  if (tagName !== "input") return false;
  const input = target;
  const inputType = String(input.type || "text").toLowerCase();
  const textLikeTypes = new Set([
    "text",
    "search",
    "email",
    "password",
    "url",
    "tel",
    "number",
    "date",
    "datetime-local",
    "month",
    "time",
    "week",
  ]);
  return textLikeTypes.has(inputType);
}

const triggerBuzzSound = createBuzzSoundTrigger({
  resolveBuzzerFile: (state) => sessionsById[state?.lockedBySessionId]?.buzzerSound || "buzzer.mp3",
});

function createGuestClientId() {
  if (crypto?.randomUUID) return `guest_client_${crypto.randomUUID()}`;
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `guest_client_${Date.now().toString(36)}_${randomPart}`;
}

function readStoredClientId() {
  try {
    return String(localStorage.getItem(GUEST_CLIENT_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function getOrCreateClientId() {
  const existing = readStoredClientId();
  if (existing) return existing;
  const next = safeFirebaseKey(createGuestClientId());
  try {
    localStorage.setItem(GUEST_CLIENT_STORAGE_KEY, next);
  } catch {}
  return next;
}

function writeStoredGuestSession(account) {
  if (!account?.accountId) return;
  try {
    localStorage.setItem(LEGACY_GUEST_STORAGE_KEY, JSON.stringify({
      accountId: account.accountId,
      authVersion: Number(account.authVersion || 1),
      savedAt: Date.now(),
    }));
  } catch {}
}

function clearStoredClientId() {
  try {
    localStorage.removeItem(GUEST_CLIENT_STORAGE_KEY);
    localStorage.removeItem(LEGACY_GUEST_STORAGE_KEY);
  } catch {}
}

function readLegacyStoredGuestSession() {
  try {
    const raw = localStorage.getItem(LEGACY_GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accountId || !parsed?.authVersion) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeRealtimeClientSession(account) {
  writeStoredGuestSession(account);
  const clientId = getOrCreateClientId();
  if (!clientId || !account?.accountId) return;
  await set(ref(db, `${GUEST_CLIENT_SESSIONS_PATH}/${clientId}`), {
    clientId,
    accountId: account.accountId,
    authVersion: Number(account.authVersion || 1),
    buzzKeyCode: normalizeBuzzKeyCode(account.buzzKeyCode || buzzKeybindCode),
    active: true,
    connected: true,
    lastSeenAt: Date.now(),
    createdAt: Date.now(),
  });
}

async function touchRealtimeClientSession() {
  const clientId = readStoredClientId();
  if (!clientId || !guestAuth.accountId) return;
  await update(ref(db, `${GUEST_CLIENT_SESSIONS_PATH}/${clientId}`), {
    accountId: guestAuth.accountId,
    authVersion: Number(guestAuth.account?.authVersion || 1),
    buzzKeyCode: normalizeBuzzKeyCode(buzzKeybindCode),
    active: true,
    connected: true,
    lastSeenAt: Date.now(),
  }).catch(() => {});
}

function startClientSessionHeartbeat() {
  clearInterval(clientSessionHeartbeat);
  if (!isGuestAuthenticated()) return;
  touchRealtimeClientSession();
  clientSessionHeartbeat = setInterval(touchRealtimeClientSession, CLIENT_SESSION_HEARTBEAT_MS);
}

function stopClientSessionHeartbeat() {
  clearInterval(clientSessionHeartbeat);
  clientSessionHeartbeat = null;
}

function deactivateRealtimeClientSession() {
  const clientId = readStoredClientId();
  if (!clientId) return;
  update(ref(db, `${GUEST_CLIENT_SESSIONS_PATH}/${clientId}`), {
    active: false,
    connected: false,
    disconnectedAt: Date.now(),
    lastSeenAt: Date.now(),
  }).catch(() => {});
}

function setGuestMessage(text, type = "default") {
  guestMessage.textContent = text;
  guestMessage.classList.remove("success", "error", "loading");
  if (type !== "default") guestMessage.classList.add(type);
}

function getCurrentSessionId() {
  return guestAuth.accountId;
}

function getCurrentNickname() {
  return guestAuth.nickname;
}

function dispatchGuestAuthChanged() {
  window.dispatchEvent(new CustomEvent("zogquiz:guest-auth-changed", {
    detail: { accountId: guestAuth.accountId, nickname: guestAuth.nickname, status: guestAuth.status },
  }));
}

function isGuestConnected() {
  return Boolean(guestAuth.account && guestAuth.accountId && guestAuth.nickname);
}

function isGuestAuthenticated() {
  return Boolean(guestAuth.account && guestAuth.accountId);
}

function renderGuestView() {
  const authenticated = isGuestAuthenticated();
  const connected = isGuestConnected();
  const showAuth = !authenticated || guestAuth.status === "awaiting_display_name";
  const showApp = authenticated && guestAuth.status !== "awaiting_display_name";

  guestAuthScreen.classList.toggle("hidden", !showAuth);
  guestAppRoot.classList.toggle("hidden", !showApp);

  if (connected) {
    guestSessionMeta.classList.remove("hidden");
    guestTitle.textContent = `Connecté : ${getCurrentNickname()}`;
    buzzerPanel.classList.remove("hidden");
    guestCameraPanel?.classList.remove("hidden");
    guestVoicePanel?.classList.remove("hidden");
    guestAdminCameraPanel?.classList.remove("hidden");
    guestCameraWallPanel?.classList.remove("hidden");
    guestCameraController?.refreshIdentity?.();
    guestVoiceController?.refreshIdentity?.();
    guestCameraWallController?.refresh?.();
  } else {
    guestSessionMeta.classList.add("hidden");
    guestTitle.textContent = "";
    buzzerPanel.classList.add("hidden");
    guestCameraPanel?.classList.add("hidden");
    guestVoicePanel?.classList.add("hidden");
    guestAdminCameraPanel?.classList.add("hidden");
    guestCameraWallPanel?.classList.add("hidden");
    guestCameraWallController?.refresh?.();
  }
}

function showDisplayNameSetup() {
  guestLoginForm.classList.add("hidden");
  guestDisplayNameForm.classList.remove("hidden");
  renderGuestView();
}

function showLoginForm() {
  guestLoginForm.classList.remove("hidden");
  guestDisplayNameForm.classList.add("hidden");
  renderGuestView();
}

function clearCurrentGuest({ reason = "Déconnecté.", type = "default" } = {}) {
  guestAuth = {
    account: null,
    accountId: null,
    nickname: "",
    status: "logged_out",
  };
  currentQuestionBlocked = false;
  stopClientSessionHeartbeat();
  guestCameraController?.stop?.({ keepMessage: true });
  guestVoiceController?.leave?.();
  deactivateRealtimeClientSession();
  clearStoredClientId();
  showLoginForm();
  dispatchGuestAuthChanged();
  setGuestMessage(reason, type);
  renderRound3();
  refreshButtonState();
}

function applyConnectedState(account) {
  const nickname = String(account.displayName || "").trim();
  guestAuth = {
    account,
    accountId: account.accountId,
    nickname,
    status: nickname ? "connected" : "awaiting_display_name",
  };
  buzzKeybindCode = normalizeBuzzKeyCode(account.buzzKeyCode || buzzKeybindCode);
  renderBuzzKeybind();
  startClientSessionHeartbeat();

  dispatchGuestAuthChanged();

  const loginIdInput = document.getElementById("guest-login-id");
  loginIdInput.value = account.loginId || "";

  if (!watchingRound1) {
    watchRound1State();
    watchingRound1 = true;
  }

  if (!nickname) {
    showDisplayNameSetup();
    setGuestMessage("Première connexion : choisissez un pseudo d’affichage.");
    return;
  }

  showLoginForm();
  setGuestMessage("Connexion réussie.", "success");
  renderRound3();
  refreshButtonState();
}

async function getAccountByCredentials(loginId, password) {
  const normalizedLogin = normalizeLoginId(loginId);
  if (!normalizedLogin || !password) return { ok: false, reason: "ID et mot de passe obligatoires." };

  const indexSnap = await get(ref(db, `${GUEST_LOGIN_INDEX_PATH}/${getGuestLoginIndexKey(normalizedLogin)}`));
  if (!indexSnap.exists()) return { ok: false, reason: "Identifiants invalides." };

  const accountId = String(indexSnap.val() || "");
  const accountSnap = await get(ref(db, `${GUEST_ACCOUNTS_PATH}/${accountId}`));
  if (!accountSnap.exists()) return { ok: false, reason: "Compte invité introuvable." };

  const account = accountSnap.val() || {};
  if (!isAccountActive(account)) return { ok: false, reason: "Compte désactivé. Contactez l’admin." };

  const passwordHash = await hashSecret(password);
  if (passwordHash !== account.passwordHash) return { ok: false, reason: "Identifiants invalides." };

  return { ok: true, account: { ...account, accountId } };
}

async function ensureGuestSession(account, { reconnectMessage = "Reconnecté." } = {}) {
  const sessionRef = ref(db, `${ROUND1_GUEST_SESSIONS_PATH}/${account.accountId}`);
  const sessionSnap = await get(sessionRef);
  const existing = sessionSnap.val() || {};
  const nickname = String(account.displayName || "").trim();
  const buzzerSound = normalizeBuzzerSoundFile(account.buzzerSound || existing.buzzerSound || "");
  const color = normalizeParticipantColor(account.color || existing.color, getDefaultParticipantColor(account.accountId));

  await set(sessionRef, {
    accountId: account.accountId,
    nickname,
    loginId: account.loginId,
    authVersion: Number(account.authVersion || 1),
    joinedAt: existing.joinedAt || Date.now(),
    reconnectAt: Date.now(),
    score: Number(existing.score || 0),
    active: isAccountActive(account),
    buzzerSound,
    color,
  });

  await writeRealtimeClientSession(account);
  applyConnectedState(account);
  if (nickname) setGuestMessage(sessionSnap.exists() ? reconnectMessage : "Connecté.", "success");
  return true;
}

guestLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setGuestMessage("Connexion...", "loading");
  const loginId = document.getElementById("guest-login-id").value;
  const password = document.getElementById("guest-password").value;

  const auth = await getAccountByCredentials(loginId, password);
  if (!auth.ok) {
    setGuestMessage(auth.reason, "error");
    return;
  }

  await ensureGuestSession(auth.account);
  guestLoginForm.reset();
  document.getElementById("guest-login-id").value = auth.account.loginId || "";
});

guestDisplayNameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!guestAuth.accountId) return;

  const displayNameInput = document.getElementById("guest-display-name");
  const validation = validateDisplayName(displayNameInput.value);
  if (!validation.valid) {
    setGuestMessage(validation.reason, "error");
    return;
  }

  const allAccountsSnap = await get(ref(db, GUEST_ACCOUNTS_PATH));
  const duplicate = Object.entries(allAccountsSnap.val() || {}).some(([accountId, account]) => {
    if (!account?.displayName) return false;
    if (accountId === guestAuth.accountId) return false;
    return String(account.displayName).trim().toLowerCase() === validation.value.toLowerCase();
  });

  if (duplicate) {
    setGuestMessage("Ce pseudo est déjà utilisé. Choisissez-en un autre.", "error");
    return;
  }

  await update(ref(db, `${GUEST_ACCOUNTS_PATH}/${guestAuth.accountId}`), {
    displayName: validation.value,
    updatedAt: Date.now(),
  });

  guestAuth = {
    ...guestAuth,
    nickname: validation.value,
    account: { ...guestAuth.account, displayName: validation.value },
    status: "connected",
  };
  await ensureGuestSession(guestAuth.account, { reconnectMessage: "Pseudo enregistré." });
  guestDisplayNameForm.reset();
});

guestLogoutBtn.addEventListener("click", () => {
  clearCurrentGuest({ reason: "Déconnecté." });
});

async function restoreAccountFromClientSession(clientId) {
  if (!clientId) return { ok: false, message: "" };
  const clientSnap = await get(ref(db, `${GUEST_CLIENT_SESSIONS_PATH}/${clientId}`));
  const clientSession = clientSnap.val() || {};
  if (!clientSession?.accountId || clientSession.active === false) return { ok: false, message: "" };

  const accountSnap = await get(ref(db, `${GUEST_ACCOUNTS_PATH}/${clientSession.accountId}`));
  if (!accountSnap.exists()) {
    return { ok: false, message: "Session expirée : compte supprimé.", type: "error" };
  }

  const account = accountSnap.val() || {};
  const authVersion = Number(account.authVersion || 1);
  if (!isAccountActive(account)) {
    return { ok: false, message: "Session invalide : compte désactivé.", type: "error" };
  }
  if (authVersion !== Number(clientSession.authVersion || 0)) {
    return { ok: false, message: "Session invalide : mot de passe modifié.", type: "error" };
  }

  await ensureGuestSession({ ...account, accountId: clientSession.accountId }, { reconnectMessage: "Reconnexion automatique réussie." });
  return { ok: true };
}

async function tryAutoReconnect() {
  const clientId = readStoredClientId();
  let restoreError = null;
  if (clientId) {
    const restored = await restoreAccountFromClientSession(clientId);
    if (restored.ok) return true;
    if (restored.message) restoreError = restored;
  }

  const legacyStored = readLegacyStoredGuestSession();
  if (!legacyStored) {
    if (restoreError) {
      clearStoredClientId();
      setGuestMessage(restoreError.message, restoreError.type || "error");
    } else if (clientId) {
      clearStoredClientId();
    }
    return false;
  }

  const accountSnap = await get(ref(db, `${GUEST_ACCOUNTS_PATH}/${legacyStored.accountId}`));
  if (!accountSnap.exists()) {
    clearStoredClientId();
    setGuestMessage("Session expirée : compte supprimé.", "error");
    return false;
  }

  const account = accountSnap.val() || {};
  const authVersion = Number(account.authVersion || 1);
  if (!isAccountActive(account)) {
    clearStoredClientId();
    setGuestMessage("Session invalide : compte désactivé.", "error");
    return false;
  }
  if (authVersion !== Number(legacyStored.authVersion)) {
    clearStoredClientId();
    setGuestMessage("Session invalide : mot de passe modifié.", "error");
    return false;
  }

  await ensureGuestSession({ ...account, accountId: legacyStored.accountId }, { reconnectMessage: "Reconnexion automatique réussie." });
  return true;
}

function normalizeLiveRoundKey(round) {
  const raw = String(round || "manche1").trim().toLowerCase();
  const compact = raw.replace(/[\s_-]+/g, "");
  const aliases = {
    "1": "manche1",
    m1: "manche1",
    r1: "manche1",
    round1: "manche1",
    manche1: "manche1",
    "2": "manche2",
    m2: "manche2",
    r2: "manche2",
    round2: "manche2",
    manche2: "manche2",
    "3": "manche3",
    m3: "manche3",
    r3: "manche3",
    round3: "manche3",
    manche3: "manche3",
    "4": "manche4",
    m4: "manche4",
    r4: "manche4",
    round4: "manche4",
    manche4: "manche4",
    blindtest: "manche4",
    "5": "manche5",
    m5: "manche5",
    r5: "manche5",
    round5: "manche5",
    manche5: "manche5",
    mortsubite: "manche5",
    "6": "manche6",
    m6: "manche6",
    r6: "manche6",
    round6: "manche6",
    manche6: "manche6",
    finale: "manche6",
    final: "manche6",
  };
  return aliases[compact] || raw || "manche1";
}

function getRoundNumber(round) {
  const normalized = normalizeLiveRoundKey(round);
  const match = normalized.match(/manche(\d+)/);
  return match ? match[1] : String(round || "").replace(/\D+/g, "");
}

function formatGuestRoundLabel(round) {
  const normalized = normalizeLiveRoundKey(round);
  const roundNumber = getRoundNumber(normalized);
  const roundPrefix = `MANCHE${roundNumber ? ` ${roundNumber}` : ""}`;
  const roundName = ROUND_NAMES[normalized];
  return roundName ? `${roundPrefix} ${roundName}` : roundPrefix;
}

function renderByRound() {
  const normalizedLiveRound = normalizeLiveRoundKey(liveRound);
  if (guestCurrentRoundLabel) guestCurrentRoundLabel.textContent = formatGuestRoundLabel(normalizedLiveRound);
  const isRound2 = normalizedLiveRound === "manche2";
  const isRound3 = normalizedLiveRound === "manche3";
  const isRound4 = normalizedLiveRound === "manche4";
  const isRound5 = normalizedLiveRound === "manche5";
  const isRound6 = normalizedLiveRound === "manche6";
  round1Root.classList.toggle("hidden", isRound2 || isRound3 || isRound4 || isRound5 || isRound6);
  round2Root.classList.toggle("hidden", !isRound2);
  round3Root.classList.toggle("hidden", !isRound3);
  round4Root.classList.toggle("hidden", !isRound4);
  round5Root?.classList.toggle("hidden", !isRound5);
  round6Root?.classList.toggle("hidden", !isRound6);
  if (!isRound4) manche4Controller?.pauseLocalAudio?.();
  if (isRound2) renderRound2();
  if (isRound3) renderRound3();
  renderGuestView();
  refreshButtonState();
}

function setRound2AnswerStatus(text = "", type = "default") {
  if (!m2AnswerStatus) return;
  m2AnswerStatus.textContent = text;
  m2AnswerStatus.classList.remove("success", "error", "loading");
  if (type !== "default") m2AnswerStatus.classList.add(type);
}

function getActiveRound2Question() {
  return manche2State?.activeQuestionId ? manche2Questions[manche2State.activeQuestionId] : null;
}

function getCurrentRound2Answer() {
  const questionId = manche2State?.activeQuestionId;
  const sessionId = getCurrentSessionId();
  if (!questionId || !sessionId) return null;
  return manche2Answers?.[questionId]?.[sessionId] || null;
}

function renderRound2AnswerForm() {
  if (!m2AnswerForm || !m2AnswerInput) return;
  const questionId = manche2State?.activeQuestionId || null;
  const activeQuestion = getActiveRound2Question();
  const canAnswer = Boolean(questionId && activeQuestion?.imageDataUrl && isGuestConnected());
  m2AnswerForm.classList.toggle("hidden", !canAnswer);
  m2AnswerInput.disabled = !canAnswer;

  if (!canAnswer) {
    lastRenderedRound2QuestionId = questionId;
    m2AnswerInput.value = "";
    if (m2AnswerSubmit) m2AnswerSubmit.disabled = true;
    setRound2AnswerStatus(questionId ? "Connectez-vous pour répondre." : "", questionId ? "error" : "default");
    return;
  }

  const existingAnswer = getCurrentRound2Answer();
  const shouldRefreshInput = questionId !== lastRenderedRound2QuestionId || document.activeElement !== m2AnswerInput;
  if (shouldRefreshInput) m2AnswerInput.value = existingAnswer?.answer || "";
  lastRenderedRound2QuestionId = questionId;

  if (existingAnswer?.answer) {
    m2AnswerInput.disabled = true;
    if (m2AnswerSubmit) m2AnswerSubmit.disabled = true;
    setRound2AnswerStatus("Réponse envoyée. Une seule réponse est autorisée par image.", "success");
  } else {
    m2AnswerInput.disabled = false;
    if (m2AnswerSubmit) m2AnswerSubmit.disabled = false;
    setRound2AnswerStatus("Écrivez votre réponse puis envoyez-la à l’admin.");
  }
}

function renderRound2() {
  const activeQuestion = getActiveRound2Question();
  if (!activeQuestion?.imageDataUrl) {
    m2Image.classList.add("hidden");
    m2Empty.classList.remove("hidden");
    renderRound2AnswerForm();
    return;
  }
  m2Image.src = activeQuestion.imageDataUrl;
  m2Image.classList.remove("hidden");
  m2Empty.classList.add("hidden");
  renderRound2AnswerForm();
}

async function submitRound2Answer(event) {
  event.preventDefault();
  const questionId = manche2State?.activeQuestionId || null;
  const activeQuestion = getActiveRound2Question();
  const answer = String(m2AnswerInput?.value || "").trim();
  if (!isGuestConnected()) return setRound2AnswerStatus("Connexion invitée requise.", "error");
  if (!questionId || !activeQuestion?.imageDataUrl) return setRound2AnswerStatus("Aucune image active pour le moment.", "error");
  if (!answer) return setRound2AnswerStatus("Réponse obligatoire.", "error");

  const existingAnswer = getCurrentRound2Answer();
  if (existingAnswer?.answer) return setRound2AnswerStatus("Réponse déjà envoyée pour cette image.", "error");

  setRound2AnswerStatus("Envoi de la réponse...", "loading");
  const now = Date.now();
  await set(ref(db, `rooms/manche2/answers/${questionId}/${guestAuth.accountId}`), {
    accountId: guestAuth.accountId,
    sessionId: guestAuth.accountId,
    loginId: guestAuth.account?.loginId || "",
    nickname: guestAuth.nickname,
    questionId,
    answer,
    createdAt: existingAnswer?.createdAt || now,
    updatedAt: now,
  });
  setRound2AnswerStatus("Réponse envoyée à l’admin.", "success");
}

function getRound3AnswerKey() {
  const themeId = round3State?.activeThemeId || "";
  if (!themeId) return "";
  return safeFirebaseKey(`${themeId}_${Number(round3State?.questionIndex || 0)}`);
}

function getCurrentRound3Answer() {
  const answerKey = getRound3AnswerKey();
  const sessionId = getCurrentSessionId();
  if (!answerKey || !sessionId) return null;
  return round3Answers?.[answerKey]?.[sessionId] || null;
}

function setRound3AnswerStatus(text = "", type = "default") {
  if (!m3AnswerStatus) return;
  m3AnswerStatus.textContent = text;
  m3AnswerStatus.classList.remove("success", "error", "loading");
  if (type !== "default") m3AnswerStatus.classList.add(type);
}

function getRound3CurrentQuestion(activeTheme) {
  const questions = Object.values(activeTheme?.questions || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  return questions[Number(round3State?.questionIndex || 0)] || null;
}

function getRound3RemainingMs() {
  if (!round3State) return 0;
  if (round3State.timerStatus === "running" && round3State.timerEndsAt) {
    return Math.max(0, Number(round3State.timerEndsAt || 0) - Date.now());
  }
  return Math.max(0, Number(round3State.timerRemainingMs || 0));
}

function formatRound3GuestTimer(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function renderRound3AnswerForm(activeTheme) {
  if (!m3AnswerForm || !m3AnswerInput) return;
  const answerKey = getRound3AnswerKey();
  const currentQuestion = getRound3CurrentQuestion(activeTheme);
  const canAnswer = Boolean(answerKey && currentQuestion && isGuestConnected());
  m3AnswerForm.classList.toggle("hidden", !canAnswer);
  m3AnswerInput.disabled = !canAnswer;

  if (!canAnswer) {
    lastRenderedRound3AnswerKey = answerKey;
    m3AnswerInput.value = "";
    setRound3AnswerStatus(answerKey ? "Connectez-vous pour répondre." : "");
    return;
  }

  const existingAnswer = getCurrentRound3Answer();
  const shouldRefreshInput = answerKey !== lastRenderedRound3AnswerKey || document.activeElement !== m3AnswerInput;
  if (shouldRefreshInput) m3AnswerInput.value = existingAnswer?.answer || "";
  lastRenderedRound3AnswerKey = answerKey;

  if (existingAnswer?.answer) {
    setRound3AnswerStatus("Réponse envoyée. Vous pouvez la modifier puis renvoyer.", "success");
  } else {
    setRound3AnswerStatus("Écrivez votre réponse puis envoyez-la à l’admin.");
  }
}

async function submitRound3Answer(event) {
  event.preventDefault();
  const activeTheme = round3Themes[round3State?.activeThemeId] || null;
  const currentQuestion = getRound3CurrentQuestion(activeTheme);
  const answerKey = getRound3AnswerKey();
  const answer = String(m3AnswerInput?.value || "").trim();
  if (!isGuestConnected()) return setRound3AnswerStatus("Connexion invitée requise.", "error");
  if (!answerKey || !currentQuestion) return setRound3AnswerStatus("Aucune question active pour le moment.", "error");
  if (!answer) return setRound3AnswerStatus("Réponse obligatoire.", "error");

  setRound3AnswerStatus("Envoi de la réponse...", "loading");
  const existingAnswer = getCurrentRound3Answer();
  const now = Date.now();
  await set(ref(db, `rooms/manche3/answers/${answerKey}/${guestAuth.accountId}`), {
    accountId: guestAuth.accountId,
    sessionId: guestAuth.accountId,
    loginId: guestAuth.account?.loginId || "",
    nickname: guestAuth.nickname,
    themeId: round3State.activeThemeId,
    questionIndex: Number(round3State?.questionIndex || 0),
    questionText: currentQuestion.text || "",
    answer,
    createdAt: existingAnswer?.createdAt || now,
    updatedAt: now,
  });
  setRound3AnswerStatus("Réponse envoyée à l’admin.", "success");
}

function renderRound3() {
  const activePlayerId = round3State?.activePlayerId;
  const activePlayerName = sessionsById[activePlayerId]?.nickname || "Aucun";
  const activeTheme = round3Themes[round3State?.activeThemeId] || null;
  const isCurrentPlayer = Boolean(getCurrentSessionId() && activePlayerId === getCurrentSessionId());
  const themeLocked = Boolean(round3State?.activeThemeId);

  m3GuestPlayer.textContent = `Joueur actif : ${activePlayerName}`;
  m3GuestTheme.textContent = `Thème actif : ${activeTheme?.name || "Aucun"}`;
  if (m3GuestTimer) m3GuestTimer.textContent = `Timer : ${formatRound3GuestTimer(getRound3RemainingMs())}`;

  if (!getCurrentSessionId()) {
    m3GuestStatus.textContent = "Connectez-vous d’abord.";
    m3GuestHelp.textContent = "Connectez-vous pour participer.";
  } else if (!getCurrentNickname()) {
    m3GuestStatus.textContent = "Pseudo requis avant de jouer.";
    m3GuestHelp.textContent = "Choisissez votre pseudo d’affichage.";
  } else if (isCurrentPlayer && !themeLocked) {
    m3GuestStatus.textContent = "À vous de choisir un thème.";
    m3GuestHelp.textContent = "Cliquez sur un thème pour commencer.";
  } else if (isCurrentPlayer && themeLocked) {
    m3GuestStatus.textContent = "Thème choisi. En attente de l’admin.";
    m3GuestHelp.textContent = "Le tour est en cours.";
  } else {
    m3GuestStatus.textContent = "Tour d’un autre joueur.";
    m3GuestHelp.textContent = "Attendez votre tour.";
  }

  renderRound3AnswerForm(activeTheme);

  const themes = Object.entries(round3Themes || {}).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  m3ThemeButtons.innerHTML = "";
  if (!themes.length) {
    m3ThemeButtons.innerHTML = "<p class='muted'>Aucun thème disponible.</p>";
    return;
  }

  for (const [id, theme] of themes) {
    const btn = document.createElement("button");
    const isLocked = Boolean(theme.locked);
    btn.className = id === round3State?.activeThemeId ? "btn btn-secondary" : "btn btn-primary";
    btn.textContent = theme.name || "Thème";
    btn.disabled = !isCurrentPlayer || themeLocked || isLocked || !getCurrentNickname();
    btn.setAttribute("aria-pressed", String(id === round3State?.activeThemeId));
    btn.addEventListener("click", async () => {
      if (!isCurrentPlayer || themeLocked) return;
      const result = await runTransaction(ref(db, `rooms/manche3/themes/${id}`), (currentTheme) => {
        if (!currentTheme || currentTheme.locked) return;
        return { ...currentTheme, locked: true, lockedAt: Date.now(), lockedBy: getCurrentSessionId() };
      });
      if (!result.committed) return;
      await update(ref(db, "rooms/manche3/state"), {
        activeThemeId: id,
        questionIndex: 0,
        showAnswer: false,
        timerRemainingMs: Number(round3State?.timerRemainingMs || 90_000),
        timerStatus: round3State?.timerStatus || "idle",
        updatedAt: Date.now(),
      });
    });
    m3ThemeButtons.appendChild(btn);
  }
}

function watchRound1State() {
  onValue(ref(db, ROUND1_STATE_PATH), async (snap) => {
    liveState = snap.val() || {};
    triggerBuzzSound(liveState);
    if (!liveState.currentQuestionId || !getCurrentSessionId()) {
      currentQuestionBlocked = false;
    } else {
      const blockedSnap = await get(ref(db, `${ROUND1_QUESTION_BLOCKS_PATH}/${liveState.currentQuestionId}/${getCurrentSessionId()}`));
      currentQuestionBlocked = blockedSnap.exists();
    }
    refreshButtonState();
  });
}

function getBuzzAvailability() {
  if (!liveState) return { canBuzz: false, message: "Synchronisation en cours." };
  if (!guestAuth.accountId) return { canBuzz: false, message: "Vous n’êtes pas connecté." };
  if (!isAccountActive(guestAuth.account)) return { canBuzz: false, message: "Compte désactivé. Contactez l’admin." };
  if (!guestAuth.nickname) return { canBuzz: false, message: "Pseudo d’affichage requis." };
  if (normalizeLiveRoundKey(liveRound) !== "manche1") return { canBuzz: false, message: "Buzzer indisponible hors manche 1." };
  if (!liveState.currentQuestionId) return { canBuzz: false, message: "Manche inactive : aucune question ouverte." };
  if (liveState.currentType === "viewers") return { canBuzz: false, message: "Buzzer non autorisé en mode viewers." };
  if (liveState.buzzerDisabled) return { canBuzz: false, message: "Buzzer désactivé par l’admin." };
  if (currentQuestionBlocked) return { canBuzz: false, message: "Vous avez déjà tenté sur cette question." };
  if (liveState.buzzerLocked) {
    const buzzedBy = liveState.lockedByNickname || "un autre joueur";
    const suffix = liveState.lockedBySessionId === guestAuth.accountId ? " (vous)" : "";
    return { canBuzz: false, message: `Buzz pris par ${buzzedBy}${suffix}.` };
  }
  return { canBuzz: true, message: "Buzzer ouvert." };
}

function refreshButtonState() {
  if (!buzzBtn) return;
  const availability = getBuzzAvailability();
  buzzBtn.disabled = !availability.canBuzz;
  buzzFeedback.textContent = availability.message;
}

async function validateConnectedGuestForBuzz() {
  if (!guestAuth.accountId) {
    return { ok: false, reason: "Vous n’êtes pas connecté." };
  }

  const accountRef = ref(db, `${GUEST_ACCOUNTS_PATH}/${guestAuth.accountId}`);
  const accountSnap = await get(accountRef);
  if (!accountSnap.exists()) {
    clearCurrentGuest({ reason: "Session invalide : compte supprimé.", type: "error" });
    return { ok: false, reason: "Session invalide : compte supprimé." };
  }

  const fresh = accountSnap.val() || {};
  if (!isAccountActive(fresh)) {
    clearCurrentGuest({ reason: "Compte désactivé par l’admin.", type: "error" });
    return { ok: false, reason: "Compte désactivé." };
  }

  if (Number(fresh.authVersion || 1) !== Number(guestAuth.account?.authVersion || 1)) {
    clearCurrentGuest({ reason: "Session invalide : reconnectez-vous.", type: "error" });
    return { ok: false, reason: "Session invalide." };
  }

  const nickname = String(fresh.displayName || "").trim();
  if (!nickname) {
    guestAuth = {
      ...guestAuth,
      account: { ...fresh, accountId: guestAuth.accountId },
      nickname,
      status: "awaiting_display_name",
    };
    showDisplayNameSetup();
    refreshButtonState();
    return { ok: false, reason: "Pseudo d’affichage requis." };
  }

  guestAuth = {
    ...guestAuth,
    account: { ...fresh, accountId: guestAuth.accountId },
    nickname,
    status: "connected",
  };

  const sessionSnap = await get(ref(db, `${ROUND1_GUEST_SESSIONS_PATH}/${guestAuth.accountId}`));
  if (!sessionSnap.exists() || sessionSnap.val()?.nickname !== nickname) {
    await ensureGuestSession(guestAuth.account, { reconnectMessage: "Session restaurée." });
  }

  return { ok: true };
}

async function attemptBuzz() {
  try {
    const validSession = await validateConnectedGuestForBuzz();
    if (!validSession.ok) {
      buzzFeedback.textContent = validSession.reason;
      return false;
    }

    const availability = getBuzzAvailability();
    if (!availability.canBuzz) {
      buzzFeedback.textContent = availability.message;
      return false;
    }

    const blockedSnap = await get(ref(db, `${ROUND1_QUESTION_BLOCKS_PATH}/${liveState.currentQuestionId}/${guestAuth.accountId}`));
    if (blockedSnap.exists()) {
      currentQuestionBlocked = true;
      refreshButtonState();
      return false;
    }

    const stateRef = ref(db, ROUND1_STATE_PATH);
    const tx = await runTransaction(stateRef, (state) => {
      if (!state || !state.currentQuestionId || state.currentType === "viewers" || state.buzzerLocked || state.buzzerDisabled) return state;
      return {
        ...state,
        buzzerLocked: true,
        lockedBySessionId: guestAuth.accountId,
        lockedByNickname: guestAuth.nickname,
        lockedAt: Date.now(),
        updatedAt: Date.now(),
      };
    });

    if (tx.committed) {
      await push(ref(db, ROUND1_BUZZES_PATH), {
        sessionId: guestAuth.accountId,
        accountId: guestAuth.accountId,
        loginId: guestAuth.account?.loginId || "",
        nickname: guestAuth.nickname,
        questionId: liveState.currentQuestionId || null,
        timestamp: Date.now(),
      });
      buzzFeedback.textContent = "Buzz validé.";
      return true;
    }

    buzzFeedback.textContent = "Buzz déjà pris.";
    return false;
  } catch {
    buzzFeedback.textContent = "Erreur réseau Firebase : réessayez.";
    return false;
  }
}

buzzBtn.addEventListener("click", async () => {
  await attemptBuzz();
});

m2AnswerForm?.addEventListener("submit", submitRound2Answer);
m3AnswerForm?.addEventListener("submit", submitRound3Answer);

buzzKeybindChangeBtn?.addEventListener("click", () => {
  isKeybindCaptureActive = true;
  buzzKeybindHint?.classList.remove("hidden");
  buzzKeybindChangeBtn.textContent = "Appuyez sur une touche…";
});

document.addEventListener("keydown", async (event) => {
  const pressedCode = event.code || event.key;

  if (isKeybindCaptureActive) {
    event.preventDefault();
    if (pressedCode) {
      buzzKeybindCode = pressedCode;
      writeStoredBuzzKeybind(buzzKeybindCode);
      renderBuzzKeybind();
    }
    isKeybindCaptureActive = false;
    buzzKeybindHint?.classList.add("hidden");
    buzzKeybindChangeBtn.textContent = "Changer la touche";
    return;
  }

  if (event.repeat) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (isTypingContext(event.target)) return;
  if (pressedCode !== buzzKeybindCode) return;

  const availability = getBuzzAvailability();
  if (!availability.canBuzz) return;

  event.preventDefault();
  await attemptBuzz();
});

onValue(ref(db, "quiz/state"), (snap) => {
  const state = snap.val() || {};
  liveRound = normalizeLiveRoundKey(state.liveRound || state.activeRound || "manche1");
  renderByRound();
});

onValue(ref(db, "rooms/manche2/questions"), (snap) => {
  manche2Questions = snap.val() || {};
  renderRound2();
});

onValue(ref(db, "rooms/manche2/state"), (snap) => {
  manche2State = snap.val() || {};
  renderRound2();
});

onValue(ref(db, "rooms/manche2/answers"), (snap) => {
  manche2Answers = snap.val() || {};
  renderRound2();
});

onValue(ref(db, "rooms/manche3/state"), (snap) => {
  round3State = snap.val() || {};
  renderRound3();
});

onValue(ref(db, "rooms/manche3/themes"), (snap) => {
  round3Themes = snap.val() || {};
  renderRound3();
});

onValue(ref(db, "rooms/manche3/answers"), (snap) => {
  round3Answers = snap.val() || {};
  renderRound3();
});

onValue(ref(db, ROUND1_GUEST_SESSIONS_PATH), async (snap) => {
  sessionsById = snap.val() || {};
  if (guestAuth.accountId && !sessionsById[guestAuth.accountId] && guestAuth.account) {
    await ensureGuestSession(guestAuth.account, { reconnectMessage: "Session restaurée." });
  }
  renderRound3();
  refreshButtonState();
});

onValue(ref(db, GUEST_ACCOUNTS_PATH), (snap) => {
  const accounts = snap.val() || {};
  if (!guestAuth.accountId) return;
  const fresh = accounts[guestAuth.accountId];
  if (!fresh) {
    clearCurrentGuest({ reason: "Compte supprimé : reconnexion requise.", type: "error" });
    return;
  }

  if (!isAccountActive(fresh)) {
    clearCurrentGuest({ reason: "Compte désactivé par l’admin.", type: "error" });
    return;
  }

  if (Number(fresh.authVersion || 1) !== Number(guestAuth.account?.authVersion || 1)) {
    clearCurrentGuest({ reason: "Mot de passe modifié : reconnectez-vous.", type: "error" });
    return;
  }

  const nickname = String(fresh.displayName || "").trim();
  guestAuth = {
    ...guestAuth,
    account: { ...fresh, accountId: guestAuth.accountId },
    nickname,
    status: nickname ? "connected" : "awaiting_display_name",
  };
  if (fresh.buzzKeyCode) {
    buzzKeybindCode = normalizeBuzzKeyCode(fresh.buzzKeyCode);
    renderBuzzKeybind();
  }
  renderGuestView();
  dispatchGuestAuthChanged();
  refreshButtonState();
});

guestVoiceController = createVoiceChatController({
  getSessionId: getCurrentSessionId,
  getNickname: getCurrentNickname,
  elements: {
    panel: guestVoicePanel,
    join: guestVoiceJoin,
    mute: guestVoiceMute,
    keyChange: guestVoiceKeyChange,
    keyReset: guestVoiceKeyReset,
    keyLabel: guestVoiceKeyLabel,
    keyHint: guestVoiceKeyHint,
    keyConflict: guestVoiceKeyConflict,
    status: guestVoiceStatus,
    users: guestVoiceUsers,
    deviceSelect: guestVoiceDevice,
    deviceField: guestVoiceDeviceField,
    monitor: guestVoiceMonitor,
  },
});

guestCameraController = createGuestCameraController({
  getSessionId: getCurrentSessionId,
  getNickname: getCurrentNickname,
  elements: {
    button: guestCameraToggle,
    status: guestCameraStatus,
    preview: guestCameraPreview,
    deviceSelect: guestCameraDevice,
    deviceField: guestCameraDeviceField,
  },
});

function syncSelfCameraRender() {
  guestCameraPreview?.classList.toggle("render-disabled", !guestSelfCameraRender?.checked);
}

guestSelfCameraRender?.addEventListener("change", syncSelfCameraRender);
syncSelfCameraRender();

guestCameraWallController = initGuestCameraWall({
  adminRoot: guestAdminCameraWall,
  participantsRoot: guestCameraWall,
  adminStatus: guestAdminCameraStatus,
  participantsStatus: guestCameraWallStatus,
  showAdminInput: guestAdminCameraRender,
  showParticipantsInput: guestParticipantsCameraRender,
  getCurrentSessionId,
});

manche4Controller = initManche4Guest({
  getSessionId: getCurrentSessionId,
  getNickname: getCurrentNickname,
});

watchRound1State();
watchingRound1 = true;
renderByRound();
round3TimerTicker = window.setInterval(() => { if (liveRound === "manche3") renderRound3(); }, 500);

buzzKeybindCode = readStoredBuzzKeybind();
renderBuzzKeybind();
setGuestMessage("Reconnexion en cours…", "loading");
tryAutoReconnect().then((reconnected) => {
  if (!reconnected && !isGuestAuthenticated()) showLoginForm();
}).catch(() => {
  if (!isGuestAuthenticated()) {
    showLoginForm();
    setGuestMessage("Reconnexion impossible : reconnectez-vous.", "error");
  }
});

initMortSubiteGuest({
  getCurrentSessionId,
  getBuzzKeyCode: () => buzzKeybindCode,
  isTypingContext,
});
initManche6Display({ prefix: "m6-guest" });
