const BUZZER_SOUND_URL = new URL("../sound/buzzer.mp3", import.meta.url).href;

const buzzerAudio = new Audio(BUZZER_SOUND_URL);
buzzerAudio.preload = "auto";

export function playBuzzerSound() {
  buzzerAudio.currentTime = 0;
  const playback = buzzerAudio.play();
  if (playback && typeof playback.catch === "function") {
    playback.catch(() => {});
  }
}

export function createBuzzSoundTrigger() {
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
    playBuzzerSound();
  };
}
