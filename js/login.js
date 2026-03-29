import { db, ref, get, ensureDefaultAdmin, hashPassword, sessionSave } from "./firebase.js";

const form = document.getElementById("login-form");
const msg = document.getElementById("login-message");

await ensureDefaultAdmin();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "Connexion...";

  const id = document.getElementById("login-id").value.trim();
  const password = document.getElementById("login-password").value;

  const snap = await get(ref(db, `accounts/${id}`));
  if (!snap.exists()) {
    msg.textContent = "Identifiants invalides.";
    return;
  }

  const account = snap.val();
  const hashed = await hashPassword(password);
  if (hashed !== account.passwordHash) {
    msg.textContent = "Identifiants invalides.";
    return;
  }

  sessionSave({ id: account.id, role: account.role });
  window.location.href = account.role === "admin" ? "admin.html" : "buzzer.html";
});
