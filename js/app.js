import {
  db,
  ref,
  set,
  get,
  onValue,
  ensureRoundsSeed,
  makeTempCode,
  ROUNDS,
} from "./firebase.js";

const authSection = document.getElementById("auth-section");
const dashboard = document.getElementById("dashboard");
const authMessage = document.getElementById("auth-message");
const adminEmail = document.getElementById("admin-email");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");

const roundsGrid = document.getElementById("rounds-grid");
const codesList = document.getElementById("codes-list");
const codeDuration = document.getElementById("code-duration");
const generatedCode = document.getElementById("generated-code");
const SESSION_KEY = "zogquiz_admin_id";

let currentAdminId = null;

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
  adminEmail.textContent = `Connecté: ${adminId}`;
}

function showAuth() {
  authSection.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

document.getElementById("show-login").addEventListener("click", () => {
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
});

document.getElementById("show-signup").addEventListener("click", () => {
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const adminId = normalizeAdminId(document.getElementById("signup-id").value);
    if (!adminId) {
      throw new Error("ID invalide.");
    }
    const password = document.getElementById("signup-password").value;
    if (!password) {
      throw new Error("Mot de passe invalide.");
    }

    const adminRef = ref(db, `admins/${adminId}`);
    const adminSnap = await get(adminRef);
    if (adminSnap.exists()) {
      throw new Error("Cet ID existe déjà.");
    }

    const passwordHash = await hashPassword(password);
    await set(adminRef, {
      adminId,
      passwordHash,
      createdAt: Date.now(),
    });
    setSession(adminId);
    await ensureRoundsSeed(adminId);
    renderRounds();
    listenCodes();
    showDashboard(adminId);
    authMessage.textContent = "Compte admin créé et connecté.";
  } catch (error) {
    authMessage.textContent = `Erreur création: ${error.message}`;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const adminId = normalizeAdminId(document.getElementById("login-id").value);
    if (!adminId) {
      throw new Error("ID invalide.");
    }
    const password = document.getElementById("login-password").value;
    const adminSnap = await get(ref(db, `admins/${adminId}`));
    if (!adminSnap.exists()) {
      throw new Error("ID inconnu.");
    }

    const adminData = adminSnap.val() || {};
    const expectedHash = adminData.passwordHash;
    if (!expectedHash) {
      throw new Error("Compte invalide (hash manquant).");
    }

    const passwordHash = await hashPassword(password);
    if (passwordHash !== expectedHash) {
      throw new Error("Mot de passe incorrect.");
    }

    setSession(adminId);
    await ensureRoundsSeed(adminId);
    renderRounds();
    listenCodes();
    showDashboard(adminId);
    authMessage.textContent = "Connexion réussie.";
  } catch (error) {
    authMessage.textContent = `Erreur connexion: ${error.message}`;
  }
});

document.getElementById("logout").addEventListener("click", async () => {
  clearSession();
  showAuth();
  authMessage.textContent = "Déconnecté.";
});

document.getElementById("generate-code").addEventListener("click", async () => {
  if (!isLoggedIn()) return;

  const code = makeTempCode(6);
  const minutes = Math.max(1, Number(codeDuration.value || 30));
  const expiresAt = Date.now() + minutes * 60 * 1000;

  await set(ref(db, `rooms/manche1/accessCodes/${code}`), {
    code,
    active: true,
    createdBy: currentAdminId,
    createdAt: Date.now(),
    expiresAt,
  });

  generatedCode.textContent = `Code généré: ${code} (expire dans ${minutes} min)`;
});

function renderRounds() {
  roundsGrid.innerHTML = "";
  for (const round of ROUNDS) {
    const item = document.createElement("article");
    item.className = "round-card";
    item.innerHTML = `<h4>${round.toUpperCase()}</h4><p>Structure prête. Contenu à ajouter ensuite.</p>`;
    roundsGrid.appendChild(item);
  }
}

function listenCodes() {
  const codesRef = ref(db, "rooms/manche1/accessCodes");
  onValue(codesRef, (snapshot) => {
    const data = snapshot.val() || {};
    const entries = Object.values(data).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    codesList.innerHTML = "";
    if (entries.length === 0) {
      codesList.innerHTML = "<li>Aucun code pour le moment.</li>";
      return;
    }

    for (const item of entries.slice(0, 20)) {
      const li = document.createElement("li");
      const expired = Date.now() > (item.expiresAt || 0);
      li.textContent = `${item.code} • ${expired ? "expiré" : "actif"} • expire le ${new Date(item.expiresAt).toLocaleString()}`;
      codesList.appendChild(li);
    }
  });
}

async function restoreSession() {
  const savedAdminId = normalizeAdminId(localStorage.getItem(SESSION_KEY) || "");
  if (!savedAdminId) {
    showAuth();
    return;
  }

  const adminSnap = await get(ref(db, `admins/${savedAdminId}`));
  if (!adminSnap.exists()) {
    clearSession();
    showAuth();
    return;
  }

  setSession(savedAdminId);
  await ensureRoundsSeed(savedAdminId);
  renderRounds();
  listenCodes();
  showDashboard(savedAdminId);
}

restoreSession().catch((error) => {
  clearSession();
  showAuth();
  authMessage.textContent = `Erreur session: ${error.message}`;
});
