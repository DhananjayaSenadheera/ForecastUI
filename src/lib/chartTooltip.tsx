// Shared chart tooltip: one hover/tap/keyboard mechanism reused by every SVG line chart
// (timeline, prices, compare) — no per-chart forks.
// It is an ENHANCEMENT, not the only access: every value also lives in each chart's
// <details> table. Pointer moves find the nearest point in viewBox coordinates; the SVG is
// focusable and ArrowLeft/Right step through points, Escape dismisses. Only KEYBOARD steps
// feed the aria-live region, so screen readers are not spammed by pointer movement.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

/** A hit target for the tooltip. Coordinates are in the chart's viewBox space. */
export interface TooltipPoint {
  key: string; // stable unique id (seriesKey + x)
  x: number; // viewBox x
  y: number; // viewBox y
  seriesName?: string; // crop/market name on multi-series charts
  label: string; // pre-formatted date/month
  valueText: string; // pre-formatted price, e.g. "Rs. 552"
  bandText?: string; // forecast band, e.g. "likely Rs. 233 – 694"
  announce: string; // full sentence for aria-live (keyboard only)
}

/** Nearest point to (px,py) by squared distance in viewBox coords; null for an empty set. */
export function nearestPoint(points: TooltipPoint[], px: number, py: number): TooltipPoint | null {
  let best: TooltipPoint | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const dx = p.x - px;
    const dy = p.y - py;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** The subset of DOMRect the placement maths needs (so it can be unit-tested with plain
 *  objects — jsdom never lays anything out). */
export interface BoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the tip goes, in CSS pixels relative to the `position:relative` wrapper. */
export interface TipPlacement {
  leftPx: number;
  topPx: number;
  /** Point sits in the right third of the DRAWN chart: anchor the tip's right side. */
  flip: boolean;
  /** Point sits high in the DRAWN chart: drop the tip below it. */
  below: boolean;
}

/** Fractions of the drawn plot at which the tip flips / drops below. */
export const TIP_FLIP_AT = 0.66;
export const TIP_BELOW_AT = 0.3;

/**
 * Map a viewBox point to wrapper pixels.
 *
 * The tip is an absolutely-positioned child of `.ct-wrap`, but the <svg> is NOT always the
 * same box as that wrapper: `.pr-svg` is capped at 680px and `.tl-svg` at 660px while the
 * wrapper stretches with the page, so percentages of the WRAPPER put the tip far to the
 * right of the point it describes (~281px out at a 1280px viewport). And because the SVG
 * keeps its default `preserveAspectRatio="xMidYMid meet"`, a CSS cap on one axis
 * (e.g. `.pf-card__chart .pr-svg { max-height:160px }`) letterboxes the drawing INSIDE the
 * element box, so even svg-relative percentages can be wrong. Both are handled here: scale
 * uniformly to fit, centre the letterbox, then offset by where the svg sits in the wrapper.
 *
 * Returns null when nothing has been laid out yet (jsdom, or a hidden chart) — the caller
 * falls back to the old percentages, which are exactly right when wrapper == svg.
 */
export function svgPointToWrapPx(
  point: { x: number; y: number },
  viewW: number,
  viewH: number,
  svgRect: BoxRect,
  wrapRect: BoxRect,
): TipPlacement | null {
  if (!(viewW > 0) || !(viewH > 0)) return null;
  if (!(svgRect.width > 0) || !(svgRect.height > 0)) return null;

  const scale = Math.min(svgRect.width / viewW, svgRect.height / viewH);
  const drawnW = viewW * scale;
  const drawnH = viewH * scale;
  // Top-left of the drawn plot, relative to the wrapper's origin. NOTE: these are
  // border-box origins (getBoundingClientRect), while an absolutely-positioned tip
  // resolves left/top against the wrapper's PADDING box — equal only while .ct-wrap
  // carries no border, which is true of every wrapper today. Give a wrapper a border and
  // every tip shifts by it; subtract borderLeft/TopWidth here if that day comes.
  const drawnLeft = svgRect.left - wrapRect.left + (svgRect.width - drawnW) / 2;
  const drawnTop = svgRect.top - wrapRect.top + (svgRect.height - drawnH) / 2;

  const leftPx = drawnLeft + point.x * scale;
  const topPx = drawnTop + point.y * scale;
  return {
    leftPx,
    topPx,
    // (leftPx − drawnLeft) / drawnW is ALGEBRAICALLY point.x / viewW — the scale and the
    // letterbox offset cancel — so these thresholds are identical to the viewBox-fraction
    // test the percentage era used, at every geometry. Written this way, and with the
    // constants exported, only so the placement and its thresholds read from one place and
    // the two call sites (here and the percentage fallback) cannot drift apart.
    flip: (leftPx - drawnLeft) / drawnW > TIP_FLIP_AT,
    below: (topPx - drawnTop) / drawnH < TIP_BELOW_AT,
  };
}

/**
 * The inverse mapping, for HIT-TESTING: pointer client coordinates → viewBox coordinates,
 * through the same uniform meet-scale + letterbox centring as svgPointToWrapPx. Placement
 * and hit-testing MUST share one transform: the old full-element-box division was fine while
 * no chart letterboxed, but the moment a CSS cap binds one axis (`.pf-card__chart .pr-svg
 * { max-height:160px }` is ~3px from binding in the popup column) a full-box inverse picks
 * points as if the drawing filled the element while the tip lands on the drawn geometry —
 * two different answers for one cursor (round-1 review find).
 * Returns null when the svg has no layout; the caller simply ignores the move.
 */
export function pointerToViewBox(
  clientX: number,
  clientY: number,
  viewW: number,
  viewH: number,
  svgRect: BoxRect,
): { px: number; py: number } | null {
  if (!(viewW > 0) || !(viewH > 0)) return null;
  if (!(svgRect.width > 0) || !(svgRect.height > 0)) return null;
  const scale = Math.min(svgRect.width / viewW, svgRect.height / viewH);
  const offX = (svgRect.width - viewW * scale) / 2;
  const offY = (svgRect.height - viewH * scale) / 2;
  return {
    px: (clientX - svgRect.left - offX) / scale,
    py: (clientY - svgRect.top - offY) / scale,
  };
}

export interface ChartTooltipController {
  active: TooltipPoint | null;
  mode: 'pointer' | 'key';
  /** Spread onto the <svg>: pointer + keyboard handlers + focusability. */
  svgProps: {
    tabIndex: number;
    onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerLeave: () => void;
    onKeyDown: (e: ReactKeyboardEvent<SVGSVGElement>) => void;
    onBlur: () => void;
  };
}

export function useChartTooltip(points: TooltipPoint[], viewW: number, viewH: number): ChartTooltipController {
  const [active, setActive] = useState<TooltipPoint | null>(null);
  const [mode, setMode] = useState<'pointer' | 'key'>('pointer');
  const idxRef = useRef(0);
  const sorted = useMemo(() => [...points].sort((a, b) => a.x - b.x || a.y - b.y), [points]);

  // Drop a stale active point when the underlying series change (crop/market swap).
  useEffect(() => {
    setActive((cur) => (cur && points.some((p) => p.key === cur.key) ? cur : null));
  }, [points]);

  const fromPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    // Same uniform transform as the tip's placement (pointerToViewBox is svgPointToWrapPx's
    // inverse) — a cursor and the tip it summons must agree on where the drawing is.
    const m = pointerToViewBox(e.clientX, e.clientY, viewW, viewH, toBox(e.currentTarget.getBoundingClientRect()));
    if (!m) return;
    const n = nearestPoint(points, m.px, m.py);
    setMode('pointer');
    setActive(n);
    if (n) idxRef.current = sorted.findIndex((p) => p.key === n.key);
  };

  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Escape') {
      setActive(null);
      return;
    }
    if (!sorted.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      let i = active ? idxRef.current : e.key === 'ArrowRight' ? -1 : sorted.length;
      i += e.key === 'ArrowRight' ? 1 : -1;
      i = Math.max(0, Math.min(sorted.length - 1, i));
      idxRef.current = i;
      setMode('key');
      setActive(sorted[i]);
    }
  };

  return {
    active,
    mode,
    svgProps: {
      tabIndex: 0,
      onPointerMove: fromPointer,
      onPointerDown: fromPointer,
      onPointerLeave: () => setActive(null),
      onKeyDown,
      onBlur: () => setActive(null),
    },
  };
}

