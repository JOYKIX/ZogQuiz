import { db, ref, onValue, update } from "./firebase.js";
import { CAMERA_CONFIGS_PATH, CAMERA_ROUNDS, CAMERA_ROLE_OPTIONS, normalizeCameraConfig } from "./camera-config.js";

const LABELS = {
  round1: "Manche 1",
  round2: "Manche 2",
  round3: "Manche 3",
  round4: "Manche 4",
  round5: "Manche 5",
  round6: "Manche 6",
};

const root = document.getElementById("camera-config-root");
const status = document.getElementById("camera-config-status");
const configs = {};
let presence = {};
let isHydrating = false;
let saveTimers = {};
let localSaveEchoUntil = {};

function fieldId(roundKey, field, index = null) {
  return index === null ? `camera-${roundKey}-${field}` : `camera-${roundKey}-${index}-${field}`;
}

function setStatus(text, type = "") {
  if (!status) return;
  status.textContent = text;
  status.classList.remove("success", "error", "loading");
  if (type) status.classList.add(type);
}

function getPresenceOptions(selectedGuestId = "") {
  const activeGuests = Object.entries(presence)
    .map(([guestId, item]) => ({ guestId, nickname: item?.nickname || guestId, active: Boolean(item?.active) }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "fr"));
  const selectedExists = activeGuests.some((item) => item.guestId === selectedGuestId);
  const extra = selectedGuestId && !selectedExists ? [{ guestId: selectedGuestId, nickname: selectedGuestId, active: false }] : [];
  return [{ guestId: "", nickname: "Remplissage automatique", active: true }, ...extra, ...activeGuests]
    .map((item) => `<option value="${escapeHtml(item.guestId)}"${item.guestId === selectedGuestId ? " selected" : ""}>${escapeHtml(item.nickname)}${item.guestId ? (item.active ? "" : " · hors ligne") : ""}</option>`)
    .join("");
}

