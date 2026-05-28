import { db, ref, onValue, update } from "./firebase.js";
import { CAMERA_CONFIGS_PATH, CAMERA_ROUNDS, normalizeCameraConfig } from "./camera-config.js";

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
let isHydrating = false;

function fieldId(roundKey, field) {
  return `camera-${roundKey}-${field}`;
}

function setStatus(text, type = "") {
  if (!status) return;
  status.textContent = text;
  status.classList.remove("success", "error", "loading");
  if (type) status.classList.add(type);
}

function render() {
  if (!root) return;
  root.innerHTML = CAMERA_ROUNDS.map((roundKey, index) => `
    <article class="camera-config-card subpanel compact-panel" data-camera-round="${roundKey}">
      <div class="panel-head compact-head">
        <div>
          <p class="eyebrow">${LABELS[roundKey]}</p>
          <h3>Overlay caméra ${index + 1}</h3>
        </div>
        <label class="toggle-line"><input id="${fieldId(roundKey, "enabled")}" type="checkbox" /> Afficher</label>
      </div>
      <div class="camera-config-grid">
        <label>Position X <input id="${fieldId(roundKey, "x")}" type="number" min="-4000" max="4000" step="1" /></label>
        <label>Position Y <input id="${fieldId(roundKey, "y")}" type="number" min="-4000" max="4000" step="1" /></label>
        <label>Largeur <input id="${fieldId(roundKey, "width")}" type="number" min="80" max="1920" step="1" /></label>
        <label>Hauteur <input id="${fieldId(roundKey, "height")}" type="number" min="60" max="1080" step="1" /></label>
        <label>Espacement <input id="${fieldId(roundKey, "gap")}" type="number" min="0" max="300" step="1" /></label>
        <label>Cams par ligne <input id="${fieldId(roundKey, "perRow")}" type="number" min="1" max="12" step="1" /></label>
        <label>Border-radius <input id="${fieldId(roundKey, "borderRadius")}" type="number" min="0" max="240" step="1" /></label>
        <label class="toggle-line"><input id="${fieldId(roundKey, "showNames")}" type="checkbox" /> Noms</label>
      </div>
      <div class="row">
        <a class="btn btn-secondary" href="cam-overlay-${roundKey}.html" target="_blank" rel="noopener">Ouvrir overlay caméra</a>
      </div>
    </article>
  `).join("");

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
}

function getInput(roundKey, field) {
  return document.getElementById(fieldId(roundKey, field));
}

function hydrate(roundKey, config) {
  isHydrating = true;
  const normalized = normalizeCameraConfig(config);
  configs[roundKey] = normalized;
  for (const [field, value] of Object.entries(normalized)) {
    const input = getInput(roundKey, field);
    if (!input) continue;
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = String(value);
  }
  isHydrating = false;
}

function readRound(roundKey) {
  return normalizeCameraConfig({
    enabled: getInput(roundKey, "enabled")?.checked,
    x: getInput(roundKey, "x")?.value,
    y: getInput(roundKey, "y")?.value,
    width: getInput(roundKey, "width")?.value,
    height: getInput(roundKey, "height")?.value,
    gap: getInput(roundKey, "gap")?.value,
    perRow: getInput(roundKey, "perRow")?.value,
    borderRadius: getInput(roundKey, "borderRadius")?.value,
    showNames: getInput(roundKey, "showNames")?.checked,
  });
}

let saveTimers = {};
function saveRound(roundKey) {
  clearTimeout(saveTimers[roundKey]);
  setStatus("Sauvegarde caméra…", "loading");
  return new Promise((resolve, reject) => {
    saveTimers[roundKey] = setTimeout(async () => {
      try {
        const next = readRound(roundKey);
        configs[roundKey] = next;
        await update(ref(db, `${CAMERA_CONFIGS_PATH}/${roundKey}`), { ...next, updatedAt: Date.now(), updatedBy: "admin" });
        setStatus("Configuration caméras sauvegardée en temps réel.", "success");
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 250);
  });
}

if (root) {
  render();
  CAMERA_ROUNDS.forEach((roundKey) => {
    onValue(ref(db, `${CAMERA_CONFIGS_PATH}/${roundKey}`), (snap) => hydrate(roundKey, snap.val() || {}));
  });
}
