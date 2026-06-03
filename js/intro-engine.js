(function () {
  "use strict";

  const ANIMATION_CLASSES = [
    "anim-titleReveal",
    "anim-cardsSlide",
    "anim-softZoom",
    "anim-controlledFlash",
    "anim-rulesReveal",
    "anim-timerPulse",
    "anim-streamSweep",
    "anim-buzzerHit",
    "anim-lockSnap",
    "anim-imageFocus",
    "anim-soundWave",
    "anim-hpDrain",
    "anim-duelClash",
    "anim-speedBurst",
    "anim-clueScan",
    "anim-examStamp",
    "anim-pianoKeys",
    "anim-earthRumble",
    "anim-summitWar"
  ];

  const state = {
    config: null,
    roundId: null,
    isPlaying: false,
    startedAt: 0,
    sceneTimers: [],
    progressTimer: 0,
    activeSceneIndex: -1,
    voiceEnabled: true,
    selectedVoice: null,
    speechSupported: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window
  };

  const el = {};

  document.addEventListener("DOMContentLoaded", initIntro);

  function initIntro() {
    cacheElements();
    state.roundId = document.body.dataset.round || "round1";
    state.config = window.INTRO_ROUNDS && window.INTRO_ROUNDS[state.roundId];

    if (!state.config) {
      setStatus("Configuration introuvable pour cette manche.");
      return;
    }

    applyConfig(state.config);
    bindControls();
    prepareSpeechVoices();
    showScene(state.config.scenes[0], 0, { speak: false });
    updateControls();
  }

  function cacheElements() {
    [
      "roundLabel", "title", "subtitle", "concept", "sceneVisual", "visualTitle",
      "subtitleBox", "progressBar", "status", "startOverlay", "finalOverlay",
      "startTitle", "startText", "finalTitle", "finalText", "supportWarning",
      "startButton", "skipButton", "replayButton", "voiceToggle", "finalReplayButton",
      "returnButton", "stage", "app"
    ].forEach((key) => {
      el[key] = document.querySelector(`[data-intro-${kebab(key)}]`);
    });
  }

  function bindControls() {
    document.querySelectorAll("[data-intro-start-button]").forEach((button) => button.addEventListener("click", startIntro));
    document.querySelectorAll("[data-intro-skip-button]").forEach((button) => button.addEventListener("click", finishIntro));
    document.querySelectorAll("[data-intro-replay-button], [data-intro-final-replay-button]").forEach((button) => button.addEventListener("click", replayIntro));
    document.querySelectorAll("[data-intro-voice-toggle]").forEach((button) => button.addEventListener("click", toggleVoice));
    document.querySelectorAll("[data-intro-return-button]").forEach((button) => {
      button.addEventListener("click", () => {
        window.location.href = button.dataset.href || "index.html";
      });
    });
  }

  function applyConfig(config) {
    const splitTitle = emphasizeTitle(config.title, config.accentWord);
    document.title = `${config.roundLabel} · ${config.title} · Intro ZogQuiz`;
    setText(el.roundLabel, config.roundLabel);
    if (el.title) el.title.innerHTML = splitTitle;
    setText(el.subtitle, config.subtitle);
    setText(el.concept, config.concept);
    setText(el.visualTitle, config.roundLabel);
    setText(el.startTitle, config.title);
    setText(el.startText, "Cliquez pour lancer une intro cinématique avec sous-titres rythmés et narration française calibrée pour un rendu plus naturel.");
    setText(el.finalTitle, `${config.title} peut commencer`);
    setText(el.finalText, "La scène est posée. Les joueurs peuvent entrer en jeu.");

    const theme = config.theme || {};
    setCssVar("--intro-primary", theme.primary);
    setCssVar("--intro-yellow", theme.secondary);
    setCssVar("--intro-orange", theme.accent);

    if (el.supportWarning && !state.speechSupported) {
      el.supportWarning.hidden = false;
      el.supportWarning.textContent = "Synthèse vocale indisponible sur ce navigateur : les sous-titres restent actifs.";
    }
  }

  function startIntro() {
    resetIntro();
    state.isPlaying = true;
    state.startedAt = performance.now();
    state.activeSceneIndex = -1;
    el.startOverlay.hidden = true;
    el.finalOverlay.hidden = true;
    el.app?.classList.remove("is-idle", "is-finished");
    el.app?.classList.add("is-playing");
    setStatus("Intro en cours…");

    state.config.scenes.forEach((scene, index) => {
      const timer = window.setTimeout(() => showScene(scene, index, { speak: true }), scene.delay || 0);
      state.sceneTimers.push(timer);
    });

    state.progressTimer = window.setInterval(updateProgress, 100);
    state.sceneTimers.push(window.setTimeout(finishIntro, state.config.duration));
    updateControls();
  }

  function replayIntro() {
    resetIntro();
    el.startOverlay.hidden = false;
    el.finalOverlay.hidden = true;
    startIntro();
  }

  function finishIntro() {
    if (!state.config) return;
    clearTimers();
    stopSpeech();
    state.isPlaying = false;
    state.activeSceneIndex = state.config.scenes.length - 1;
    el.progressBar.style.width = "100%";
    el.finalOverlay.hidden = false;
    el.startOverlay.hidden = true;
    el.app?.classList.remove("is-playing", "is-idle");
    el.app?.classList.add("is-finished");
    setText(el.subtitleBox, `${state.config.title} peut commencer. Prêts ?`);
    setStatus("Intro terminée.");
    updateControls();
  }

  function resetIntro() {
    clearTimers();
    stopSpeech();
    state.isPlaying = false;
    state.activeSceneIndex = -1;
    el.progressBar.style.width = "0%";
    el.app?.classList.remove("is-playing", "is-finished");
    el.app?.classList.add("is-idle");
  }

  function clearTimers() {
    state.sceneTimers.forEach((timer) => window.clearTimeout(timer));
    state.sceneTimers = [];
    window.clearInterval(state.progressTimer);
    state.progressTimer = 0;
  }

  function showScene(scene, index, options = {}) {
    if (!scene) return;
    state.activeSceneIndex = index;
    setText(el.subtitleBox, scene.subtitle || scene.text || "");
    setText(el.visualTitle, `${state.config.roundLabel} · Scène ${index + 1}`);
    renderVisual(scene);
    applyAnimation(scene.animation);
    setStatus(`Scène ${index + 1}/${state.config.scenes.length}`);

    if (options.speak && state.voiceEnabled) {
      speak(scene);
    }
  }

  function renderVisual(scene) {
    if (!el.sceneVisual) return;
    const visual = scene.visual || "token";
    const rules = scene.rules || state.config.rules || [];
    const cardLabels = scene.cards || ["?", "!", "✓"];

    if (visual === "speed") {
      el.sceneVisual.innerHTML = `<div class="scene-art scene-speed" aria-hidden="true"><div class="speed-road"><span>${escapeHtml(scene.token || "GO")}</span><i></i><i></i><i></i></div><div class="speed-hud"><strong>APEX</strong><span>BUZZ READY</span></div></div>`;
      return;
    }

    if (visual === "detective") {
      el.sceneVisual.innerHTML = `<div class="scene-art scene-detective" aria-hidden="true"><div class="case-board"><div class="case-lens">${escapeHtml(scene.token || "?")}</div><span class="clue a"></span><span class="clue b"></span><span class="clue c"></span><i></i></div></div>`;
      return;
    }

    if (visual === "exam") {
      el.sceneVisual.innerHTML = `<div class="scene-art scene-exam" aria-hidden="true"><div class="exam-board"><span>EXAMEN</span><strong>${escapeHtml(scene.timer || "1:30")}</strong><em>KORO</em></div><div class="chalk-lines"><i></i><i></i><i></i></div></div>`;
      return;
    }

    if (visual === "piano") {
      el.sceneVisual.innerHTML = `<div class="scene-art scene-piano" aria-hidden="true"><div class="piano-stage"><div class="music-note">${escapeHtml(scene.token || "♪")}</div><div class="piano-keys"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></div>`;
      return;
    }

    if (visual === "rumbling") {
      el.sceneVisual.innerHTML = `<div class="scene-art scene-rumbling" aria-hidden="true"><div class="rumble-wall"><span>${escapeHtml(scene.token || "PV")}</span><i></i><i></i><i></i><i></i></div><div class="crack-line"></div></div>`;
      return;
    }

    if (visual === "summit") {
      el.sceneVisual.innerHTML = `<div class="scene-art scene-summit" aria-hidden="true"><div class="summit-peak"><span>${escapeHtml(scene.token || "VS")}</span></div><div class="summit-flags"><i></i><strong>FINAL</strong><i></i></div></div>`;
      return;
    }

    if (visual === "cards") {
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="card-row">${cardLabels.map((label) => `<div class="quiz-card">${escapeHtml(label)}</div>`).join("")}</div></div>`;
      return;
    }

    if (visual === "rules") {
      el.sceneVisual.innerHTML = `<div class="scene-art"><ul class="rules-list">${rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul></div>`;
      return;
    }

    if (visual === "timer") {
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="timer-ring"><span>${escapeHtml(scene.timer || "30")}</span></div></div>`;
      return;
    }

    if (visual === "spark") {
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="sparkline"></div><div class="card-row"><div class="quiz-card">LIVE</div><div class="quiz-card">OBS</div></div></div>`;
      return;
    }

    if (visual === "buzzer") {
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="buzzer-pad"><span>BUZZ</span></div><div class="lock-line"><span>Joueur A</span><strong>LOCK</strong><span>Joueur B</span></div></div>`;
      return;
    }

    if (visual === "lock") {
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="lock-visual"><div class="lock-shackle"></div><div class="lock-body">MAIN</div></div></div>`;
      return;
    }

    if (visual === "imageFrame") {
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="image-frame"><div class="image-sun"></div><div class="image-mountain one"></div><div class="image-mountain two"></div><span>${escapeHtml(scene.token || "IMG")}</span></div></div>`;
      return;
    }

    if (visual === "answerFlow") {
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="answer-flow">${cardLabels.map((label, index) => `<div class="answer-step"><span>${index + 1}</span><strong>${escapeHtml(label)}</strong></div>`).join("")}</div></div>`;
      return;
    }

    if (visual === "themeGrid") {
      const labels = cardLabels.length ? cardLabels : ["Thème", "Question", "Score"];
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="theme-grid">${labels.concat(["Anime", "Manga", scene.timer || "1:30"]).slice(0, 6).map((label) => `<div>${escapeHtml(label)}</div>`).join("")}</div></div>`;
      return;
    }

    if (visual === "audio") {
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="audio-visual"><div class="play-disc"><span>${escapeHtml(scene.token || "♪")}</span></div><div class="wave-bars"><i></i><i></i><i></i><i></i><i></i></div></div></div>`;
      return;
    }

    if (visual === "hp") {
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="hp-board"><div class="hp-line"><span>Joueur A</span><strong style="--hp: 82%"></strong></div><div class="hp-line danger"><span>Joueur B</span><strong style="--hp: 34%"></strong></div><div class="hp-hit">-${escapeHtml(scene.damage || "PV")}</div></div></div>`;
      return;
    }

    if (visual === "duel") {
      el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="duel-board"><div class="duel-player">P1</div><strong>VS</strong><div class="duel-player viewer">VIEWER</div></div></div>`;
      return;
    }

    el.sceneVisual.innerHTML = `<div class="scene-art" aria-hidden="true"><div class="big-token">${escapeHtml(scene.token || state.config.roundLabel.replace(/\D/g, "") || "GO")}</div></div>`;
  }

  function applyAnimation(animation) {
    if (!el.stage) return;
    el.stage.classList.remove(...ANIMATION_CLASSES);
    // Force a reflow so the same animation can replay on consecutive scenes.
    void el.stage.offsetWidth;
    el.stage.classList.add(`anim-${animation || "softZoom"}`);
  }

  function updateProgress() {
    if (!state.isPlaying) return;
    const elapsed = performance.now() - state.startedAt;
    const ratio = Math.min(1, elapsed / state.config.duration);
    el.progressBar.style.width = `${Math.round(ratio * 1000) / 10}%`;
  }

  function toggleVoice() {
    state.voiceEnabled = !state.voiceEnabled;
    if (!state.voiceEnabled) stopSpeech();
    updateControls();
    setStatus(state.voiceEnabled ? "Voix activée." : "Voix désactivée, sous-titres actifs.");
  }

  function prepareSpeechVoices() {
    if (!state.speechSupported) {
      state.voiceEnabled = false;
      updateControls();
      return;
    }

    const choose = () => {
      state.selectedVoice = chooseFrenchVoice(window.speechSynthesis.getVoices());
    };

    choose();
    window.speechSynthesis.addEventListener?.("voiceschanged", choose);
  }

  function chooseFrenchVoice(voices) {
    if (!voices || voices.length === 0) return null;
    const preferredNames = /(Thomas|Audrey|Aurelie|Amelie|Henri|Denise|Google français|Microsoft.*French|Apple.*French|Siri)/i;
    return voices.find((voice) => /^fr[-_]/i.test(voice.lang) && preferredNames.test(voice.name))
      || voices.find((voice) => /^fr[-_]FR/i.test(voice.lang))
      || voices.find((voice) => /^fr[-_]/i.test(voice.lang))
      || voices.find((voice) => /French|français/i.test(voice.name))
      || null;
  }

  function speak(scene) {
    const text = typeof scene === "string" ? scene : (scene.voiceText || scene.text || scene.subtitle || "");
    if (!state.speechSupported || !text) return;
    stopSpeech();
    const voiceProfile = state.config.voice || {};
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = state.selectedVoice?.lang || "fr-FR";
    utterance.rate = clampNumber(scene.rate ?? voiceProfile.rate ?? 0.88, 0.65, 1.12);
    utterance.pitch = clampNumber(scene.pitch ?? voiceProfile.pitch ?? 0.9, 0.5, 1.35);
    utterance.volume = clampNumber(scene.volume ?? voiceProfile.volume ?? 1, 0, 1);
    if (state.selectedVoice) utterance.voice = state.selectedVoice;
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech() {
    if (state.speechSupported) window.speechSynthesis.cancel();
  }

  function updateControls() {
    document.querySelectorAll("[data-intro-start-button]").forEach((button) => {
      button.disabled = state.isPlaying;
    });
    document.querySelectorAll("[data-intro-skip-button]").forEach((button) => {
      button.disabled = !state.isPlaying;
    });
    document.querySelectorAll("[data-intro-replay-button], [data-intro-final-replay-button]").forEach((button) => {
      button.disabled = false;
    });
    document.querySelectorAll("[data-intro-voice-toggle]").forEach((button) => {
      button.disabled = !state.speechSupported;
      button.setAttribute("aria-pressed", String(state.voiceEnabled));
      button.textContent = state.voiceEnabled ? "Voix : ON" : "Voix : OFF";
    });
  }

  function emphasizeTitle(title, accentWord) {
    if (!title) return "";
    if (!accentWord || !title.toLowerCase().includes(accentWord.toLowerCase())) {
      return escapeHtml(title);
    }
    const index = title.toLowerCase().indexOf(accentWord.toLowerCase());
    const before = title.slice(0, index);
    const match = title.slice(index, index + accentWord.length);
    const after = title.slice(index + accentWord.length);
    return `${escapeHtml(before)}<span>${escapeHtml(match)}</span>${escapeHtml(after)}`;
  }

  function setCssVar(name, value) {
    if (value) document.documentElement.style.setProperty(name, value);
  }

  function setText(node, value) {
    if (node) node.textContent = value || "";
  }

  function setStatus(value) {
    setText(el.status, value);
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || min));
  }

  function kebab(value) {
    return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
