// Farmer-portfolio presentation logic. The load-bearing honesty decisions live here as
// pure functions so they are unit-tested once and the pages stay presentational.
//
// The rules these functions encode (PRD §3.6, §5.2):
//  - A null `direction` means "no comparable earlier quote", NEVER "steady" and never
//    "the price is unreliable". The price beside it is still shown.
//  - A price has NO staleness cutoff: age is communicated by the date (and a plain-words
//    age note), never by hiding or discounting the number.
//  - Predictions are one Dambulla-anchored NATIONAL price. Under a non-economic-centre
//    home market they must carry the "National forecast" label.
//  - A fallback-served prediction is shown DE-RATED, never hidden and never upgraded.
import type {
  Market,
  PortfolioDashboard,
  PortfolioDashboardItem,
  PortfolioHomeMarket,
  PortfolioPrediction,
  PortfolioPriceDirection,
  WatchlistItem,
} from '../api/types';

/** Trend glyph — paired ALWAYS with a word by the component (colour is never the sole
 *  signal, and none of these three is red). */
export const trendGlyph: Record<PortfolioPriceDirection, string> = {
  up: '▲',
  down: '▼',
  steady: '▬',
};

/** i18n key for a direction's plain-language word. */
export function trendLabelKey(
  d: PortfolioPriceDirection,
): 'pages.portfolio.trendUp' | 'pages.portfolio.trendDown' | 'pages.portfolio.trendSteady' {
  switch (d) {
    case 'up':
      return 'pages.portfolio.trendUp';
    case 'down':
      return 'pages.portfolio.trendDown';
    case 'steady':
      return 'pages.portfolio.trendSteady';
  }
}

/**
 * Does a prediction shown under this home market need the "National forecast" label?
 * TRUE whenever the home market is not the economic centre: the model serves ONE
 * Dambulla-anchored national price, so pairing it with a Kandy price without saying so
 * would read as a Kandy forecast. A null home market means nothing is being re-pointed,
 * so no label is needed.
 */
export function showsNationalLabel(homeMarket: PortfolioHomeMarket | null): boolean {
  return homeMarket !== null && !homeMarket.isEconomicCenter;
}

/** The predictors a farmer may see at FULL model trust. An ALLOWLIST on purpose, mirroring
 *  the serving side's `_SERVABLE_ML_KINDS` (serving/predict.py): anything else — including a
 *  rung this build has never heard of — is de-rated. */
const FULL_TRUST_PREDICTORS = ['model', 'residual'];

/**
 * Should this prediction be shown DE-RATED (PRD §5.2)? The number stays, the claim shrinks.
 *
 * ALLOWLIST, NOT a substring test on "fallback". The failure modes are not symmetric: a
 * model prediction shown cautiously costs a little confidence, whereas a fallback shown at
 * full trust is exactly the dishonesty the PRD forbids. New predictor names get minted
 * without a UI change ("unavailable" already exists on the harvest-window route, and a
 * future "category_mean" rung would carry no "fallback" substring), so an unknown name must
 * fall on the cautious side rather than silently inherit model trust.
 *
 * Deliberately NOT `predictorKind` from lib/format: that denylist stays as it is for the
 * admin surfaces, where loose grouping of a long tail of predictor names is what is wanted.
 */
export function isDeratedPrediction(p: PortfolioPrediction | null): boolean {
  if (p === null) return false;
  return !FULL_TRUST_PREDICTORS.includes((p.activePredictor ?? '').toLowerCase());
}

/** Which of the two distinct empty states (PRD §5.2) the dashboard is in.
 *  - 'no-watchlist': the farmer has added nothing -> "Add crops" CTA.
 *  - 'no-data': crops are watched but NOTHING is known about any of them -> an honest
 *    "no prices for your crops yet", never a fake number.
 *  - 'ok': at least one crop has a price or a prediction. */
export function dashboardEmptyState(
  dashboard: PortfolioDashboard,
): 'no-watchlist' | 'no-data' | 'ok' {
  if (dashboard.items.length === 0) return 'no-watchlist';
  const anyData = dashboard.items.some((i) => i.price !== null || i.prediction !== null);
  return anyData ? 'ok' : 'no-data';
}

export interface WatchlistDiff {
  added: string[];
  removed: string[];
}

/**
 * What has to be written to turn `current` into `next`: crop ids to POST and to DELETE.
 * Both sides are de-duplicated and the input order of `next` is preserved for `added`, so
 * the calls fire in the order the farmer tapped. An unchanged selection yields two empty
 * arrays, which is the caller's cue that Save has nothing to do.
 */
export function diffWatchlist(current: string[], next: string[]): WatchlistDiff {
  const currentSet = new Set(current);
  const nextSet = new Set(next);
  const added: string[] = [];
  for (const id of next) {
    if (!currentSet.has(id) && !added.includes(id)) added.push(id);
  }
  const removed: string[] = [];
  for (const id of current) {
    if (!nextSet.has(id) && !removed.includes(id)) removed.push(id);
  }
  return { added, removed };
}

/** The economic centre first, then the rest by name — the option order for the home-market
 *  select, so the model's own anchor is the default suggestion at the top. */
export function orderMarketsForPicker(markets: Market[]): Market[] {
  return [...markets].sort((a, b) => {
    if (a.isEconomicCenter !== b.isEconomicCenter) return a.isEconomicCenter ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** The home market currently stored on the watchlist rows (one market per farmer), or null
 *  when none is chosen. Reads the first row that carries one so a partially-written list
 *  still resolves. */
export function watchlistMarketId(items: WatchlistItem[]): string | null {
  for (const i of items) {
    if (i.preferredMarketId) return i.preferredMarketId;
  }
  return null;
}

/**
 * Whole days between two "YYYY-MM-DD" local dates (`from` -> `to`), or null on unparsable
 * input. Built on local Date construction, NOT Date.parse of the bare string: at UTC+5:30
 * `new Date('2026-07-27')` is midnight UTC, which is 05:30 local and slices back a day.
 */
export function daysBetweenYmd(from: string, to: string): number | null {
  const a = parseYmdLocal(from);
  const b = parseYmdLocal(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function parseYmdLocal(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Show a plain-words age note only once the price is old enough that the raw date alone
 *  could mislead a hurried reader. A week-old price needs no apology; a two-month-old one
 *  does. Never used to suppress the price itself. */
export const PRICE_AGE_NOTE_DAYS = 8;

/** Age in days of an observed price, or null when the date is unusable. */
export function priceAgeDays(observedDate: string, todayYmd: string): number | null {
  const age = daysBetweenYmd(observedDate, todayYmd);
  return age === null ? null : Math.max(0, age);
}

/** Deep-link to the full national forecast for a crop (PRD §5.1 — the portfolio links to
 *  My harvest, it never rebuilds the forecast screen). */
export function harvestLinkFor(cropId: string): string {
  return `/my-harvest?crop=${encodeURIComponent(cropId)}`;
}

/** The market a crop's price chart should be drawn for: the market that ACTUALLY served
 *  the displayed price (which may be the economic-centre fallback), else the home market.
 *  Charting the home market under a fallback-served number would put a different series
 *  next to the price and quietly contradict it. */
export function chartMarketIdFor(
  item: PortfolioDashboardItem | null,
  homeMarket: PortfolioHomeMarket | null,
): string | null {
  return item?.price?.marketId ?? homeMarket?.marketId ?? null;
}
