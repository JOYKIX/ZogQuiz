import { db, ref, get, set, update, remove } from "./firebase.js";

export const GUEST_ACCOUNTS_PATH = "rooms/manche1/guestAccounts";
export const GUEST_LOGIN_INDEX_PATH = "rooms/manche1/guestLoginIndex";

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 24;

export function normalizeLoginId(rawValue) {
  return String(rawValue || "").trim().toLowerCase();
}

export function normalizeDisplayName(rawValue) {
  return String(rawValue || "").trim().replace(/\s+/g, " ");
}

export function validateDisplayName(rawValue) {
  const value = normalizeDisplayName(rawValue);
  if (!value) {
    return { valid: false, value, reason: "Le pseudo est obligatoire." };
  }
  if (value.length < DISPLAY_NAME_MIN_LENGTH) {
    return { valid: false, value, reason: `Le pseudo doit contenir au moins ${DISPLAY_NAME_MIN_LENGTH} caractères.` };
  }
  if (value.length > DISPLAY_NAME_MAX_LENGTH) {
    return { valid: false, value, reason: `Le pseudo doit contenir au maximum ${DISPLAY_NAME_MAX_LENGTH} caractères.` };
  }
  return { valid: true, value, reason: "" };
}

export async function hashSecret(secret) {
  const payload = new TextEncoder().encode(String(secret || ""));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomId(prefix = "guest") {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}_${timePart}_${randomPart}`;
}

export async function createGuestAccount({ loginId, password, createdBy }) {
  const normalizedLoginId = normalizeLoginId(loginId);
  if (!normalizedLoginId) throw new Error("L’ID de connexion est obligatoire.");
  if (String(password || "").length < 6) throw new Error("Le mot de passe doit contenir au moins 6 caractères.");

  const loginRef = ref(db, `${GUEST_LOGIN_INDEX_PATH}/${normalizedLoginId}`);
  if ((await get(loginRef)).exists()) {
    throw new Error("Cet ID de connexion est déjà utilisé.");
  }

  const accountId = randomId();
  const now = Date.now();
  await set(ref(db, `${GUEST_ACCOUNTS_PATH}/${accountId}`), {
    accountId,
    loginId: normalizedLoginId,
    passwordHash: await hashSecret(password),
    active: true,
    allowDisplayNameChange: false,
    displayName: "",
    authVersion: 1,
    createdAt: now,
    createdBy,
    updatedAt: now,
  });
  await set(loginRef, accountId);
  return accountId;
}

export async function removeGuestAccount(account) {
  if (!account?.accountId) return;
  await Promise.all([
    remove(ref(db, `${GUEST_ACCOUNTS_PATH}/${account.accountId}`)),
    remove(ref(db, `${GUEST_LOGIN_INDEX_PATH}/${normalizeLoginId(account.loginId)}`)),
  ]);
}

export async function setGuestAccountPassword(accountId, password, updatedBy) {
  if (!accountId) throw new Error("Compte invité introuvable.");
  if (String(password || "").length < 6) throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
  const current = (await get(ref(db, `${GUEST_ACCOUNTS_PATH}/${accountId}`))).val();
  if (!current) throw new Error("Compte invité introuvable.");
  await update(ref(db, `${GUEST_ACCOUNTS_PATH}/${accountId}`), {
    passwordHash: await hashSecret(password),
    authVersion: Number(current.authVersion || 0) + 1,
    updatedAt: Date.now(),
    updatedBy,
  });
}

export async function updateGuestDisplayName(accountId, displayName, updatedBy) {
  const validation = validateDisplayName(displayName);
  if (!validation.valid) throw new Error(validation.reason);
  await update(ref(db, `${GUEST_ACCOUNTS_PATH}/${accountId}`), {
    displayName: validation.value,
    updatedAt: Date.now(),
    updatedBy,
  });
  return validation.value;
}
