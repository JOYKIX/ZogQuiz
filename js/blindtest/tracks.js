import { db, ref, get, update, remove, onValue } from "../firebase.js";
import { validateYoutubeUrl } from "./youtube.js";

export const BLINDTEST_TRACKS_PATH = "blindtest/tracks";

function normalizeAliases(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeOrder(id, rawOrder) {
  const numericOrder = Number(rawOrder);
  if (Number.isFinite(numericOrder)) return numericOrder;
  const numericId = Number(id);
  if (Number.isFinite(numericId)) return numericId;
  return Date.now();
}

export function normalizeTrack(id, raw = {}) {
  const title = String(raw.title || "").trim();
  const youtubeUrl = String(raw.youtubeUrl || "").trim();
  const validation = validateYoutubeUrl(youtubeUrl);

  return {
    id: String(id),
    title,
    youtubeUrl,
    videoId: validation.videoId,
    answer: String(raw.answer || "").trim(),
    aliases: normalizeAliases(raw.aliases),
    active: raw.active !== false,
    order: normalizeOrder(id, raw.order),
    createdAt: Number(raw.createdAt || 0),
    updatedAt: Number(raw.updatedAt || 0),
    isValid: Boolean(title && validation.valid),
    validationError: title ? validation.reason : "Titre manquant.",
  };
}

export function sortTracks(tracks) {
  return [...tracks].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id, "fr");
  });
}

export function activeTracks(tracks) {
  return sortTracks(tracks).filter((track) => track.active && track.isValid);
}

export function watchBlindtestTracks(callback) {
  return onValue(ref(db, BLINDTEST_TRACKS_PATH), (snap) => {
    const raw = snap.val() || {};
    const list = Object.entries(raw).map(([id, data]) => normalizeTrack(id, data));
    callback(sortTracks(list));
  });
}

function buildTrackUpdatePayload(trackId, payload, adminId) {
  const now = Date.now();
  const normalized = normalizeTrack(trackId, payload);
  if (!normalized.title) throw new Error("Le titre de piste est obligatoire.");
  if (!normalized.videoId) throw new Error(normalized.validationError || "URL YouTube invalide.");

  return {
    title: normalized.title,
    youtubeUrl: normalized.youtubeUrl,
    answer: normalized.answer,
    aliases: normalized.aliases,
    active: normalized.active,
    order: normalized.order,
    createdAt: Number(payload.createdAt || now),
    updatedAt: now,
    updatedBy: adminId || "admin",
  };
}

export async function createBlindtestTrack(payload, adminId) {
  const now = Date.now();
  const key = String(now);
  const updatePayload = buildTrackUpdatePayload(key, { ...payload, createdAt: now, order: payload.order ?? now }, adminId);
  await update(ref(db, `${BLINDTEST_TRACKS_PATH}/${key}`), updatePayload);
  return key;
}

export async function updateBlindtestTrack(trackId, payload, adminId) {
  const id = String(trackId || "").trim();
  if (!id) throw new Error("ID de piste invalide.");

  const currentSnap = await get(ref(db, `${BLINDTEST_TRACKS_PATH}/${id}`));
  if (!currentSnap.exists()) throw new Error("Piste introuvable.");

  const current = currentSnap.val() || {};
  const merged = {
    ...current,
    ...payload,
    createdAt: Number(current.createdAt || payload.createdAt || Date.now()),
    order: payload.order ?? current.order,
  };
  const updatePayload = buildTrackUpdatePayload(id, merged, adminId);
  await update(ref(db, `${BLINDTEST_TRACKS_PATH}/${id}`), updatePayload);
}

export async function removeBlindtestTrack(trackId) {
  const id = String(trackId || "").trim();
  if (!id) throw new Error("ID de piste invalide.");
  await remove(ref(db, `${BLINDTEST_TRACKS_PATH}/${id}`));
}