function toBox(r: DOMRect): BoxRect {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
function sameBox(a: BoxRect, b: BoxRect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/**
 * Positioned tooltip overlay + an aria-live region. Render it as a child of the
 * `position:relative` wrapper that also holds the <svg>.
 *
 * It measures the SVG's rendered box (not the wrapper's) and places the tip in pixels —
 * see svgPointToWrapPx. Pass `svgRef` so the measurement never has to guess which element
 * is the chart; without one it falls back to the wrapper's first <svg>, and without any
 * layout at all it falls back to wrapper percentages (correct whenever wrapper == svg).
 */
export function ChartTooltip({
  point,
  mode,
  viewW,
  viewH,
  svgRef,
}: {
  point: TooltipPoint | null;
  mode: 'pointer' | 'key';
  viewW: number;
  viewH: number;
  svgRef?: { current: SVGSVGElement | null };
}) {
  // The live region is always mounted, so it is a stable anchor for finding the wrapper.
  // It is position:absolute (.sr-only), so offsetParent IS the .ct-wrap containing block
  // that the tip's own left/top resolve against.
  const liveRef = useRef<HTMLSpanElement>(null);
  const [boxes, setBoxes] = useState<{ svg: BoxRect; wrap: BoxRect } | null>(null);

  const resolveEls = useCallback(() => {
    const live = liveRef.current;
    const wrap = ((live?.offsetParent as HTMLElement | null) ?? live?.parentElement) ?? null;
    const svg = svgRef?.current ?? wrap?.querySelector('svg') ?? null;
    return { wrap, svg };
  }, [svgRef]);

  const measure = useCallback(() => {
    const { wrap, svg } = resolveEls();
    if (!wrap || !svg) {
      setBoxes(null);
      return;
    }
    const s = toBox(svg.getBoundingClientRect());
    const w = toBox(wrap.getBoundingClientRect());
    if (!s.width || !s.height) {
      setBoxes(null);
      return;
    }
    // Only re-render when the geometry actually moved (hover fires this constantly).
    setBoxes((cur) => (cur && sameBox(cur.svg, s) && sameBox(cur.wrap, w) ? cur : { svg: s, wrap: w }));
  }, [resolveEls]);

  // Measure before the paint that shows or moves the tip. This is what keeps the very first
  // KEYBOARD activation right: there is no pointer event to piggyback on. It MUST stay a
  // LAYOUT effect: as a passive effect the first tip would paint one frame at the fallback
  // percentage position (the ~281px-out bug position) and then TRANSITION to the right one.
  // jsdom cannot catch that regression — act() flushes passive effects before any assertion
  // — so a source-text test pins the choice instead (chart-tooltip.test.tsx).
  //
  // Then watch, but only while a tip is actually on screen — a tap leaves one pinned, and
  // this app runs on mid-range Androids, so an idle chart must cost nothing. Observing BOTH
  // boxes is enough: a rigid page shift moves them together and cancels out of
  // (svgRect.left - wrapRect.left), so only a RESIZE can invalidate the mapping. Opening
  // the details dialog locks body scroll, which drops the scrollbar and reflows every
  // column ~15px wider — that is a resize, and it fires here.
  // Keyed on WHETHER a tip is shown, not which point it shows: geometry cannot change
  // between two points of one chart without a resize the observer already sees, and keying
  // on the point object would rebuild the observer (+ force a layout) for every step of a
  // cursor across the chart. Observers are (re)attached per visible tip, so a chart that
  // had no layout at mount still gets watched once it does.
  const hasPoint = point !== null;
  useLayoutEffect(() => {
    measure();
    if (!hasPoint || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    const { wrap, svg } = resolveEls();
    if (wrap) ro.observe(wrap);
    if (svg) ro.observe(svg);
    return () => ro.disconnect();
  }, [measure, resolveEls, hasPoint]);

  const placed = point && boxes ? svgPointToWrapPx(point, viewW, viewH, boxes.svg, boxes.wrap) : null;
  const flip = point ? (placed ? placed.flip : point.x / viewW > TIP_FLIP_AT) : false;
  const below = point ? (placed ? placed.below : point.y / viewH < TIP_BELOW_AT) : false;
  const style = placed
    ? { left: `${placed.leftPx}px`, top: `${placed.topPx}px` }
    : point
      ? { left: `${(point.x / viewW) * 100}%`, top: `${(point.y / viewH) * 100}%` }
      : undefined;

  return (
    <>
      {point && (
        <div
          className={`ct-tip${flip ? ' ct-tip--flip' : ''}${below ? ' ct-tip--below' : ''}`}
          style={style}
          aria-hidden="true"
        >
          {point.seriesName && <span className="ct-tip__name">{point.seriesName}</span>}
          <span className="ct-tip__label">{point.label}</span>
          <span className="ct-tip__price">{point.valueText}</span>
          {point.bandText && <span className="ct-tip__band">{point.bandText}</span>}
        </div>
      )}
      {/* Keyboard-only announcements — pointer moves stay silent for screen readers. */}
      <span className="ct-live sr-only" role="status" aria-live="polite" ref={liveRef}>
        {point && mode === 'key' ? point.announce : ''}
      </span>
    </>
  );
}