function roleOptions(selectedRole = "auto") {
  return CAMERA_ROLE_OPTIONS.map((option) => `<option value="${option.value}"${option.value === selectedRole ? " selected" : ""}>${option.label}</option>`).join("");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function renderSlot(roundKey, camera, index) {
  const label = camera.label || (camera.role === "auto" ? "" : CAMERA_ROLE_OPTIONS.find((option) => option.value === camera.role)?.label || "");
  return `
    <details class="camera-slot-card" open data-camera-slot="${index}">
      <summary>
        <span>Cam ${index + 1}</span>
        <small>${escapeHtml(label || "Position libre")}</small>
      </summary>
      <div class="camera-config-grid precise-grid">
        <label class="toggle-line"><input id="${fieldId(roundKey, "slotEnabled", index)}" type="checkbox" ${camera.enabled ? "checked" : ""} /> Cam active</label>
        <label>Assignation
          <select id="${fieldId(roundKey, "guestId", index)}">${getPresenceOptions(camera.guestId)}</select>
        </label>
        <label>Rôle / correspondance
          <select id="${fieldId(roundKey, "role", index)}">${roleOptions(camera.role)}</select>
        </label>
        <label>Libellé précis<input id="${fieldId(roundKey, "label", index)}" value="${escapeHtml(camera.label)}" placeholder="ex: Participants manche 3" /></label>
        <label>Position X <input id="${fieldId(roundKey, "x", index)}" type="number" min="-4000" max="4000" step="1" value="${camera.x}" /></label>
        <label>Position Y <input id="${fieldId(roundKey, "y", index)}" type="number" min="-4000" max="4000" step="1" value="${camera.y}" /></label>
        <label>Largeur <input id="${fieldId(roundKey, "width", index)}" type="number" min="80" max="1920" step="1" value="${camera.width}" /></label>
        <label>Hauteur <input id="${fieldId(roundKey, "height", index)}" type="number" min="60" max="1080" step="1" value="${camera.height}" /></label>
        <label>Arrondi <input id="${fieldId(roundKey, "borderRadius", index)}" type="number" min="0" max="240" step="1" value="${camera.borderRadius}" /></label>
        <label>Profondeur Z <input id="${fieldId(roundKey, "zIndex", index)}" type="number" min="0" max="999" step="1" value="${camera.zIndex}" /></label>
        <label>Recadrage
          <select id="${fieldId(roundKey, "fit", index)}">
            <option value="cover"${camera.fit === "cover" ? " selected" : ""}>Remplir (cover)</option>
            <option value="contain"${camera.fit === "contain" ? " selected" : ""}>Entière (contain)</option>
          </select>
        </label>
      </div>
    </details>
  `;
}

function renderRound(roundKey, index) {
  const config = configs[roundKey] || normalizeCameraConfig({});
  return `
    <article class="camera-config-card subpanel compact-panel" data-camera-round="${roundKey}">
      <div class="panel-head compact-head">
        <div>
          <p class="eyebrow">${LABELS[roundKey]}</p>
          <h3>Config cam par manche ${index + 1}</h3>
        </div>
        <label class="toggle-line"><input id="${fieldId(roundKey, "enabled")}" type="checkbox" ${config.enabled ? "checked" : ""} /> Afficher</label>
      </div>
      <div class="camera-config-grid camera-round-settings">
        <label>Nombre de caméras <input id="${fieldId(roundKey, "cameraCount")}" type="number" min="0" max="12" step="1" value="${config.cameraCount}" /></label>
        <label class="toggle-line"><input id="${fieldId(roundKey, "showNames")}" type="checkbox" ${config.showNames ? "checked" : ""} /> Afficher noms / libellés</label>
      </div>
      <p class="muted compact-help">Chaque cam a sa position, taille, arrondi, profondeur et correspondance. Sans assignation, les invités connectés remplissent les slots dans l’ordre.</p>
      <div class="camera-slot-list">${config.cameras.map((camera, slotIndex) => renderSlot(roundKey, camera, slotIndex)).join("")}</div>
      <div class="row">
        <a class="btn btn-secondary" href="cam-overlay-${roundKey}.html" target="_blank" rel="noopener">Ouvrir overlay caméra</a>
      </div>
    </article>
  `;
}

function render() {
  if (!root) return;
  root.innerHTML = CAMERA_ROUNDS.map(renderRound).join("");
}

function getInput(roundKey, field, index = null) {
  return document.getElementById(fieldId(roundKey, field, index));
}

function hydrate(roundKey, config) {
  configs[roundKey] = normalizeCameraConfig(config);
  if (Date.now() < Number(localSaveEchoUntil[roundKey] || 0)) return;
  isHydrating = true;
  render();
  isHydrating = false;
}

function readSlot(roundKey, index) {
  return {
    enabled: getInput(roundKey, "slotEnabled", index)?.checked,
    guestId: getInput(roundKey, "guestId", index)?.value,
    role: getInput(roundKey, "role", index)?.value,
    label: getInput(roundKey, "label", index)?.value,
    x: getInput(roundKey, "x", index)?.value,
    y: getInput(roundKey, "y", index)?.value,
    width: getInput(roundKey, "width", index)?.value,
    height: getInput(roundKey, "height", index)?.value,
    borderRadius: getInput(roundKey, "borderRadius", index)?.value,
    zIndex: getInput(roundKey, "zIndex", index)?.value,
    fit: getInput(roundKey, "fit", index)?.value,
  };
}

function readRound(roundKey) {
  const cameraCount = Number(getInput(roundKey, "cameraCount")?.value || 0);
  return normalizeCameraConfig({
    ...(configs[roundKey] || {}),
    enabled: getInput(roundKey, "enabled")?.checked,
    cameraCount,
    showNames: getInput(roundKey, "showNames")?.checked,
    cameras: Array.from({ length: Math.max(0, Math.min(12, Math.round(cameraCount))) }, (_, index) => readSlot(roundKey, index)),
  });
}

function saveRound(roundKey) {
  clearTimeout(saveTimers[roundKey]);
  setStatus("Sauvegarde caméra…", "loading");
  return new Promise((resolve, reject) => {
    saveTimers[roundKey] = setTimeout(async () => {
      try {
        const previousCount = Number(configs[roundKey]?.cameraCount || 0);
        const next = readRound(roundKey);
        configs[roundKey] = next;
        localSaveEchoUntil[roundKey] = Date.now() + 1200;
        await update(ref(db, `${CAMERA_CONFIGS_PATH}/${roundKey}`), { ...next, updatedAt: Date.now(), updatedBy: "admin" });
        setStatus("Configuration caméras sauvegardée en temps réel.", "success");
        if (previousCount !== next.cameraCount) render();
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 250);
  });
}

if (root) {
  render();
  root.addEventListener("input", (event) => {
    const card = event.target.closest("[data-camera-round]");
    if (!card || isHydrating) return;
    saveRound(card.dataset.cameraRound).catch((error) => setStatus(`Erreur sauvegarde : ${error.message}`, "error"));
  });
  root.addEventListener("change", (event) => {
    const card = event.target.closest("[data-camera-round]");
    if (!card || isHydrating) return;
    saveRound(card.dataset.cameraRound).catch((error) => setStatus(`Erreur sauvegarde : ${error.message}`, "error"));
  });
  CAMERA_ROUNDS.forEach((roundKey) => {
    onValue(ref(db, `${CAMERA_CONFIGS_PATH}/${roundKey}`), (snap) => hydrate(roundKey, snap.val() || {}));
  });
  onValue(ref(db, "guestCameras/presence"), (snap) => {
    presence = snap.val() || {};
    if (!root.contains(document.activeElement)) render();
  });
}
