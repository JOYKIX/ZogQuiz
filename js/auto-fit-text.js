/**
 * Ajuste dynamiquement la taille d'un texte dans un container sans overflow.
 *
 * Le calcul:
 * - respecte min/max font-size
 * - réserve un padding de sécurité dans la zone disponible
 * - applique un line-height configurable
 * - cherche la plus grande taille possible via recherche binaire
 */
export function autoFitText({
  container,
  textElement,
  minFontSizePx = 24,
  maxFontSizePx = 80,
  paddingPx = 40,
  lineHeight = 1.2,
  maxWidthPx,
}) {
  if (!container || !textElement) return;

  const minSize = Math.max(8, Number(minFontSizePx) || 24);
  const maxSize = Math.max(minSize, Number(maxFontSizePx) || minSize);
  const inset = Math.max(0, Number(paddingPx) || 0) * 2;
  const effectiveLineHeight = Math.max(1, Number(lineHeight) || 1.2);

  const availableWidth = Math.max(1, container.clientWidth - inset);
  const availableHeight = Math.max(1, container.clientHeight - inset);
  const widthLimit = Number.isFinite(Number(maxWidthPx))
    ? Math.min(availableWidth, Math.max(1, Number(maxWidthPx)))
    : availableWidth;

  textElement.style.lineHeight = String(effectiveLineHeight);
  textElement.style.maxWidth = `${Math.max(1, widthLimit)}px`;

  const fitsAtSize = (fontSizePx) => {
    textElement.style.fontSize = `${fontSizePx}px`;
    return textElement.scrollWidth <= widthLimit && textElement.scrollHeight <= availableHeight;
  };

  let low = minSize;
  let high = maxSize;
  let best = minSize;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fitsAtSize(mid)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  textElement.style.fontSize = `${best}px`;
}
