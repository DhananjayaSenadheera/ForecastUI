// =============================================================================
// Price-browsing geometry + market-comparison helpers (FE-12, prices page W5).
// Pure, framework-free so the load-bearing bits (daily min–max envelope, nice
// scale reuse, stable Okabe–Ito market-colour assignment, comparison bars) are
// unit-tested and PricesPage stays presentational.
//
// REUSE, DON'T FORK: the y-axis scaling reuses `niceScale` from lib/timeline
// verbatim. buildTimelineGeometry itself is month/forecast-shaped (CropTimeline)
// and does not fit a daily min–max PriceHistoryPoint series, so the daily line
// geometry is a focused sibling here that shares the same scale + x-thinning
// idiom rather than duplicating the forecast-band cone logic.
//
// HONEST DISPLAY: a price history is OBSERVED daily low–high, NOT a forecast — it
// is rendered as a shaded min–max envelope with a central (mid) line and labelled
// as a range, never dressed up as a single precise number. Thin/empty series are
// reported honestly by the component; these helpers only lay out what exists.
// =============================================================================
import type { Market, PriceHistoryPoint } from '../api/types';
import { niceScale } from './timeline';

/** Below this many days, the chart shows an honest "only N days" note. */
export const SHORT_PRICE_DAYS = 5;

// ---- single-market daily line ----------------------------------------------
export interface PricePoint {
  date: string;
  min: number;
  max: number;
  mid: number;
}

/** Normalise raw API points to {min,max,mid}; mid is the daily midpoint. */
export function toPricePoints(history: PriceHistoryPoint[]): PricePoint[] {
  return history.map((h) => ({
    date: h.date,
    min: h.minPrice,
    max: h.maxPrice,
    mid: (h.minPrice + h.maxPrice) / 2,
  }));
}

export function isShortHistory(history: PriceHistoryPoint[]): boolean {
  return history.length > 0 && history.length < SHORT_PRICE_DAYS;
}

export interface PricePointXY extends PricePoint {
  x: number;
  yMin: number;
  yMax: number;
  yMid: number;
}
export interface PriceAxisTick {
  value: number;
  y: number;
  label: string;
}
export interface PriceXTick {
  x: number;
  label: string;
}
export interface PriceLineGeometry {
  dims: { width: number; height: number; plot: { left: number; right: number; top: number; bottom: number } };
  domain: { min: number; max: number };
  points: PricePointXY[];
  midPolyline: string;
  bandPolygon: string;
  yTicks: PriceAxisTick[];
  xTicks: PriceXTick[];
}

export interface PriceLineOpts {
  width?: number;
  height?: number;
  /** Localized day label for a given Date (component passes an Intl formatter). */
  dayLabel?: (d: Date) => string;
  /** Cap on drawn x labels so they stay readable at 360px. */
  maxXLabels?: number;
}

/**
 * Lay out a daily price history into SVG coordinates: a min–max envelope polygon
 * plus a central mid line, on a `niceScale` Rs. axis. Returns null when there is
 * nothing to draw (empty series) — the empty state is a component concern.
 */
