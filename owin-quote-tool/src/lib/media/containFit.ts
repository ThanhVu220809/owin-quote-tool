/**
 * Contain-fit image into a max box:
 * scale up/down until either width OR height reaches the box limit, then stop.
 * Never exceeds the box on either axis (same idea as Word catalogue 95% cell fill).
 */
export function containFitSize(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const safeMaxW = Math.max(1, maxWidth);
  const safeMaxH = Math.max(1, maxHeight);
  const ratio = sourceWidth / sourceHeight;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { width: safeMaxW, height: safeMaxH };
  }

  // Fill width first; if height overflows, pin height and shrink width.
  let width = safeMaxW;
  let height = width / ratio;
  if (height > safeMaxH) {
    height = safeMaxH;
    width = height * ratio;
  }
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

/** Usable box after applying fill factor (default 0.95 of cell). */
export function cellImageMaxBox(
  cellWidth: number,
  cellHeight: number,
  fill = 0.95,
  padding = 0,
): { maxWidth: number; maxHeight: number } {
  const innerW = Math.max(1, cellWidth - 2 * padding);
  const innerH = Math.max(1, cellHeight - 2 * padding);
  return {
    maxWidth: innerW * fill,
    maxHeight: innerH * fill,
  };
}
