import { db, ref, get, set, push, onValue, runTransaction, update } from "./firebase.js";
import { createBuzzSoundTrigger } from "./audio.js";
import { initManche4Guest } from "./manche4.js";
import { initManche5Guest } from "./manche5.js";
import {
  GUEST_ACCOUNTS_PATH,
  GUEST_LOGIN_INDEX_PATH,
  hashSecret,
  normalizeLoginId,
  validateDisplayName,
} from "./guest-accounts.js";

const round1Root = document.getElementById("guest-round1");
const round2Root = document.getElementById("guest-round2");
const round3Root = document.getElementById("guest-round3");
const round4Root = document.getElementById("guest-round4");
const round5Root = document.getElementById("guest-round5");

const guestLoginForm = document.getElementById("guest-login-form");
const guestDisplayNameForm = document.getElementById("guest-display-name-form");
const guestMessage = document.getElementById("guest-message");
const guestSessionMeta = document.getElementById("guest-session-meta");
const guestTitle = document.getElementById("guest-title");
const guestLogoutBtn = document.getElementById("guest-logout");
const buzzerPanel = document.getElementById("buzzer-panel");
const buzzBtn = document.getElementById("buzz-btn");
const buzzFeedback = document.getElementById("buzz-feedback");

const m2Image = document.getElementById("m2-live-image");
const m2Empty = document.getElementById("m2-empty");

const m3GuestStatus = document.getElementById("m3-guest-status");
const m3GuestPlayer = document.getElementById("m3-guest-player");
const m3GuestTheme = document.getElementById("m3-guest-theme");
const m3GuestHelp = document.getElementById("m3-guest-help");
const m3ThemeButtons = document.getElementById("m3-theme-buttons");

const GUEST_STORAGE_KEY = "zogquiz.guestSession.v2";

let liveRound = "manche1";
let currentSession = null;
let currentAccount = null;
let currentNickname = "";
let liveState = null;
let currentQuestionBlocked = false;
let watchingRound1 = false;
let manche2Questions = {};
let manche2State = null;
let round3State = null;
let round3Themes = {};
let sessionsById = {};
let manche5Controller = null;

const triggerBuzzSound = createBuzzSoundTrigger();

function readStoredGuestSession() {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accountId || !parsed?.authVersion) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredGuestSession(account) {
  localStorage.setItem(
    GUEST_STORAGE_KEY,
    JSON.stringify({
      accountId: account.accountId,
      authVersion: Number(account.authVersion || 1),
      updatedAt: Date.now(),
    })
  );
}

function clearStoredGuestSession() {
  localStorage.removeItem(GUEST_STORAGE_KEY);
}

function setGuestMessage(text, type = "default") {
  guestMessage.textContent = text;
  guestMessage.classList.remove("success", "error", "loading");
  if (type !== "default") guestMessage.classList.add(type);
}

function normalizeSessionState() {
  if (currentAccount && currentNickname) {
    guestSessionMeta.classList.remove("hidden");
    guestTitle.textContent = `Connecté : ${currentNickname}`;
    buzzerPanel.classList.remove("hidden");
  } else {
    guestSessionMeta.classList.add("hidden");
    guestTitle.textContent = "";
    buzzerPanel.classList.add("hidden");
  }
}

function showDisplayNameSetup() {
  guestLoginForm.classList.add("hidden");
  guestDisplayNameForm.classList.remove("hidden");
  normalizeSessionState();
}

function showLoginForm() {
  guestLoginForm.classList.remove("hidden");
  guestDisplayNameForm.classList.add("hidden");
  normalizeSessionState();
}

function applyConnectedState(account) {
  currentAccount = account;
  currentSession = account.accountId;
  currentNickname = String(account.displayName || "").trim();
  writeStoredGuestSession(account);

  const loginIdInput = document.getElementById("guest-login-id");
  loginIdInput.value = account.loginId || "";

  if (!watchingRound1) {
    watchRound1State();
    watchingRound1 = true;
  }

  if (!currentNickname) {
    showDisplayNameSetup();
    setGuestMessage("Première connexion : choisissez un pseudo d’affichage.");
    return;
  }

  showLoginForm();
  setGuestMessage("Connexion réussie.", "success");
  renderRound3();
}

