let db;
let ref;
let set;
let get;
let onValue;
let push;

function createLocalDatabaseAdapter() {
  const prefix = "cinepaff_local_db:";
  const listeners = new Map();
  const normalizePath = (path) => String(path || "").replace(/^\/+|\/+$/g, "");
  const storageKey = (path) => `${prefix}${normalizePath(path)}`;
  const read = (path) => {
    const raw = localStorage.getItem(storageKey(path));
    return raw ? JSON.parse(raw) : null;
  };
  const write = (path, value) => {
    localStorage.setItem(storageKey(path), JSON.stringify(value));
    notify(path);
  };
  const makeSnapshot = (value) => ({ exists: () => value !== null && value !== undefined, val: () => value });
  const readTree = (path) => {
    const current = read(path);
    if (current !== null) return current;

    const root = `${storageKey(path)}/`;
    const tree = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(root)) continue;
      const relative = key.slice(root.length).split("/")[0];
      if (relative && tree[relative] === undefined) tree[relative] = read(`${normalizePath(path)}/${relative}`);
    }
    return Object.keys(tree).length ? tree : null;
  };
  const notify = (changedPath) => {
    const normalized = normalizePath(changedPath);
    listeners.forEach((callbacks, path) => {
      if (normalized === path || normalized.startsWith(`${path}/`) || path.startsWith(`${normalized}/`)) {
        callbacks.forEach((callback) => callback(makeSnapshot(readTree(path))));
      }
    });
  };

  return {
    db: {},
    ref: (_db, path) => ({ path: normalizePath(path) }),
    set: async (target, value) => write(target.path, value),
    get: async (target) => makeSnapshot(readTree(target.path)),
    push: async (target, value) => {
      const key = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      write(`${target.path}/${key}`, value);
      return { key };
    },
    onValue: (target, callback) => {
      const path = normalizePath(target.path);
      if (!listeners.has(path)) listeners.set(path, new Set());
      listeners.get(path).add(callback);
      callback(makeSnapshot(readTree(path)));
      return () => listeners.get(path)?.delete(callback);
    },
  };
}

async function loadDatabaseAdapter() {
  try {
    return await import("./firebase.js");
  } catch (error) {
    console.warn("Firebase indisponible, stockage local actif.", error);
    return createLocalDatabaseAdapter();
  }
}

const adapter = await loadDatabaseAdapter();
({ db, ref, set, get, onValue, push } = adapter);

const $ = (id) => document.getElementById(id);
const state = { user: null, admins: {}, proposals: {}, selected: [null, null], tmdbToken: localStorage.getItem("cinepaff_tmdb_token") || "" };

const els = {
  nav: $("main-nav"), currentUser: $("current-user"), logout: $("logout"), loginView: $("login-view"), appView: $("app-view"),
  loginForm: $("login-form"), loginId: $("login-id"), loginPassword: $("login-password"), loginMessage: $("login-message"),
  tmdbForm: $("tmdb-config-form"), tmdbToken: $("tmdb-token"), tmdbMessage: $("tmdb-message"), proposalForm: $("proposal-form"), proposalMessage: $("proposal-message"),
  proposalList: $("proposal-list"), drawButton: $("draw-button"), drawResult: $("draw-result"), drawMessage: $("draw-message"),
  adminForm: $("admin-form"), newAdminId: $("new-admin-id"), newAdminPassword: $("new-admin-password"), adminMessage: $("admin-message"), adminList: $("admin-list"),
};

function normalizeId(value) { return String(value || "").trim().toUpperCase(); }
function setMessage(el, text = "", type = "") { el.textContent = text; el.className = `message ${type}`.trim(); }
function isAdmin() { return Boolean(state.user && state.admins[state.user.id]); }
function route() { return (location.hash.replace("#/", "") || "proposer").split("?")[0]; }

