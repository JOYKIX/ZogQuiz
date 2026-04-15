const MODAL_ROOT_ID = "app-modal-root";
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let modalRoot = null;
let modalQueue = Promise.resolve();

function ensureModalRoot() {
  if (modalRoot) return modalRoot;
  modalRoot = document.getElementById(MODAL_ROOT_ID);
  if (modalRoot) return modalRoot;

  modalRoot = document.createElement("div");
  modalRoot.id = MODAL_ROOT_ID;
  modalRoot.className = "app-modal-root";
  modalRoot.setAttribute("aria-live", "polite");
  document.body.appendChild(modalRoot);
  return modalRoot;
}

function queueModal(renderer) {
  const run = () => new Promise((resolve) => renderer(resolve));
  modalQueue = modalQueue.then(run, run);
  return modalQueue;
}

function openModal(config) {
  return queueModal((resolve) => {
    const root = ensureModalRoot();
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const overlay = document.createElement("div");
    overlay.className = "app-modal-overlay";
    overlay.setAttribute("role", "presentation");

    const dialog = document.createElement("section");
    dialog.className = "app-modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const titleText = config.title || "Information";
    const title = document.createElement("h3");
    title.className = "app-modal-title";
    title.textContent = titleText;

    const titleId = `modal-title-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    title.id = titleId;
    dialog.setAttribute("aria-labelledby", titleId);

    const message = document.createElement("p");
    message.className = "app-modal-message";
    message.textContent = config.message || "";

    const body = document.createElement("div");
    body.className = "app-modal-body";
    body.append(title, message);

    let input = null;
    if (config.kind === "prompt") {
      const inputLabel = document.createElement("label");
      inputLabel.className = "app-modal-input-label";
      inputLabel.textContent = config.inputLabel || "Votre réponse";

      input = document.createElement("input");
      input.className = "app-modal-input";
      input.type = "text";
      input.placeholder = config.placeholder || "";
      input.value = config.defaultValue || "";
      input.autocomplete = "off";

      inputLabel.appendChild(input);
      body.appendChild(inputLabel);
    }

    const actions = document.createElement("footer");
    actions.className = "app-modal-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = config.cancelText || "Annuler";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn btn-primary";
    confirmBtn.textContent = config.confirmText || "OK";

    if (config.kind === "alert") {
      actions.append(confirmBtn);
    } else {
      actions.append(cancelBtn, confirmBtn);
    }

    dialog.append(body, actions);
    overlay.appendChild(dialog);
    root.appendChild(overlay);
    document.body.classList.add("modal-open");

    let isClosed = false;
    const close = (result) => {
      if (isClosed) return;
      isClosed = true;
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.removeEventListener("mousedown", onOverlayMouseDown);
      root.removeChild(overlay);
      if (!root.childElementCount) {
        document.body.classList.remove("modal-open");
      }
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
      resolve(result);
    };

    const onOverlayMouseDown = (event) => {
      if (event.target !== overlay || !config.allowBackdropClose) return;
      const fallback = config.kind === "prompt" ? null : false;
      close(config.kind === "alert" ? true : fallback);
    };

    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      const focusables = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onKeyDown = (event) => {
      trapFocus(event);
      if (event.key === "Escape") {
        if (!config.allowEscapeClose) return;
        const fallback = config.kind === "prompt" ? null : false;
        close(config.kind === "alert" ? true : fallback);
      }
      if (event.key === "Enter" && config.kind === "prompt" && document.activeElement === input) {
        event.preventDefault();
        confirmBtn.click();
      }
    };

    confirmBtn.addEventListener("click", () => {
      if (config.kind === "prompt") {
        const value = input ? input.value : "";
        close(value);
        return;
      }
      close(true);
    });

    cancelBtn.addEventListener("click", () => {
      const fallback = config.kind === "prompt" ? null : false;
      close(fallback);
    });

    overlay.addEventListener("mousedown", onOverlayMouseDown);
    document.addEventListener("keydown", onKeyDown, true);

    const initialFocusTarget = input || confirmBtn;
    window.requestAnimationFrame(() => {
      initialFocusTarget.focus();
      if (input) input.select();
    });
  });
}

export function showAlert(message, options = {}) {
  return openModal({
    kind: "alert",
    message,
    title: options.title || "Information",
    confirmText: options.confirmText || "OK",
    allowBackdropClose: options.allowBackdropClose ?? true,
    allowEscapeClose: options.allowEscapeClose ?? true,
  });
}

export function showConfirm(message, options = {}) {
  return openModal({
    kind: "confirm",
    message,
    title: options.title || "Confirmation",
    confirmText: options.confirmText || "Confirmer",
    cancelText: options.cancelText || "Annuler",
    allowBackdropClose: options.allowBackdropClose ?? true,
    allowEscapeClose: options.allowEscapeClose ?? true,
  });
}

export function showPrompt(message, options = {}) {
  return openModal({
    kind: "prompt",
    message,
    title: options.title || "Saisie",
    inputLabel: options.inputLabel || "Valeur",
    placeholder: options.placeholder || "",
    defaultValue: options.defaultValue || "",
    confirmText: options.confirmText || "Valider",
    cancelText: options.cancelText || "Annuler",
    allowBackdropClose: options.allowBackdropClose ?? false,
    allowEscapeClose: options.allowEscapeClose ?? true,
  });
}