async function getAccountByCredentials(loginId, password) {
  const normalizedLogin = normalizeLoginId(loginId);
  if (!normalizedLogin || !password) return { ok: false, reason: "ID et mot de passe obligatoires." };

  const indexSnap = await get(ref(db, `${GUEST_LOGIN_INDEX_PATH}/${normalizedLogin}`));
  if (!indexSnap.exists()) return { ok: false, reason: "Identifiants invalides." };

  const accountId = String(indexSnap.val() || "");
  const accountSnap = await get(ref(db, `${GUEST_ACCOUNTS_PATH}/${accountId}`));
  if (!accountSnap.exists()) return { ok: false, reason: "Compte invité introuvable." };

  const account = accountSnap.val() || {};
  if (!account.active) return { ok: false, reason: "Compte désactivé. Contactez l’admin." };

  const passwordHash = await hashSecret(password);
  if (passwordHash !== account.passwordHash) return { ok: false, reason: "Identifiants invalides." };

  return { ok: true, account: { ...account, accountId } };
}

async function ensureGuestSession(account, { reconnectMessage = "Reconnecté." } = {}) {
  const sessionRef = ref(db, `rooms/manche1/guestSessions/${account.accountId}`);
  const sessionSnap = await get(sessionRef);
  const existing = sessionSnap.val() || {};
  const nickname = String(account.displayName || "").trim();

  await set(sessionRef, {
    accountId: account.accountId,
    nickname,
    loginId: account.loginId,
    joinedAt: existing.joinedAt || Date.now(),
    reconnectAt: Date.now(),
    score: Number(existing.score || 0),
    active: Boolean(account.active),
  });

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
  if (!currentAccount?.accountId) return;

  const displayNameInput = document.getElementById("guest-display-name");
  const validation = validateDisplayName(displayNameInput.value);
  if (!validation.valid) {
    setGuestMessage(validation.reason, "error");
    return;
  }

  const allAccountsSnap = await get(ref(db, GUEST_ACCOUNTS_PATH));
  const duplicate = Object.values(allAccountsSnap.val() || {}).some((account) => {
    if (!account?.displayName) return false;
    if (account.accountId === currentAccount.accountId) return false;
    return String(account.displayName).trim().toLowerCase() === validation.value.toLowerCase();
  });

  if (duplicate) {
    setGuestMessage("Ce pseudo est déjà utilisé. Choisissez-en un autre.", "error");
    return;
  }

  await update(ref(db, `${GUEST_ACCOUNTS_PATH}/${currentAccount.accountId}`), {
    displayName: validation.value,
    updatedAt: Date.now(),
  });

  currentNickname = validation.value;
  currentAccount = { ...currentAccount, displayName: validation.value };
  await ensureGuestSession(currentAccount, { reconnectMessage: "Pseudo enregistré." });
  guestDisplayNameForm.reset();
});

guestLogoutBtn.addEventListener("click", () => {
  currentSession = null;
  currentAccount = null;
  currentNickname = "";
  currentQuestionBlocked = false;
  clearStoredGuestSession();
  showLoginForm();
  setGuestMessage("Déconnecté.");
  renderRound3();
  refreshButtonState();
});

async function tryAutoReconnect() {
  const stored = readStoredGuestSession();
  if (!stored) return;

  const accountSnap = await get(ref(db, `${GUEST_ACCOUNTS_PATH}/${stored.accountId}`));
  if (!accountSnap.exists()) {
    clearStoredGuestSession();
    setGuestMessage("Session expirée : compte supprimé.", "error");
    return;
  }

  const account = accountSnap.val() || {};
  const authVersion = Number(account.authVersion || 1);
  if (!account.active) {
    clearStoredGuestSession();
    setGuestMessage("Session invalide : compte désactivé.", "error");
    return;
  }
  if (authVersion !== Number(stored.authVersion)) {
    clearStoredGuestSession();
    setGuestMessage("Session invalide : mot de passe modifié.", "error");
    return;
  }

  await ensureGuestSession({ ...account, accountId: stored.accountId }, { reconnectMessage: "Reconnexion automatique réussie." });
}

