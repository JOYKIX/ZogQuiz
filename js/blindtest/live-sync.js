import { db, ref, get, set, update, onValue } from "../firebase.js";

export const BLINDTEST_LIVE_PATH = "blindtestLive";

export function defaultBlindtestLiveState(updatedBy = "system") {
  return {
    active: false,
    trackId: null,
    trackIndex: 0,
    playbackState: "stopped",
    startedAt: null,
    pausedAtSeconds: 0,
    syncVersion: 0,
    updatedAt: Date.now(),
    updatedBy,
    lastError: "",
  };
}

export function normalizeBlindtestLiveState(raw = {}) {
  const playbackState = ["playing", "paused", "stopped"].includes(raw.playbackState) ? raw.playbackState : "stopped";
  const trackIndex = Number.isFinite(Number(raw.trackIndex)) ? Math.max(0, Math.floor(Number(raw.trackIndex))) : 0;
  return {
    ...defaultBlindtestLiveState(raw.updatedBy || "system"),
    ...raw,
    trackId: raw.trackId ? String(raw.trackId) : null,
    trackIndex,
    playbackState,
    pausedAtSeconds: Math.max(0, Number(raw.pausedAtSeconds || 0)),
    syncVersion: Number.isFinite(Number(raw.syncVersion)) ? Number(raw.syncVersion) : 0,
    startedAt: Number.isFinite(Number(raw.startedAt)) ? Number(raw.startedAt) : null,
  };
}

export async function ensureBlindtestLiveSeed(uid) {
  const liveRef = ref(db, BLINDTEST_LIVE_PATH);
  const snap = await get(liveRef);
  if (!snap.exists()) {
    await set(liveRef, defaultBlindtestLiveState(uid));
    return;
  }
  await update(liveRef, { updatedAt: Date.now(), updatedBy: uid || "system" });
}

export function watchBlindtestLive(callback) {
  return onValue(ref(db, BLINDTEST_LIVE_PATH), (snap) => {
    callback(normalizeBlindtestLiveState(snap.val() || {}));
  });
}

export async function writeBlindtestLive(patchBuilder, currentState, adminId) {
  const patch = patchBuilder(currentState);
  if (!patch) return;

  await update(ref(db, BLINDTEST_LIVE_PATH), {
    ...patch,
    syncVersion: Number(currentState.syncVersion || 0) + 1,
    updatedAt: Date.now(),
    updatedBy: adminId || "admin",
  });
}

export function computeTargetSeconds(liveState, now = Date.now()) {
  if (liveState.playbackState === "paused") return Math.max(0, Number(liveState.pausedAtSeconds || 0));
  if (liveState.playbackState === "stopped") return 0;
  if (!liveState.startedAt) return Math.max(0, Number(liveState.pausedAtSeconds || 0));
  return Math.max(0, (Number(now) - Number(liveState.startedAt)) / 1000);
}
