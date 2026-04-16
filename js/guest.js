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

const guestAuthScreen = document.getElementById("guest-auth-screen");
const guestAppRoot = document.getElementById("guest-app");
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
const ROUND1_STATE_PATH = "rooms/manche1/state";
const ROUND1_GUEST_SESSIONS_PATH = "rooms/manche1/guestSessions";
const ROUND1_QUESTION_BLOCKS_PATH = "rooms/manche1/questionBlocks";
const ROUND1_BUZZES_PATH = "rooms/manche1/buzzes";

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

function getCurrentSessionId() {
  return guestAuth.accountId;
}

function getCurrentNickname() {
  return guestAuth.nickname;
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
  } else {
    guestSessionMeta.classList.add("hidden");
    guestTitle.textContent = "";
    buzzerPanel.classList.add("hidden");
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
  clearStoredGuestSession();
  showLoginForm();
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
  writeStoredGuestSession(account);

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
  const sessionRef = ref(db, `${ROUND1_GUEST_SESSIONS_PATH}/${account.accountId}`);
  const sessionSnap = await get(sessionRef);
  const existing = sessionSnap.val() || {};
  const nickname = String(account.displayName || "").trim();

  await set(sessionRef, {
    accountId: account.accountId,
    nickname,
    loginId: account.loginId,
    authVersion: Number(account.authVersion || 1),
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
  renderGuestView();
  refreshButtonState();
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
  const isCurrentPlayer = Boolean(getCurrentSessionId() && activePlayerId === getCurrentSessionId());
  const themeLocked = Boolean(round3State?.activeThemeId);

  m3GuestPlayer.textContent = `Joueur actif : ${activePlayerName}`;
  m3GuestTheme.textContent = `Thème actif : ${activeTheme?.name || "Aucun"}`;

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
    btn.disabled = !isCurrentPlayer || themeLocked || !getCurrentNickname();
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
  if (!guestAuth.account?.active) return { canBuzz: false, message: "Compte désactivé. Contactez l’admin." };
  if (!guestAuth.nickname) return { canBuzz: false, message: "Pseudo d’affichage requis." };
  if (liveRound !== "manche1") return { canBuzz: false, message: "Buzzer indisponible hors manche 1." };
  if (!liveState.currentQuestionId) return { canBuzz: false, message: "Manche inactive : aucune question ouverte." };
  if (liveState.currentType === "viewers") return { canBuzz: false, message: "Buzzer non autorisé en mode viewers." };
  if (currentQuestionBlocked) return { canBuzz: false, message: "Vous avez déjà tenté sur cette question." };
  if (liveState.buzzerLocked && liveState.lockedBySessionId === guestAuth.accountId) {
    return { canBuzz: false, message: "Buzz pris : en attente de validation admin." };
  }
  if (liveState.buzzerLocked) return { canBuzz: false, message: `Buzz déjà pris par ${liveState.lockedByNickname || "un autre joueur"}.` };
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
  if (!fresh.active) {
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

buzzBtn.addEventListener("click", async () => {
  try {
    const validSession = await validateConnectedGuestForBuzz();
    if (!validSession.ok) {
      buzzFeedback.textContent = validSession.reason;
      return;
    }

    const availability = getBuzzAvailability();
    if (!availability.canBuzz) {
      buzzFeedback.textContent = availability.message;
      return;
    }

    const blockedSnap = await get(ref(db, `${ROUND1_QUESTION_BLOCKS_PATH}/${liveState.currentQuestionId}/${guestAuth.accountId}`));
    if (blockedSnap.exists()) {
      currentQuestionBlocked = true;
      refreshButtonState();
      return;
    }

    const stateRef = ref(db, ROUND1_STATE_PATH);
    const tx = await runTransaction(stateRef, (state) => {
      if (!state || !state.currentQuestionId || state.currentType === "viewers" || state.buzzerLocked) return state;
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
      return;
    }

    buzzFeedback.textContent = "Buzz déjà pris.";
  } catch {
    buzzFeedback.textContent = "Erreur réseau Firebase : réessayez.";
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

  if (!fresh.active) {
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
  renderGuestView();
  refreshButtonState();
});

initManche4Guest({ getCurrentSession: () => guestAuth.accountId });
manche5Controller = initManche5Guest();

watchRound1State();
watchingRound1 = true;
renderByRound();
showLoginForm();
tryAutoReconnect();