function renderByRound() {
  const isRound2 = liveRound === "manche2";
  const isRound3 = liveRound === "manche3";
  const isRound4 = liveRound === "manche4";
  const isRound5 = liveRound === "manche5";
  round1Root.classList.toggle("hidden", isRound2 || isRound3 || isRound4 || isRound5);
  round2Root.classList.toggle("hidden", !isRound2);
  round3Root.classList.toggle("hidden", !isRound3);
  round4Root.classList.toggle("hidden", !isRound4);
  round5Root.classList.toggle("hidden", !isRound5);
  if (!isRound5) manche5Controller?.pauseLocalAudio?.();
  if (isRound2) renderRound2();
  if (isRound3) renderRound3();
}

function renderRound2() {
  const activeQuestion = manche2State?.activeQuestionId ? manche2Questions[manche2State.activeQuestionId] : null;
  if (!activeQuestion?.imageDataUrl) {
    m2Image.classList.add("hidden");
    m2Empty.classList.remove("hidden");
    return;
  }
  m2Image.src = activeQuestion.imageDataUrl;
  m2Image.classList.remove("hidden");
  m2Empty.classList.add("hidden");
}

function renderRound3() {
  const activePlayerId = round3State?.activePlayerId;
  const activePlayerName = sessionsById[activePlayerId]?.nickname || "Aucun";
  const activeTheme = round3Themes[round3State?.activeThemeId] || null;
  const isCurrentPlayer = Boolean(currentSession && activePlayerId === currentSession);
  const themeLocked = Boolean(round3State?.activeThemeId);

  m3GuestPlayer.textContent = `Joueur actif : ${activePlayerName}`;
  m3GuestTheme.textContent = `Thème actif : ${activeTheme?.name || "Aucun"}`;

  if (!currentSession) {
    m3GuestStatus.textContent = "Connectez-vous d’abord.";
    m3GuestHelp.textContent = "Connectez-vous pour participer.";
  } else if (!currentNickname) {
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

  const themes = Object.entries(round3Themes || {}).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  m3ThemeButtons.innerHTML = "";
  if (!themes.length) {
    m3ThemeButtons.innerHTML = "<p class='muted'>Aucun thème disponible.</p>";
    return;
  }

  for (const [id, theme] of themes) {
    const btn = document.createElement("button");
    btn.className = id === round3State?.activeThemeId ? "btn btn-secondary" : "btn btn-primary";
    btn.textContent = theme.name || "Thème";
    btn.disabled = !isCurrentPlayer || themeLocked || !currentNickname;
    btn.setAttribute("aria-pressed", String(id === round3State?.activeThemeId));
    btn.addEventListener("click", async () => {
      if (!isCurrentPlayer) return;
      await update(ref(db, "rooms/manche3/state"), {
        activeThemeId: id,
        questionIndex: 0,
        timerRemainingMs: Number(round3State?.timerRemainingMs || 90_000),
        timerStatus: round3State?.timerStatus || "idle",
        updatedAt: Date.now(),
      });
    });
    m3ThemeButtons.appendChild(btn);
  }
}

function watchRound1State() {
  onValue(ref(db, "rooms/manche1/state"), async (snap) => {
    liveState = snap.val() || {};
    triggerBuzzSound(liveState);
    if (!liveState.currentQuestionId || !currentSession) {
      currentQuestionBlocked = false;
    } else {
      const blockedSnap = await get(ref(db, `rooms/manche1/questionBlocks/${liveState.currentQuestionId}/${currentSession}`));
      currentQuestionBlocked = blockedSnap.exists();
    }
    refreshButtonState();
  });
}

function refreshButtonState() {
  if (!liveState || !buzzBtn) return;
  if (!currentSession || !currentNickname) {
    buzzBtn.disabled = true;
    buzzFeedback.textContent = "Connectez-vous pour buzzer.";
    return;
  }
  if (liveState.currentType === "viewers") {
    buzzBtn.disabled = true;
    buzzFeedback.textContent = "Mode viewers";
    return;
  }
  if (currentQuestionBlocked) {
    buzzBtn.disabled = true;
    buzzFeedback.textContent = "Déjà tenté";
    return;
  }
  if (liveState.buzzerLocked) {
    buzzBtn.disabled = liveState.lockedBySessionId !== currentSession;
    buzzFeedback.textContent = liveState.lockedBySessionId === currentSession ? "En attente admin" : `${liveState.lockedByNickname || "Quelqu'un"} a buzzé`;
    return;
  }
  buzzBtn.disabled = false;
  buzzFeedback.textContent = "Buzzer ouvert";
}

buzzBtn.addEventListener("click", async () => {
  if (!currentSession || !currentNickname || !liveState || liveState.currentType === "viewers") return;

  const blockedSnap = await get(ref(db, `rooms/manche1/questionBlocks/${liveState.currentQuestionId}/${currentSession}`));
  if (blockedSnap.exists()) {
    currentQuestionBlocked = true;
    refreshButtonState();
    return;
  }

  const stateRef = ref(db, "rooms/manche1/state");
  const tx = await runTransaction(stateRef, (state) => {
    if (!state || state.currentType === "viewers" || state.buzzerLocked) return state;
    return {
      ...state,
      buzzerLocked: true,
      lockedBySessionId: currentSession,
      lockedByNickname: currentNickname,
      lockedAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  if (tx.committed) {
    await push(ref(db, "rooms/manche1/buzzes"), {
      sessionId: currentSession,
      nickname: currentNickname,
      questionId: liveState.currentQuestionId || null,
      timestamp: Date.now(),
    });
    buzzFeedback.textContent = "Buzz validé";
  } else {
    buzzFeedback.textContent = "Trop tard";
  }
});

onValue(ref(db, "quiz/state"), (snap) => {
  const state = snap.val() || {};
  liveRound = state.liveRound || state.activeRound || "manche1";
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

onValue(ref(db, "rooms/manche3/state"), (snap) => {
  round3State = snap.val() || {};
  renderRound3();
});

onValue(ref(db, "rooms/manche3/themes"), (snap) => {
  round3Themes = snap.val() || {};
  renderRound3();
});

onValue(ref(db, "rooms/manche1/guestSessions"), async (snap) => {
  sessionsById = snap.val() || {};
  if (currentSession && !sessionsById[currentSession] && currentAccount) {
    await ensureGuestSession(currentAccount, { reconnectMessage: "Session restaurée." });
  }
  renderRound3();
});

onValue(ref(db, GUEST_ACCOUNTS_PATH), (snap) => {
  const accounts = snap.val() || {};
  if (!currentAccount?.accountId) return;
  const fresh = accounts[currentAccount.accountId];
  if (!fresh) {
    currentAccount = null;
    currentSession = null;
    currentNickname = "";
    clearStoredGuestSession();
    showLoginForm();
    setGuestMessage("Compte supprimé : reconnexion requise.", "error");
    return;
  }

  if (!fresh.active) {
    currentAccount = null;
    currentSession = null;
    currentNickname = "";
    clearStoredGuestSession();
    showLoginForm();
    setGuestMessage("Compte désactivé par l’admin.", "error");
    return;
  }

  if (Number(fresh.authVersion || 1) !== Number(currentAccount.authVersion || 1)) {
    currentAccount = null;
    currentSession = null;
    currentNickname = "";
    clearStoredGuestSession();
    showLoginForm();
    setGuestMessage("Mot de passe modifié : reconnectez-vous.", "error");
    return;
  }

  currentAccount = { ...fresh, accountId: currentAccount.accountId };
  currentNickname = String(fresh.displayName || "").trim();
  normalizeSessionState();
});

initManche4Guest({ getCurrentSession: () => currentSession });
manche5Controller = initManche5Guest();

watchRound1State();
watchingRound1 = true;
renderByRound();
showLoginForm();
tryAutoReconnect();
