// =============================================================================
// Timeline chart geometry (FE-5, ClickUp 86cacw5x5). Pure, framework-free so the
// load-bearing bits (nice y-scale, band cone, today/harvest marker positions,
// x-label thinning) are unit-tested and TimelineChart stays presentational.
//
// HONEST-UNCERTAINTY RULES baked in here (mirrors lib/forecast):
//   - The forecast is a FILLED band (lower–upper) with a central line, never a
//     bare line. The band pinches to a point at "today" and widens forward.
//   - Band ALWAYS encloses the central line (yUpper <= yCentral <= yLower in SVG
//     coords) — verified by test, so the chart can never draw a false-precise line.
//   - We never fabricate history: short/empty series are reported honestly by the
//     component; this module only lays out what is actually present.
// =============================================================================
import type { CropTimeline, TimelineForecastPoint, TimelineHistoryPoint } from '../api/types';

/** Below this many history months, the chart shows an honest "only N months" note. */
export const SHORT_HISTORY_MONTHS = 6;

export interface TimelineGeometryOpts {
  width?: number;
  height?: number;
  /** Harvest date ("YYYY-MM-DD") from the FE-4 payload; marker snaps to the nearest forecast point. */
  harvestDate?: string | null;
  /** Localized month label for a given Date (component passes an Intl formatter). */
  monthLabel?: (d: Date) => string;
  /** Cap on drawn x-axis labels so they stay readable at 360px. */
  maxXLabels?: number;
}

export interface XY {
  x: number;
  y: number;
  value: number;
}
export interface ForecastXY extends XY {
  index: number;
  lower: number;
  upper: number;
  yLower: number;
  yUpper: number;
}
export interface AxisTick {
  value?: number;
  x?: number;
  y?: number;
  label: string;
}
export interface XTick {
  x: number;
  label: string;
  isHarvest: boolean;
  isToday: boolean;
}
export interface TimelineGeometry {
  dims: { width: number; height: number; plot: { left: number; right: number; top: number; bottom: number } };
  domain: { min: number; max: number };
  history: XY[];
  forecast: ForecastXY[];
  todayX: number;
  todayY: number;
  harvest: { x: number; y: number; index: number; date: string } | null;
  yTicks: AxisTick[];
  xTicks: XTick[];
  historyPolyline: string;
  forecastPolyline: string;
  bandPolygon: string;
}

// ---- nice y-scale (clean gridlines, 3–4 ticks max) --------------------------
function niceNum(range: number, round: boolean): number {
  if (!(range > 0)) return 1;
  const exp = Math.floor(Math.log10(range));
  const frac = range / 10 ** exp;
  let nice: number;
  if (round) {
    nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  } else {
    nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  }
  return nice * 10 ** exp;
}

/** Rounded [min,max] domain + evenly spaced tick values for a readable Rs. axis. */
export function niceScale(min: number, max: number, maxTicks = 4): { niceMin: number; niceMax: number; step: number; ticks: number[] } {
  if (!(max > min)) {
    // Degenerate: fabricate a small symmetric window so the line isn't a flat edge.
    const pad = Math.abs(max) > 0 ? Math.abs(max) * 0.1 : 1;
    min = max - pad;
    max = max + pad;
  }
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, maxTicks - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) ticks.push(Math.round(v));
  return { niceMin, niceMax, step, ticks };
}

function monthDate(p: TimelineHistoryPoint): Date {
  const [y, m] = p.month.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
}
function forecastDate(p: TimelineForecastPoint): Date {
  return new Date(p.date + 'T00:00:00');
}
function dayDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime());
}

export function isShortHistory(history: TimelineHistoryPoint[]): boolean {
  return history.length > 0 && history.length < SHORT_HISTORY_MONTHS;
}

/**
 * Lay out a timeline into SVG coordinates. Combined x-axis = history months then
 * forecast months, evenly spaced; "today" sits at the last history point and the
 * forecast band cones out from it. Returns structured points AND ready-to-render
 * SVG strings. Caller guards history.length >= 1 (empty state is a component concern).
 */
