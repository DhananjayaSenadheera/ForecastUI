// Planting-date primitives shared by the LAZY portfolio surface and the EAGER My harvest
// page. Its own module for a measured reason: My harvest is in the first-load bundle, so a
// single helper imported from lib/portfolio drags that whole module — the watchlist caps,
// the swing rules, the error mapping, the dashboard predicates — into the eager chunk for
// one date check (+1.4 kB gzipped, reviewer-measured). Nothing here may grow a dependency
// on the portfolio types; if it needs one, it belongs in lib/portfolio instead.
//
// ISO dates ("YYYY-MM-DD") sort lexicographically, so every range check below is a string
// comparison. That is deliberate: it needs no Date object and cannot drift by a timezone.

/**
 * Is this a REAL calendar day, written as "YYYY-MM-DD"?
 *
 * The round-trip is the whole point: `new Date('2026-02-30T00:00:00')` does not fail, it
 * quietly becomes the 2nd of March. A shape test plus a NaN test would therefore accept the
 * 30th of February and forecast a planting that never happened, so the parsed date's own
 * parts are compared back against the string.
 */
export function isRealYmd(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const parsed = new Date(y, mo - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === mo - 1 && parsed.getDate() === d;
}

/**
 * A `?date=` view hint for My harvest: the date when it is a real calendar day the page's
 * own field accepts, otherwise null ("ignore me").
 *
 * Deliberately NOT clampPlantDateToRange: clamping REWRITES an out-of-range date to today
 * and would silently forecast a different planting than the link named. A hint that cannot
 * be honoured is dropped, and the page keeps its own default.
 */
export function plantDateParam(raw: string | null, min: string, max: string): string | null {
  if (!raw || !isRealYmd(raw)) return null;
  return raw >= min && raw <= max ? raw : null;
}