export function buildPriceLineGeometry(
  history: PriceHistoryPoint[],
  opts: PriceLineOpts = {},
): PriceLineGeometry | null {
  if (history.length < 1) return null;
  const width = opts.width ?? 640;
  const height = opts.height ?? 220;
  const dayLabel = opts.dayLabel ?? ((d: Date) => d.toLocaleString('en', { month: 'short', day: 'numeric' }));
  const maxXLabels = opts.maxXLabels ?? 6;
  const plot = { left: 46, right: width - 14, top: 20, bottom: height - 30 };

  const pts = toPricePoints(history);
  const n = pts.length;
  const xFor = (i: number): number =>
    n <= 1 ? (plot.left + plot.right) / 2 : plot.left + (i / (n - 1)) * (plot.right - plot.left);

  const values: number[] = [];
  for (const p of pts) values.push(p.min, p.max);
  const { niceMin, niceMax, ticks } = niceScale(Math.min(...values), Math.max(...values), 4);
  const yFor = (v: number): number =>
    plot.bottom - ((v - niceMin) / (niceMax - niceMin || 1)) * (plot.bottom - plot.top);

  const points: PricePointXY[] = pts.map((p, i) => ({
    ...p,
    x: xFor(i),
    yMin: yFor(p.min),
    yMax: yFor(p.max),
    yMid: yFor(p.mid),
  }));

  const midPolyline = points.map((p) => `${p.x.toFixed(1)},${p.yMid.toFixed(1)}`).join(' ');
  // Envelope: top edge = daily max L→R, bottom edge = daily min R→L (closed).
  const top = points.map((p) => `${p.x.toFixed(1)},${p.yMax.toFixed(1)}`);
  const bottom = [...points].reverse().map((p) => `${p.x.toFixed(1)},${p.yMin.toFixed(1)}`);
  const bandPolygon = n >= 1 ? [...top, ...bottom].join(' ') : '';

  const yTicks: PriceAxisTick[] = ticks.map((v) => ({ value: v, y: yFor(v), label: String(v) }));

  const step = Math.max(1, Math.ceil(n / maxXLabels));
  const xTicks: PriceXTick[] = [];
  for (let i = 0; i < n; i++) {
    if (i % step !== 0 && i !== n - 1) continue;
    xTicks.push({ x: xFor(i), label: dayLabel(new Date(pts[i].date + 'T00:00:00')) });
  }

  return {
    dims: { width, height, plot },
    domain: { min: niceMin, max: niceMax },
    points,
    midPolyline,
    bandPolygon,
    yTicks,
    xTicks,
  };
}

// ---- multi-market overlay (FE-18) -------------------------------------------
// Overlay up to 4 markets' daily MID price for one crop on ONE shared date x-axis
// + ONE shared Rs. y-scale so the lines are directly comparable. Colours are the
// SAME Okabe–Ito set assigned by stable market id (assignMarketColors), so a market
// keeps its colour across the single-market key, the overlay and the bars. REUSES
// niceScale + the daily {min,max,mid} idiom above — no forked scaling. Honest: a
// market with a thin/short series simply draws a shorter line; nothing is padded.
export interface MarketOverlayInput {
  marketId: string;
  name: string;
  history: PriceHistoryPoint[];
  /** Stable colour assigned from the FULL market list so it never shifts with selection. */
  colorVar?: string;
}
export interface MarketOverlayPoint {
  x: number;
  y: number;
  date: string;
  mid: number;
  min: number;
  max: number;
}
export interface MarketOverlaySeries {
  marketId: string;
  name: string;
  colorVar: string;
  midPolyline: string;
  points: MarketOverlayPoint[];
  end: { x: number; y: number } | null;
  count: number;
}
export interface MarketOverlayGeometry {
  dims: { width: number; height: number; plot: { left: number; right: number; top: number; bottom: number } };
  domain: { min: number; max: number };
  yTicks: PriceAxisTick[];
  xTicks: PriceXTick[];
  series: MarketOverlaySeries[];
}
export interface MarketOverlayOpts {
  width?: number;
  height?: number;
  dayLabel?: (d: Date) => string;
  maxXLabels?: number;
}

const dayTime = (date: string): number => new Date(date + 'T00:00:00').getTime();

