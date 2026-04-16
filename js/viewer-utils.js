export function normalizeViewerAnswer(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAcceptedAnswers(raw) {
  return String(raw || "")
    .split(/\n|,/g)
    .map((value) => value.trim())
    .filter(Boolean);
}
