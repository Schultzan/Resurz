/**
 * Planerade och visade timmar som heltal (avrundat till närmaste int, minimum 0).
 */
export function wholeHours(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** Kort text för timmar i UI (inga decimaler). */
export function formatHours(n) {
  return String(wholeHours(n));
}