export function buildMarketOverlayGeometry(
  inputs: MarketOverlayInput[],
  opts: MarketOverlayOpts = {},
): MarketOverlayGeometry | null {
  const withData = inputs.filter((s) => s.history.length > 0);
  if (withData.length === 0) return null;

  const width = opts.width ?? 640;
  const height = opts.height ?? 240;
  const dayLabel = opts.dayLabel ?? ((d: Date) => d.toLocaleString('en', { month: 'short', day: 'numeric' }));
  const maxXLabels = opts.maxXLabels ?? 6;
  // Extra right padding for the direct end-labels (no legend).
  const plot = { left: 46, right: width - 64, top: 20, bottom: height - 30 };

  const colors = assignMarketColors(inputs.map((s) => s.marketId));

  const allT: number[] = [];
  const allV: number[] = [];
  const parsed = withData.map((s) => {
    const pts = toPricePoints(s.history)
      .map((p) => ({ ...p, t: dayTime(p.date) }))
      .sort((a, b) => a.t - b.t);
    for (const p of pts) {
      allT.push(p.t);
      allV.push(p.min, p.max);
    }
    return { s, pts };
  });

  const minT = Math.min(...allT);
  const maxT = Math.max(...allT);
  const { niceMin, niceMax, ticks } = niceScale(Math.min(...allV), Math.max(...allV), 4);

  const xFor = (t: number): number =>
    maxT <= minT ? (plot.left + plot.right) / 2 : plot.left + ((t - minT) / (maxT - minT)) * (plot.right - plot.left);
  const yFor = (v: number): number =>
    plot.bottom - ((v - niceMin) / (niceMax - niceMin || 1)) * (plot.bottom - plot.top);

  const series: MarketOverlaySeries[] = parsed.map(({ s, pts }) => {
    const xy: MarketOverlayPoint[] = pts.map((p) => ({
      x: xFor(p.t),
      y: yFor(p.mid),
      date: p.date,
      mid: p.mid,
      min: p.min,
      max: p.max,
    }));
    const last = xy[xy.length - 1] ?? null;
    return {
      marketId: s.marketId,
      name: s.name,
      colorVar: s.colorVar ?? colors.get(s.marketId) ?? marketColorVar(0),
      midPolyline: xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      points: xy,
      end: last ? { x: last.x, y: last.y } : null,
      count: xy.length,
    };
  });

  const yTicks: PriceAxisTick[] = ticks.map((v) => ({ value: v, y: yFor(v), label: String(v) }));

  // x ticks from the union of dates, thinned so labels stay readable at 360px.
  const uniqueT = [...new Set(allT)].sort((a, b) => a - b);
  const step = Math.max(1, Math.ceil(uniqueT.length / maxXLabels));
  const xTicks: PriceXTick[] = [];
  uniqueT.forEach((t, i) => {
    if (i % step !== 0 && i !== uniqueT.length - 1) return;
    xTicks.push({ x: xFor(t), label: dayLabel(new Date(t)) });
  });

  return { dims: { width, height, plot }, domain: { min: niceMin, max: niceMax }, yTicks, xTicks, series };
}

// ---- sparkline (FE-1 overview latest-prices strip) --------------------------
// A minimal single-series trend line: no axis, no band — just a shape that reads
// at a glance in a table cell. Shares the {date, price} idiom and the same "lay out
// only what exists / degrade honestly" contract as the fuller line above, so a
// sparse or single-point series never fabricates a fake trend. The NUMBER stays the
// product: the component always shows the price + an aria sentence, never spark-only.
export interface SparkInput {
  date: string;
  price: number;
}
export interface SparkGeometry {
  width: number;
  height: number;
  /** "x,y x,y …" for the trend polyline (>=2 points). */
  polyline: string;
  /** Position of the latest point (always present) for an end dot. */
  last: { x: number; y: number };
  /** True when only one point exists — the component draws a dot, not a line. */
  singlePoint: boolean;
  min: number;
  max: number;
}

export interface SparkOpts {
  width?: number;
  height?: number;
  /** Vertical inset so the stroke + end dot are never clipped at the edges. */
  pad?: number;
}

/**
 * Lay out a short price series into a tiny SVG trend line. Returns null when there
 * is nothing to draw (empty series). A flat/degenerate range is centred vertically
 * so the line sits mid-cell instead of hugging an edge. Never invents points.
 */
