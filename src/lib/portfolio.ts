// Farmer-portfolio presentation logic. The load-bearing honesty decisions live here as
// pure functions so they are unit-tested once and the pages stay presentational.
//
// The rules these functions encode (PRD §3.6, §5.2):
//  - A null `direction` means "no comparable earlier quote", NEVER "steady" and never
//    "the price is unreliable". The price beside it is still shown.
//  - A price has NO staleness cutoff: age is communicated by the date (and a plain-words
//    age note), never by hiding or discounting the number.
//  - Predictions are one Dambulla-anchored NATIONAL price, one per CROP — never per market.
//    Shown beside a market that is not the anchor, they carry the "National forecast" label.
//  - A fallback-served prediction is shown DE-RATED, never hidden and never upgraded.
import type {
  HarvestForecast,
  Market,
  PortfolioDashboard,
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
  PortfolioErrorCode,
  PortfolioPrediction,
  PortfolioPriceDirection,
} from '../api/types';

/** The backend's own caps (Domain/Constants/WatchlistLimits.cs), mirrored ONCE here so the
 *  counter, the client-side guards and the copy all read the same number. The server still
 *  answers watchlist_full / too_many_markets — these only let the UI say "no" before the
 *  round trip, they never replace the server's answer. */
export const MAX_WATCHED_CROPS = 10;
export const MAX_MARKETS_PER_CROP = 3;

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
 * The market a card leads with: `markets[0]`, the farmer's oldest-chosen one (the wire
 * orders them, we never re-sort). Null only if the server ever sent an empty list, which the
 * contract forbids — the caller still handles it rather than indexing blindly.
 */
export function primaryMarket(item: PortfolioDashboardItem): PortfolioDashboardMarket | null {
  return item.markets[0] ?? null;
}

/**
 * The market block whose numbers are ON SCREEN right now: the selected tab when the crop
 * carries several markets, `markets[0]` otherwise (and whenever the id no longer names one
 * of this crop's markets — after a market is dropped, the stale selection must fall back
 * rather than blank the card).
 *
 * Every market-scoped thing on a card — price, observed date, trend, swing, chart — reads
 * from THIS one function. Two of them resolving the market separately is how a card ends up
 * charting Kandy under a Dambulla price.
 */
export function selectedMarketFor(
  item: PortfolioDashboardItem | null,
  selectedMarketId: string | null,
): PortfolioDashboardMarket | null {
  if (!item) return null;
  if (selectedMarketId) {
    const hit = item.markets.find(
      (m) => m.marketId.toLowerCase() === selectedMarketId.toLowerCase(),
    );
    if (hit) return hit;
  }
  return primaryMarket(item);
}

/** The chip label for a market: its short code, or its full name when the code is empty.
 *  The contract allows an empty `shortCode`, and a blank chip is a control with no name. */
export function marketCodeLabel(market: { shortCode: string; name: string }): string {
  const code = (market.shortCode ?? '').trim();
  return code.length > 0 ? code : market.name;
}

/**
 * Does a prediction shown beside this market need the "National forecast" label?
 *
 * The model serves ONE Dambulla-anchored national price per crop, so a forecast sitting next
 * to a Keppetipola price would read as a Keppetipola forecast unless it says otherwise. The
 * label is therefore shown UNLESS the block beside it is the economic centre STANDING IN for
 * a market the farmer never chose (`isDefaultMarket`) — there, the forecast and the price
 * come from the same place and the label would be noise.
 *
 * Every other case FAILS TOWARDS THE LABEL, including a market that happens to be the
 * economic centre by the farmer's own choice: a national label on a national forecast is at
 * worst redundant, whereas omitting it makes a national number look local. Never invert this.
 *
 * This used to take an optional set of economic-centre ids from the markets registry, as a
 * second way to reach the same "false". Step 6 removed the card's forecast section, leaving
 * the crop detail page — which does not load the registry — as the only caller, so that
 * branch became unreachable code guarding a decision the default already makes safely. It
 * is deleted rather than kept "for later": an untaken branch is an untested one.
 */
