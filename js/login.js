import {
  db,
  ref,
  get,
  ensureDefaultAdmin,
  hashPassword,
  sessionSave,
  ADMIN_CREDENTIAL_HINT,
  normalizeAccountId,
} from "./firebase.js";

const form = document.getElementById("login-form");
const msg = document.getElementById("login-message");
const submitBtn = document.getElementById("login-submit");
const adminId = document.getElementById("admin-id");
const adminPassword = document.getElementById("admin-password");
const fillAdminBtn = document.getElementById("fill-admin");
const idInput = document.getElementById("login-id");
const passwordInput = document.getElementById("login-password");

adminId.textContent = ADMIN_CREDENTIAL_HINT.id;
adminPassword.textContent = ADMIN_CREDENTIAL_HINT.password;

fillAdminBtn.addEventListener("click", () => {
  idInput.value = ADMIN_CREDENTIAL_HINT.id;
  passwordInput.value = ADMIN_CREDENTIAL_HINT.password;
  msg.textContent = "Identifiants admin pré-remplis.";
});

async function getAccount(id) {
  const normalizedId = normalizeAccountId(id);
  const primary = await get(ref(db, `accounts/${normalizedId}`));
  if (primary.exists()) return primary.val();

  if (normalizedId.toLowerCase() === ADMIN_CREDENTIAL_HINT.id.toLowerCase()) {
    const fallback = await get(ref(db, `accounts/${ADMIN_CREDENTIAL_HINT.id}`));
    if (fallback.exists()) return fallback.val();
  }

  return null;
}

try {
  await ensureDefaultAdmin();
} catch {
  msg.textContent = "⚠️ Impossible de vérifier le compte admin (réseau Firebase indisponible).";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = normalizeAccountId(idInput.value);
  const password = passwordInput.value;

  if (!id || !password) {
    msg.textContent = "Renseigne un identifiant et un mot de passe.";
    return;
  }

  submitBtn.disabled = true;
  msg.textContent = "Connexion en cours...";

  try {
    const account = await getAccount(id);
    if (!account) {
      msg.textContent = "Identifiants invalides.";
      return;
    }

    const hashed = await hashPassword(password);
    if (hashed !== account.passwordHash) {
      msg.textContent = "Identifiants invalides.";
      return;
    }

    sessionSave({ id: account.id, role: account.role });
    msg.textContent = "Connexion réussie ✅";
    window.location.href = account.role === "admin" ? "admin.html" : "buzzer.html";
  } catch {
    msg.textContent = "Erreur de connexion (Firebase indisponible). Vérifie internet et réessaie.";
  } finally {
    submitBtn.disabled = false;
  }
});
