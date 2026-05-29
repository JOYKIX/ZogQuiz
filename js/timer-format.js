const TIMER_FORMATS = new Set(["minutes-seconds", "seconds"]);

export function normalizeTimerFormat(value, fallback = "minutes-seconds") {
  return TIMER_FORMATS.has(value) ? value : fallback;
}

export function formatTimer(ms, format = "minutes-seconds") {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (normalizeTimerFormat(format) === "seconds") return String(totalSeconds);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