export function buildTimelineGeometry(timeline: CropTimeline, opts: TimelineGeometryOpts = {}): TimelineGeometry {
  const width = opts.width ?? 640;
  const height = opts.height ?? 240;
  const monthLabel = opts.monthLabel ?? ((d: Date) => d.toLocaleString('en', { month: 'short' }));
  const maxXLabels = opts.maxXLabels ?? 7;
  const plot = { left: 46, right: width - 14, top: 26, bottom: height - 34 };

  const history = timeline.history;
  const forecast = timeline.forecast;
  const H = history.length;
  const F = forecast.length;
  const total = H + F;

  const xFor = (i: number): number =>
    total <= 1 ? plot.left : plot.left + (i / (total - 1)) * (plot.right - plot.left);

  // ---- value domain: history prices + forecast band extremes -----------------
  const values: number[] = [];
  for (const h of history) values.push(h.avgPrice);
  for (const f of forecast) values.push(f.lowerBound, f.upperBound, f.predictedPrice);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const { niceMin, niceMax, ticks } = niceScale(rawMin, rawMax, 4);

  const yFor = (v: number): number =>
    plot.bottom - ((v - niceMin) / (niceMax - niceMin || 1)) * (plot.bottom - plot.top);

  // ---- history points --------------------------------------------------------
  const historyXY: XY[] = history.map((h, i) => ({ x: xFor(i), y: yFor(h.avgPrice), value: h.avgPrice }));

  // "today" = last history point; band + forecast line anchor here.
  const todayIndex = H - 1;
  const todayX = xFor(Math.max(0, todayIndex));
  const todayValue = H > 0 ? history[H - 1].avgPrice : forecast[0]?.predictedPrice ?? niceMin;
  const todayY = yFor(todayValue);

  // ---- forecast points -------------------------------------------------------
  const forecastXY: ForecastXY[] = forecast.map((f, i) => {
    const idx = H + i;
    return {
      index: idx,
      x: xFor(idx),
      y: yFor(f.predictedPrice),
      value: f.predictedPrice,
      lower: f.lowerBound,
      upper: f.upperBound,
      yLower: yFor(f.lowerBound),
      yUpper: yFor(f.upperBound),
    };
  });

  // ---- harvest marker: snap to the nearest forecast point by date ------------
  let harvest: TimelineGeometry['harvest'] = null;
  if (opts.harvestDate && F > 0) {
    const target = new Date(opts.harvestDate + 'T00:00:00');
    if (!Number.isNaN(target.getTime())) {
      let best = 0;
      let bestD = Infinity;
      forecast.forEach((f, i) => {
        const d = dayDiff(forecastDate(f), target);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const fx = forecastXY[best];
      harvest = { x: fx.x, y: fx.y, index: fx.index, date: opts.harvestDate };
    }
  }

  // ---- svg strings -----------------------------------------------------------
  const historyPolyline = historyXY.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const forecastPolyline = [
    `${todayX.toFixed(1)},${todayY.toFixed(1)}`,
    ...forecastXY.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
  ].join(' ');
  // Band cones out from today (zero width) → upper edge fwd, lower edge back.
  const bandTop = [`${todayX.toFixed(1)},${todayY.toFixed(1)}`, ...forecastXY.map((p) => `${p.x.toFixed(1)},${p.yUpper.toFixed(1)}`)];
  const bandBottom = [...forecastXY.map((p) => `${p.x.toFixed(1)},${p.yLower.toFixed(1)}`).reverse(), `${todayX.toFixed(1)},${todayY.toFixed(1)}`];
  const bandPolygon = F > 0 ? [...bandTop, ...bandBottom].join(' ') : '';

  // ---- y ticks (3–4 gridlines) ----------------------------------------------
  const yTicks: AxisTick[] = ticks.map((v) => ({ value: v, y: yFor(v), label: String(v) }));

  // ---- x ticks (thinned so labels stay readable at 360px) --------------------
  const harvestIndex = harvest?.index ?? -1;
  const step = Math.max(1, Math.ceil(total / maxXLabels));
  const xTicks: XTick[] = [];
  for (let i = 0; i < total; i++) {
    const isForecast = i >= H;
    const d = isForecast ? forecastDate(forecast[i - H]) : monthDate(history[i]);
    const isHarvest = i === harvestIndex;
    const isToday = i === todayIndex;
    const show = i % step === 0 || i === total - 1 || isHarvest || isToday;
    if (!show) continue;
    xTicks.push({ x: xFor(i), label: monthLabel(d), isHarvest, isToday });
  }

  return {
    dims: { width, height, plot },
    domain: { min: niceMin, max: niceMax },
    history: historyXY,
    forecast: forecastXY,
    todayX,
    todayY,
    harvest,
    yTicks,
    xTicks,
    historyPolyline,
    forecastPolyline,
    bandPolygon,
  };
}

// =============================================================================
// Multi-crop comparison geometry (FE-14, ClickUp 86canmejq). Lays 2–3 crops'
// 12-month timelines onto ONE shared y-scale + ONE shared date x-axis so the
// lines are directly comparable. REUSES niceScale + the month/forecast date
// parsers above rather than forking a second scaling implementation.
//
// HONESTY: the y-domain and x-domain are computed from EVERY series' real points
// (history avg + forecast lower/upper/predicted), so a crop with a thin history
// (e.g. Passion) simply starts later and draws a shorter line — we never pad or
// fabricate months to make series look uniform. Forecast bands are returned per
// crop so the component can render them at low opacity (approximate ranges), and
// the mandatory table alternative is built by the component from the same data.
// =============================================================================
export interface CompareSeriesInput {
  cropId: string;
  label: string;
  timeline: CropTimeline;
}
export interface CompareSeriesGeometry {
  cropId: string;
  label: string;
  historyPolyline: string; // solid past line ("" when no history)
  forecastPolyline: string; // dashed forecast line, anchored at last history point
  bandPolygon: string; // low-opacity P10–P90 band ("" when no forecast)
  end: { x: number; y: number } | null; // anchor for the direct end-label
  hasForecast: boolean;
}
export interface CompareGeometry {
  dims: { width: number; height: number; plot: { left: number; right: number; top: number; bottom: number } };
  domain: { min: number; max: number };
  yTicks: AxisTick[];
  xTicks: { x: number; label: string }[];
  series: CompareSeriesGeometry[];
}
export interface CompareGeometryOpts {
  width?: number;
  height?: number;
  monthLabel?: (d: Date) => string;
  maxXLabels?: number;
}

export function buildCompareGeometry(
  inputs: CompareSeriesInput[],
  opts: CompareGeometryOpts = {},
): CompareGeometry | null {
  const width = opts.width ?? 680;
  const height = opts.height ?? 300;
  const monthLabel = opts.monthLabel ?? ((d: Date) => d.toLocaleString('en', { month: 'short' }));
  const maxXLabels = opts.maxXLabels ?? 7;
  // Extra right padding leaves room for the direct end-labels (no legend).
  const plot = { left: 46, right: width - 70, top: 24, bottom: height - 34 };

  const allT: number[] = [];
  const allV: number[] = [];
  const parsed = inputs.map((s) => {
    const hist = s.timeline.history.map((h) => ({ t: monthDate(h).getTime(), v: h.avgPrice }));
    const fc = s.timeline.forecast.map((f) => ({
      t: forecastDate(f).getTime(),
      v: f.predictedPrice,
      lo: f.lowerBound,
      hi: f.upperBound,
    }));
    for (const h of hist) {
      allT.push(h.t);
      allV.push(h.v);
    }
    for (const f of fc) {
      allT.push(f.t);
      allV.push(f.v, f.lo, f.hi);
    }
    return { s, hist, fc };
  });

  if (allT.length === 0) return null;

  const minT = Math.min(...allT);
  const maxT = Math.max(...allT);
  const { niceMin, niceMax, ticks } = niceScale(Math.min(...allV), Math.max(...allV), 4);

  const xFor = (t: number): number =>
    maxT <= minT ? (plot.left + plot.right) / 2 : plot.left + ((t - minT) / (maxT - minT)) * (plot.right - plot.left);
  const yFor = (v: number): number =>
    plot.bottom - ((v - niceMin) / (niceMax - niceMin || 1)) * (plot.bottom - plot.top);

  const series: CompareSeriesGeometry[] = parsed.map(({ s, hist, fc }) => {
    const histXY = hist.map((h) => ({ x: xFor(h.t), y: yFor(h.v) }));
    const anchor = histXY.length ? histXY[histXY.length - 1] : null;
    const fcXY = fc.map((f) => ({ x: xFor(f.t), y: yFor(f.v), yLo: yFor(f.lo), yHi: yFor(f.hi) }));

    const historyPolyline = histXY.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const forecastPolyline = fcXY.length
      ? [...(anchor ? [anchor] : []), ...fcXY.map((p) => ({ x: p.x, y: p.y }))]
          .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
          .join(' ')
      : '';

    let bandPolygon = '';
    if (fcXY.length) {
      const top = [...(anchor ? [{ x: anchor.x, y: anchor.y }] : []), ...fcXY.map((p) => ({ x: p.x, y: p.yHi }))];
      const bottom = [
        ...fcXY.map((p) => ({ x: p.x, y: p.yLo })).reverse(),
        ...(anchor ? [{ x: anchor.x, y: anchor.y }] : []),
      ];
      bandPolygon = [...top, ...bottom].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    }

    const lastPt = fcXY.length ? fcXY[fcXY.length - 1] : histXY.length ? histXY[histXY.length - 1] : null;
    return {
      cropId: s.cropId,
      label: s.label,
      historyPolyline,
      forecastPolyline,
      bandPolygon,
      end: lastPt ? { x: lastPt.x, y: lastPt.y } : null,
      hasForecast: fcXY.length > 0,
    };
  });

  const yTicks: AxisTick[] = ticks.map((v) => ({ value: v, y: yFor(v), label: String(v) }));

  // Monthly x ticks across the shared domain, thinned so labels stay readable.
  const months: Date[] = [];
  const cur = new Date(new Date(minT).getFullYear(), new Date(minT).getMonth(), 1);
  const endMonth = new Date(maxT);
  while (cur.getTime() <= endMonth.getTime()) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  const step = Math.max(1, Math.ceil(months.length / maxXLabels));
  const xTicks: { x: number; label: string }[] = [];
  months.forEach((d, i) => {
    if (i % step !== 0 && i !== months.length - 1) return;
    xTicks.push({ x: xFor(d.getTime()), label: monthLabel(d) });
  });

  return {
    dims: { width, height, plot },
    domain: { min: niceMin, max: niceMax },
    yTicks,
    xTicks,
    series,
  };
}
