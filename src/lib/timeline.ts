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
