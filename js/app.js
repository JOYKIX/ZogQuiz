import {
  auth,
  db,
  ref,
  set,
  get,
  onValue,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
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

function normalizeAdminId(rawId) {
  return rawId.trim().toLowerCase();
}

function adminIdToEmail(adminId) {
  return `${adminId}@zogquiz.local`;
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
    const email = adminIdToEmail(adminId);
    const password = document.getElementById("signup-password").value;
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await set(ref(db, `admins/${cred.user.uid}`), {
      adminId,
      email,
      createdAt: Date.now(),
    });
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
    const email = adminIdToEmail(adminId);
    const password = document.getElementById("login-password").value;
    await signInWithEmailAndPassword(auth, email, password);
    authMessage.textContent = "Connexion réussie.";
  } catch (error) {
    authMessage.textContent = `Erreur connexion: ${error.message}`;
  }
});

document.getElementById("logout").addEventListener("click", async () => {
  await signOut(auth);
});

document.getElementById("generate-code").addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const code = makeTempCode(6);
  const minutes = Math.max(1, Number(codeDuration.value || 30));
  const expiresAt = Date.now() + minutes * 60 * 1000;

  await set(ref(db, `rooms/manche1/accessCodes/${code}`), {
    code,
    active: true,
    createdBy: user.uid,
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

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    authSection.classList.remove("hidden");
    dashboard.classList.add("hidden");
    return;
  }

  const adminSnap = await get(ref(db, `admins/${user.uid}`));
  if (!adminSnap.exists()) {
    authMessage.textContent = "Ce compte n'est pas admin.";
    await signOut(auth);
    return;
  }

  authSection.classList.add("hidden");
  dashboard.classList.remove("hidden");
  const adminData = adminSnap.val();
  const displayId = adminData?.adminId || user.email?.split("@")[0] || "admin";
  adminEmail.textContent = `Connecté: ${displayId}`;

  await ensureRoundsSeed(user.uid);
  renderRounds();
  listenCodes();
});
