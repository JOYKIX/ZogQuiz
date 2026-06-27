const DEFAULT_BUZZER_FILE = "buzzer.mp3";
const BUZZER_DIR_URL = new URL("../sound/", import.meta.url);
const audioByFile = new Map();
const decodedAudioByFile = new Map();
let audioContext = null;

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

function normalizeBuzzerVolume(volumePercent) {
  const volume = Number(volumePercent);
  if (!Number.isFinite(volume)) return 100;
  return Math.min(200, Math.max(0, volume));
}

function getAudioContext() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!audioContext) audioContext = new AudioContextConstructor();
  return audioContext;
}

async function getDecodedAudioForFile(fileName) {
  const normalized = normalizeBuzzerFile(fileName);
  if (decodedAudioByFile.has(normalized)) return decodedAudioByFile.get(normalized);
  const context = getAudioContext();
  if (!context) return null;
  const promise = fetch(new URL(normalized, BUZZER_DIR_URL).href)
    .then((response) => {
      if (!response.ok) throw new Error("Buzzer introuvable.");
      return response.arrayBuffer();
    })
    .then((buffer) => context.decodeAudioData(buffer));
  decodedAudioByFile.set(normalized, promise);
  return promise;
}

async function tryPlayWithGain(fileName, volumePercent) {
  const context = getAudioContext();
  if (!context) return false;
  const audioBuffer = await getDecodedAudioForFile(fileName);
  if (!audioBuffer) return false;
  if (context.state === "suspended") await context.resume();
  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = normalizeBuzzerVolume(volumePercent) / 100;
  source.buffer = audioBuffer;
  source.connect(gain).connect(context.destination);
  source.start(0);
  return true;
}

function tryPlayAudio(audio, volumePercent) {
  audio.currentTime = 0;
  audio.volume = Math.min(1, normalizeBuzzerVolume(volumePercent) / 100);
  const playback = audio.play();
  if (!playback || typeof playback.then !== "function") return Promise.resolve(true);
  return playback.then(() => true).catch(() => false);
}

export function playBuzzerSound(fileName = DEFAULT_BUZZER_FILE, volumePercent = 100) {
  const normalized = normalizeBuzzerFile(fileName);

  tryPlayWithGain(normalized, volumePercent).then((ok) => {
    if (ok) return;
    const selectedAudio = getAudioForFile(normalized);
    tryPlayAudio(selectedAudio, volumePercent).then((fallbackOk) => {
      if (!fallbackOk && normalized !== DEFAULT_BUZZER_FILE) {
        const fallbackAudio = getAudioForFile(DEFAULT_BUZZER_FILE);
        tryPlayAudio(fallbackAudio, volumePercent);
      }
    });
  }).catch(() => {
    if (normalized !== DEFAULT_BUZZER_FILE) playBuzzerSound(DEFAULT_BUZZER_FILE, volumePercent);
  });
}

export function createBuzzSoundTrigger({ resolveBuzzerFile, resolveBuzzerVolume } = {}) {
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
    const buzzerVolume = typeof resolveBuzzerVolume === "function" ? resolveBuzzerVolume(state) : 100;
    playBuzzerSound(buzzerFile, buzzerVolume);
  };
}