export function buildSparkline(points: SparkInput[], opts: SparkOpts = {}): SparkGeometry | null {
  const n = points.length;
  if (n < 1) return null;
  const width = opts.width ?? 100;
  const height = opts.height ?? 24;
  const pad = opts.pad ?? 3;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min;

  const xFor = (i: number): number =>
    n <= 1 ? width / 2 : (i / (n - 1)) * (width - 2 * pad) + pad;
  const yFor = (v: number): number =>
    span > 0 ? height - pad - ((v - min) / span) * (height - 2 * pad) : height / 2;

  const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.price) }));
  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];

  return { width, height, polyline, last, singlePoint: n === 1, min, max };
}

// ---- market comparison ------------------------------------------------------
// Okabe–Ito categorical quartet (design-tokens 4b). Colours are assigned by
// STABLE market-id order — never by price rank — so a given market keeps its
// colour across every chart in the session.
const CAT_VARS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)'];

export function marketColorVar(index: number): string {
  const len = CAT_VARS.length;
  return CAT_VARS[((index % len) + len) % len];
}

/** Map every market id -> a stable Okabe–Ito colour var, ordered by id ascending. */
export function assignMarketColors(marketIds: string[]): Map<string, string> {
  const sorted = [...new Set(marketIds)].sort();
  const m = new Map<string, string>();
  sorted.forEach((id, i) => m.set(id, marketColorVar(i)));
  return m;
}

export interface MarketSummary {
  marketId: string;
  name: string;
  colorVar: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  latest: number;
}

/**
 * Summarise each market's window for the comparison. Markets with NO data are
 * omitted (honestly excluded — the component notes them); colours stay stable
 * because they are assigned from the full market list, not the survivors.
 */
export function summarizeMarkets(
  markets: Market[],
  byMarket: Record<string, PriceHistoryPoint[]>,
): MarketSummary[] {
  const colors = assignMarketColors(markets.map((m) => m.id));
  const out: MarketSummary[] = [];
  for (const mk of markets) {
    const hist = byMarket[mk.id] ?? [];
    if (hist.length === 0) continue;
    const mids = hist.map((h) => (h.minPrice + h.maxPrice) / 2);
    const sorted = [...hist].sort((a, b) => a.date.localeCompare(b.date));
    out.push({
      marketId: mk.id,
      name: mk.name,
      colorVar: colors.get(mk.id) ?? marketColorVar(0),
      count: hist.length,
      avg: mids.reduce((s, v) => s + v, 0) / mids.length,
      min: Math.min(...hist.map((h) => h.minPrice)),
      max: Math.max(...hist.map((h) => h.maxPrice)),
      latest: (sorted[sorted.length - 1].minPrice + sorted[sorted.length - 1].maxPrice) / 2,
    });
  }
  return out;
}

export interface MarketBar {
  marketId: string;
  name: string;
  colorVar: string;
  avg: number;
  min: number;
  max: number;
  /** avg on the shared 0→axisMax scale (%). */
  pct: number;
  /** min/max whisker positions on the same scale (%). */
  minPct: number;
  maxPct: number;
}
export interface MarketBars {
  axisMax: number;
  bars: MarketBar[];
}

/** Build shared-scale comparison bars (avg with min–max whisker) for markets. */
export function buildMarketBars(summaries: MarketSummary[]): MarketBars {
  const peak = summaries.reduce((m, s) => Math.max(m, s.max), 0);
  const { niceMax } = niceScale(0, peak > 0 ? peak : 1, 4);
  const axisMax = niceMax > 0 ? niceMax : 1;
  const bars: MarketBar[] = summaries.map((s) => ({
    marketId: s.marketId,
    name: s.name,
    colorVar: s.colorVar,
    avg: s.avg,
    min: s.min,
    max: s.max,
    pct: Math.min(100, Math.max(0, (s.avg / axisMax) * 100)),
    minPct: Math.min(100, Math.max(0, (s.min / axisMax) * 100)),
    maxPct: Math.min(100, Math.max(0, (s.max / axisMax) * 100)),
  }));
  return { axisMax, bars };
}