export function showsNationalLabel(market: PortfolioDashboardMarket | null): boolean {
  if (market === null) return true;
  return !market.isDefaultMarket;
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
 *  - 'ok': at least one crop has a price at some market, or a prediction. */
export function dashboardEmptyState(
  dashboard: PortfolioDashboard,
): 'no-watchlist' | 'no-data' | 'ok' {
  if (dashboard.items.length === 0) return 'no-watchlist';
  const anyData = dashboard.items.some(
    (i) => i.prediction !== null || i.markets.some((m) => m.price !== null),
  );
  return anyData ? 'ok' : 'no-data';
}

/**
 * The farmer-language message for a portfolio error, as an i18n key. Each refusal the
 * PRODUCT makes gets its OWN sentence: "watchlist is full" and "too many markets" are things
 * the farmer can act on, and collapsing them into "could not save" throws away the only
 * useful part of the response. An unrecognised code (or a plain network failure) falls back
 * to the generic sentence rather than guessing.
 */
export function watchlistErrorKey(code: string | null | undefined): string {
  switch (code as PortfolioErrorCode) {
    case 'watchlist_full':
      return 'pages.portfolio.errWatchlistFull';
    case 'too_many_markets':
      return 'pages.portfolio.errTooManyMarkets';
    case 'invalid_planted_date':
      return 'pages.portfolio.errInvalidPlantedDate';
    case 'watchlist_entry_not_found':
      return 'pages.portfolio.errEntryNotFound';
    default:
      return 'common.errorBody';
  }
}

/**
 * The interpolation values a watchlist error sentence needs — the cap it names.
 *
 * The COPY must never hardcode "10" or "3": those numbers are owned by the constants above
 * (which mirror the backend), and a sentence carrying its own copy of them is a sentence
 * that goes quietly wrong the day a cap moves, in three languages at once.
 */
export function watchlistErrorParams(key: string): { max?: number } {
  switch (key) {
    case 'pages.portfolio.errWatchlistFull':
      return { max: MAX_WATCHED_CROPS };
    case 'pages.portfolio.errTooManyMarkets':
      return { max: MAX_MARKETS_PER_CROP };
    default:
      return {};
  }
}

/**
 * Do these two market selections hold the SAME markets? Compared as SETS, deliberately:
 * the server stores its own ChosenAt order and the request order is irrelevant to it, so
 * re-ticking [Kandy, Dambulla] as [Dambulla, Kandy] is not a change. Comparing positionally
 * would leave a "Save markets" button lit forever, firing no-op PUTs the farmer cannot
 * clear. Case-insensitive because GUIDs travel in mixed case.
 */
export function sameMarketSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a.map((id) => id.toLowerCase()));
  const right = new Set(b.map((id) => id.toLowerCase()));
  // Sets ignore duplicates, so equal lengths plus full containment is only equality when
  // NEITHER side repeats an id — checked on both, or the guard works in one direction only.
  // The pickers cannot produce a duplicate, and a duplicate arriving from the wire should
  // read as a difference rather than silently compare equal.
  if (left.size !== a.length || right.size !== b.length) return false;
  for (const id of right) if (!left.has(id)) return false;
  return true;
}

/** The economic centre first, then the rest by name — the option order for the market
 *  pickers, so the model's own anchor is the default suggestion at the top. */
