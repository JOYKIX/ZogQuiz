const DEFAULT_BUZZER_FILE = "buzzer.mp3";
const BUZZER_DIR_URL = new URL("../sound/", import.meta.url);
const audioByFile = new Map();

function normalizeBuzzerFile(fileName) {
  if (!fileName) return DEFAULT_BUZZER_FILE;
  const normalized = String(fileName).trim().toLowerCase();
  if (!/^[a-z0-9_-]+\.mp3$/i.test(normalized)) return DEFAULT_BUZZER_FILE;
  return normalized;
}

function getAudioForFile(fileName) {
  const normalized = normalizeBuzzerFile(fileName);
  if (audioByFile.has(normalized)) return audioByFile.get(normalized);

  const audio = new Audio(new URL(normalized, BUZZER_DIR_URL).href);
  audio.preload = "auto";
  audioByFile.set(normalized, audio);
  return audio;
}

function tryPlayAudio(audio) {
  audio.currentTime = 0;
  const playback = audio.play();
  if (!playback || typeof playback.then !== "function") return Promise.resolve(true);
  return playback.then(() => true).catch(() => false);
}

export function playBuzzerSound(fileName = DEFAULT_BUZZER_FILE) {
  const normalized = normalizeBuzzerFile(fileName);
  const selectedAudio = getAudioForFile(normalized);

  tryPlayAudio(selectedAudio).then((ok) => {
    if (!ok && normalized !== DEFAULT_BUZZER_FILE) {
      const fallbackAudio = getAudioForFile(DEFAULT_BUZZER_FILE);
      tryPlayAudio(fallbackAudio);
    }
  });
}

export function createBuzzSoundTrigger({ resolveBuzzerFile } = {}) {
  let lastBuzzToken = null;

  return (state) => {
    const hasLockedBuzz = Boolean(state?.buzzerLocked);
    if (!hasLockedBuzz) {
      lastBuzzToken = null;
      return;
    }

    const token = `${Number(state.lockedAt || 0)}::${state.lockedBySessionId || state.lockedByNickname || "unknown"}`;
    if (token === lastBuzzToken) return;

    lastBuzzToken = token;
    const buzzerFile = typeof resolveBuzzerFile === "function" ? resolveBuzzerFile(state) : DEFAULT_BUZZER_FILE;
    playBuzzerSound(buzzerFile);
  };
}
