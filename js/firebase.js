import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  push,
  onValue,
  update,
  remove,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCIKaDnFa6zFxSxSPgKHzd4lqWVYcpPpRw",
  authDomain: "zogquiz.firebaseapp.com",
  projectId: "zogquiz",
  storageBucket: "zogquiz.firebasestorage.app",
  messagingSenderId: "721305975532",
  appId: "1:721305975532:web:04e1569e3acecc8b6c03c9",
  databaseURL: "https://zogquiz-default-rtdb.europe-west1.firebasedatabase.app",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const DEFAULT_ADMIN = {
  id: "Admin01",
  role: "admin",
  passwordHash: "24f851ca1ef3c674977dc036712cc43537f5e4e443940e97287c9c9d83922e8f", // ZQ!Adm1n_2026#Live
};

const ADMIN_CREDENTIAL_HINT = {
  id: "Admin01",
  password: "ZQ!Adm1n_2026#Live",
};

export async function hashPassword(raw) {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ensureDefaultAdmin() {
  const adminRef = ref(db, `accounts/${DEFAULT_ADMIN.id}`);
  const snap = await get(adminRef);
  if (!snap.exists()) {
    await set(adminRef, DEFAULT_ADMIN);
  }
}

export function normalizeAccountId(id) {
  return (id || "").trim();
}

export function sessionSave(account) {
  localStorage.setItem("zogquiz_session", JSON.stringify(account));
}

export function sessionGet() {
  const raw = localStorage.getItem("zogquiz_session");
  return raw ? JSON.parse(raw) : null;
}

export function sessionClear() {
  localStorage.removeItem("zogquiz_session");
}

export { db, ref, set, get, push, onValue, update, remove, runTransaction, ADMIN_CREDENTIAL_HINT };
