import { db, ref, get, set, update, onValue } from "../firebase.js";
import { validateYoutubeUrl } from "./youtube.js";

export const BLINDTEST_TRACKS_PATH = "blindtest/tracks";

function normalizeAliases(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
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
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : Number(id) || 0,
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

export async function ensureBlindtestTracksSeed(uid) {
  const tracksRef = ref(db, BLINDTEST_TRACKS_PATH);
  const snap = await get(tracksRef);
  if (snap.exists()) return;

  await set(tracksRef, {
    "1": {
      title: "Naruto Opening 6",
      youtubeUrl: "https://www.youtube.com/watch?v=SavhHnWla6c",
      answer: "Naruto",
      aliases: ["naruto shippuden"],
      active: true,
      order: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: uid,
    },
    "2": {
      title: "Attack on Titan Opening 1",
      youtubeUrl: "https://www.youtube.com/watch?v=LKP-vZvjbh8",
      answer: "Attack on Titan",
      aliases: ["snk"],
      active: true,
      order: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: uid,
    },
  });
}

export function watchBlindtestTracks(callback) {
  return onValue(ref(db, BLINDTEST_TRACKS_PATH), (snap) => {
    const raw = snap.val() || {};
    const list = Object.entries(raw).map(([id, data]) => normalizeTrack(id, data));
    callback(sortTracks(list));
  });
}

export async function upsertBlindtestTrack(id, payload, adminId) {
  const now = Date.now();
  const key = String(id || "").trim() || String(now);
  const normalized = normalizeTrack(key, payload);
  if (!normalized.title) throw new Error("Le titre de piste est obligatoire.");
  if (!normalized.videoId) throw new Error(normalized.validationError || "URL YouTube invalide.");

  await update(ref(db, `${BLINDTEST_TRACKS_PATH}/${key}`), {
    title: normalized.title,
    youtubeUrl: normalized.youtubeUrl,
    answer: normalized.answer,
    aliases: normalized.aliases,
    active: normalized.active,
    order: normalized.order || Number(key) || now,
    updatedAt: now,
    updatedBy: adminId || "admin",
    createdAt: payload.createdAt || now,
  });
}