export function orderMarketsForPicker(markets: Market[]): Market[] {
  return [...markets].sort((a, b) => {
    if (a.isEconomicCenter !== b.isEconomicCenter) return a.isEconomicCenter ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Toggle a market inside one crop's picked set, refusing the (cap+1)th rather than silently
 * dropping it. Returns the next selection and whether the cap blocked the tap, so the caller
 * can SAY so — a checkbox that just does not tick is a bug from the farmer's side.
 * Removal is always allowed, even from an over-cap set that arrived from the server.
 */
export function toggleMarketSelection(
  selected: string[],
  marketId: string,
  max: number = MAX_MARKETS_PER_CROP,
): { next: string[]; blocked: boolean } {
  if (selected.includes(marketId)) {
    return { next: selected.filter((id) => id !== marketId), blocked: false };
  }
  if (selected.length >= max) return { next: selected, blocked: true };
  return { next: [...selected, marketId], blocked: false };
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

/**
 * Deep-link to the full national forecast for a crop (PRD §5.1 — the portfolio links to
 * My harvest, it never rebuilds the forecast screen).
 *
 * The farmer's own planting date rides along when they have recorded one, so the screen
 * they land on is asking the SAME question the card just answered. My harvest treats the
 * parameter as a view hint and silently ignores one it cannot use (see plantDateParam),
 * so an out-of-window or malformed date degrades to that page's own default rather than
 * erroring — but it is never silently REWRITTEN to a different day, which would put a
 * price the farmer did not ask for under a date they did not choose.
 */
export function harvestLinkFor(cropId: string, plantedDate?: string | null): string {
  const base = `/my-harvest?crop=${encodeURIComponent(cropId)}`;
  return plantedDate ? `${base}&date=${encodeURIComponent(plantedDate)}` : base;
}

// ---- The farmer's own planting date ------------------------------------------------
// Recorded per watched crop (PUT /api/portfolio/watchlist/{cropId} plantedDate), and the
// anchor for the forecast the card shows: "what will THIS planting fetch at harvest".

/** The server's floor for a planting date (Domain validator: not before 2000-01-01).
 *  Mirrored so the date input refuses it before the round trip; the server still answers
 *  invalid_planted_date and that answer always wins. */
export const PLANTED_DATE_MIN = '2000-01-01';

/**
 * The newest planting date the field offers: TODAY, local.
 *
 * The server's ceiling is UTC-today + 1 day. Local today is never later than that (at
 * UTC+5:30 the local date runs at most one day ahead of UTC), so this is always inside
 * the contract — deliberately one day tighter than the wire allows. That spare day exists
 * to absorb timezone skew, not to invite a planting date in the future: this field records
 * what the farmer HAS planted, and "tomorrow" is a plan, not a planting.
 */
export function plantedDateMax(todayYmd: string): string {
  return todayYmd;
}

/**
 * Is this a REAL calendar day, written as "YYYY-MM-DD"?
 *
 * The round-trip is the whole point: `new Date('2026-02-30T00:00:00')` does not fail, it
 * quietly becomes the 2nd of March. A shape test plus a NaN test would therefore accept the
 * 30th of February and forecast a planting that never happened, so the parsed date's own
 * parts are compared back against the string.
 */
function isRealYmd(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const parsed = new Date(y, mo - 1, d);
  return (
    parsed.getFullYear() === y && parsed.getMonth() === mo - 1 && parsed.getDate() === d
  );
}

/** Is this a planting date the field may send? A real calendar day inside
 *  [2000-01-01, today]. ISO dates sort lexicographically, so string comparison is a correct
 *  range check. */
export function isPlantedDateAllowed(date: string, todayYmd: string): boolean {
  if (!isRealYmd(date)) return false;
  return date >= PLANTED_DATE_MIN && date <= plantedDateMax(todayYmd);
}

/**
 * A `?date=` view hint for My harvest: the date when it is a real ISO day the page's own
 * field accepts, otherwise null ("ignore me").
 *
 * Deliberately NOT clampPlantDateToRange: clamping REWRITES an out-of-range date to today
 * and would silently forecast a different planting than the link named. A hint that cannot
 * be honoured is dropped, and the page keeps its own default.
 */
export function plantDateParam(raw: string | null, min: string, max: string): string | null {
  if (!raw || !isRealYmd(raw)) return null;
  return raw >= min && raw <= max ? raw : null;
}

/**
 * The harvest-route forecast, read as the SAME prediction shape the dashboard serves, so
 * one component (PredictionBlock) renders both and the trust rules cannot fork.
 *
 * The two payloads carry the same facts under two names: the dashboard's `snapshotDate` is
 * "the planting day this forecast assumed", which on the harvest route is `plantDate`. The
 * harvest route additionally carries `lowTrust` (stale/fallback DATA, not a fallback
 * predictor) — it is NOT folded in here, because this function's job is a rename, not a
 * judgement; the caller passes it to PredictionBlock separately, where it can only ever
 * make the claim smaller.
 */
export function predictionFromHarvestForecast(f: HarvestForecast): PortfolioPrediction {
  return {
    predictedPrice: f.predictedPrice,
    lowerBound: f.lowerBound,
    upperBound: f.upperBound,
    confidence: f.confidence,
    activePredictor: f.activePredictor,
    modelVersion: f.modelVersion,
    snapshotDate: f.plantDate,
    harvestDate: f.harvestDate,
  };
}

/**
 * "See details" for one crop, CARRYING the market its card is currently showing.
 *
 * Without the parameter the farmer reads Rs. 260 on the Kandy tab, taps through, and is
 * shown Dambulla's Rs. 210 under the same crop name — two answers to one question, with
 * nothing on either screen admitting they are about different markets. The tab is the
 * farmer's stated context and it has to survive the tap.
 *
 * The parameter is OMITTED when the selection is already `markets[0]`, so the ordinary card
 * keeps producing the one canonical URL for a crop (shareable, bookmarkable, and the same
 * string every time) and `?market=` appears only when it actually means something.
 */
export function cropDetailLink(
  item: PortfolioDashboardItem,
  selectedMarketId: string | null,
): string {
  const base = `/portfolio/crop/${encodeURIComponent(item.cropId)}`;
  const lead = primaryMarket(item)?.marketId ?? null;
  if (!selectedMarketId) return base;
  if (lead !== null && selectedMarketId.toLowerCase() === lead.toLowerCase()) return base;
  return `${base}?market=${encodeURIComponent(selectedMarketId)}`;
}

/** The market a crop's price chart should be drawn for: the one whose number is printed
 *  above it. That is the SELECTED market where the surface lets the farmer switch (the card's
 *  short-code tabs), and `markets[0]` where it does not (the crop detail page). Charting a
 *  different market next to a price would quietly contradict the number. */
export function chartMarketIdFor(
  item: PortfolioDashboardItem | null,
  selectedMarketId: string | null = null,
): string | null {
  return selectedMarketFor(item, selectedMarketId)?.marketId ?? null;
}