function createSalt() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `salt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
async function hashPassword(password, salt = createSalt()) {
  const enc = new TextEncoder();
  if (!crypto.subtle) {
    return { salt, hash: btoa(`${salt}:${password}`) };
  }
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 210000, hash: "SHA-256" }, key, 256);
  const hash = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { salt, hash };
}
async function verifyPassword(password, record) {
  const result = await hashPassword(password, record.salt);
  return result.hash === record.hash;
}
async function createUser(id, password, createdBy) {
  const normalized = normalizeId(id);
  const passwordHash = await hashPassword(password);
  await set(ref(db, `cinepaff/users/${normalized}`), { id: normalized, passwordHash, createdBy, createdAt: Date.now() });
}
async function createAdmin(id, password, createdBy) {
  const normalized = normalizeId(id);
  const userSnap = await get(ref(db, `cinepaff/users/${normalized}`));
  if (!userSnap.exists()) await createUser(normalized, password, createdBy);
  await set(ref(db, `cinepaff/admins/${normalized}`), { id: normalized, createdBy, createdAt: Date.now() });
}

function renderSession() {
  const logged = Boolean(state.user);
  els.loginView.classList.toggle("hidden", logged);
  els.appView.classList.toggle("hidden", !logged);
  els.nav.classList.toggle("hidden", !logged);
  els.logout.classList.toggle("hidden", !logged);
  els.currentUser.textContent = logged ? state.user.id : "";
  document.querySelectorAll("[data-admin-only], .admin-action").forEach((el) => el.classList.toggle("hidden", !isAdmin()));
  renderRoute();
}
function renderRoute() {
  if (!state.user) return;
  let current = route();
  if (current === "admins" && !isAdmin()) current = "proposer";
  document.querySelectorAll(".route-view").forEach((view) => view.classList.add("hidden"));
  $(`${current}-view`)?.classList.remove("hidden");
  document.querySelectorAll(".nav a").forEach((link) => link.classList.toggle("active", link.dataset.route === current));
}
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", ['"']: "&quot;" }[char]));
}
function movieLabel(movie) { return `${movie.title}${movie.year ? ` (${movie.year})` : ""}`; }
function renderSelected(index) {
  const box = $(`movie-selected-${index + 1}`);
  const movie = state.selected[index];
  box.innerHTML = movie ? `<span class="movie-title">${escapeHtml(movieLabel(movie))}</span>` : "";
}
function renderProposals() {
  const movies = Object.values(state.proposals).flatMap((proposal) => Object.values(proposal.movies || {}).map((movie) => ({ ...movie, by: proposal.userId })));
  els.proposalList.innerHTML = movies.length ? movies.map((movie) => `<li class="movie-item"><span class="movie-title">${escapeHtml(movieLabel(movie))}</span><span class="movie-meta">${escapeHtml(movie.by)}</span></li>`).join("") : "";
}
function renderAdmins() {
  els.adminList.innerHTML = Object.keys(state.admins).sort().map((id) => `<li class="admin-item">${escapeHtml(id)}</li>`).join("");
}

async function searchTmdb(query) {
  if (!state.tmdbToken) throw new Error("Jeton API requis");
  const url = new URL("https://api.themoviedb.org/3/search/movie");
  url.searchParams.set("query", query);
  url.searchParams.set("language", "fr-FR");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${state.tmdbToken}`, accept: "application/json" } });
  if (!res.ok) throw new Error("TMDB indisponible");
  const data = await res.json();
  return (data.results || []).slice(0, 6).map((movie) => ({ tmdbId: movie.id, title: movie.title, year: (movie.release_date || "").slice(0, 4) }));
}
function bindSearch(index) {
  const input = $(`movie-search-${index + 1}`);
  const results = $(`movie-results-${index + 1}`);
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      results.innerHTML = "";
      if (input.value.trim().length < 2) return;
      try {
        const movies = await searchTmdb(input.value.trim());
        results.innerHTML = movies.map((movie, i) => `<li><button class="result-item" type="button" data-index="${i}"><span class="movie-title">${escapeHtml(movieLabel(movie))}</span></button></li>`).join("");
        results.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
          state.selected[index] = movies[Number(btn.dataset.index)];
          input.value = movieLabel(state.selected[index]);
          results.innerHTML = "";
          renderSelected(index);
        }));
      } catch (error) { results.innerHTML = `<li class="movie-meta">${escapeHtml(error.message)}</li>`; }
    }, 300);
  });
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
  const id = normalizeId(els.loginId.value);
  const password = els.loginPassword.value;
  setMessage(els.loginMessage);
  const userSnap = await get(ref(db, `cinepaff/users/${id}`));
  if (!userSnap.exists()) await createUser(id, password, id === "JOYKIX" ? "system" : id);
  if (id === "JOYKIX") {
    const adminSnap = await get(ref(db, "cinepaff/admins/JOYKIX"));
    if (!adminSnap.exists()) await createAdmin("JOYKIX", password, "system");
  }
  const accountSnap = await get(ref(db, `cinepaff/users/${id}`));
  if (!accountSnap.exists() || !(await verifyPassword(password, accountSnap.val().passwordHash))) return setMessage(els.loginMessage, "Connexion refusée", "error");
  state.user = { id };
  sessionStorage.setItem("cinepaff_user", id);
  els.loginForm.reset();
  renderSession();
  } catch (error) { setMessage(els.loginMessage, error.message || "Erreur", "error"); }
});
els.logout.addEventListener("click", () => { state.user = null; sessionStorage.removeItem("cinepaff_user"); renderSession(); });
els.tmdbToken.value = state.tmdbToken;
els.tmdbForm.addEventListener("submit", (event) => { event.preventDefault(); state.tmdbToken = els.tmdbToken.value.trim(); localStorage.setItem("cinepaff_tmdb_token", state.tmdbToken); setMessage(els.tmdbMessage, "Enregistré", "ok"); });
els.proposalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
  if (!state.selected[0] || !state.selected[1]) return setMessage(els.proposalMessage, "2 films requis", "error");
  await set(ref(db, `cinepaff/proposals/${state.user.id}`), { userId: state.user.id, movies: state.selected, updatedAt: Date.now() });
  state.selected = [null, null];
  els.proposalForm.reset();
  renderSelected(0); renderSelected(1);
  setMessage(els.proposalMessage, "Proposé", "ok");
  } catch (error) { setMessage(els.proposalMessage, error.message || "Erreur", "error"); }
});
els.drawButton.addEventListener("click", async () => {
  try {
  if (!isAdmin()) return;
  const movies = Object.values(state.proposals).flatMap((proposal) => Object.values(proposal.movies || {}).map((movie) => ({ ...movie, by: proposal.userId })));
  if (!movies.length) return setMessage(els.drawMessage, "Aucun film", "error");
  const movie = movies[Math.floor(Math.random() * movies.length)];
  await push(ref(db, "cinepaff/draws"), { movie, drawnBy: state.user.id, drawnAt: Date.now() });
  els.drawResult.innerHTML = `<span class="movie-title">${escapeHtml(movieLabel(movie))}</span><span class="movie-meta">${escapeHtml(movie.by)}</span>`;
  setMessage(els.drawMessage, "Tiré", "ok");
  } catch (error) { setMessage(els.drawMessage, error.message || "Erreur", "error"); }
});
els.adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
  if (!isAdmin()) return;
  const id = normalizeId(els.newAdminId.value);
  if (!id) return;
  await createAdmin(id, els.newAdminPassword.value, state.user.id);
  els.adminForm.reset();
  setMessage(els.adminMessage, "Ajouté", "ok");
  } catch (error) { setMessage(els.adminMessage, error.message || "Erreur", "error"); }
});

bindSearch(0); bindSearch(1);
window.addEventListener("hashchange", renderRoute);
onValue(ref(db, "cinepaff/admins"), (snap) => { state.admins = snap.val() || {}; renderAdmins(); renderSession(); });
onValue(ref(db, "cinepaff/proposals"), (snap) => { state.proposals = snap.val() || {}; renderProposals(); });

const savedUser = normalizeId(sessionStorage.getItem("cinepaff_user"));
if (savedUser) state.user = { id: savedUser };
if (!location.hash) location.hash = "#/proposer";
renderSession();
