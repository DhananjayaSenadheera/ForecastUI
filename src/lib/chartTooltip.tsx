// =============================================================================
// Shared chart tooltip (FE-20). ONE hover/tap/keyboard mechanism reused by every
// SVG line chart: TimelineChart (my-harvest), the Prices page (single-market
// envelope + multi-market overlay) and the CompareCrops overlay. No per-chart
// forks.
//
// ENHANCEMENT, NOT SOLE ACCESS: every value a tooltip shows also lives in each
// chart's mandatory <details> table, so the tooltip is progressive enhancement.
// - Mouse: pointermove -> nearest data point by distance in viewBox coordinates.
// - Touch: pointerdown/move do the same lookup (a tap reveals the nearest point).
// - Keyboard: the SVG is focusable; ArrowLeft/Right step through points, Escape
//   dismisses. Only KEYBOARD steps feed an aria-live region, so screen readers are
//   not spammed by sighted-user pointer moves (they read the table / arrow-step).
// Rendering: a positioned <div> overlay (NOT an SVG <title>), pointer-events:none,
// design tokens, flips near the right edge. Values are pre-formatted by the caller
// (locale-aware) so this module stays presentational + framework-light.
// =============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Nearest point to (px,py) by squared Euclidean distance in viewBox coords.
 * Pure + exported for unit testing. Returns null for an empty set.
 */
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
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = ((e.clientX - rect.left) / rect.width) * viewW;
    const py = ((e.clientY - rect.top) / rect.height) * viewH;
    const n = nearestPoint(points, px, py);
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

/**
 * Positioned tooltip overlay + an aria-live region. Render as a child of a
 * `position:relative` wrapper that also holds the <svg>; percentages map into the
 * same box because the svg fills the wrapper width and keeps its viewBox ratio.
 */
export function ChartTooltip({
  point,
  mode,
  viewW,
  viewH,
}: {
  point: TooltipPoint | null;
  mode: 'pointer' | 'key';
  viewW: number;
  viewH: number;
}) {
  return (
    <>
      {point && (
        <div
          className={`ct-tip${(point.x / viewW) > 0.66 ? ' ct-tip--flip' : ''}${(point.y / viewH) < 0.3 ? ' ct-tip--below' : ''}`}
          style={{ left: `${(point.x / viewW) * 100}%`, top: `${(point.y / viewH) * 100}%` }}
          aria-hidden="true"
        >
          {point.seriesName && <span className="ct-tip__name">{point.seriesName}</span>}
          <span className="ct-tip__label">{point.label}</span>
          <span className="ct-tip__price">{point.valueText}</span>
          {point.bandText && <span className="ct-tip__band">{point.bandText}</span>}
        </div>
      )}
      {/* Keyboard-only announcements — pointer moves stay silent for screen readers. */}
      <span className="ct-live sr-only" role="status" aria-live="polite">
        {point && mode === 'key' ? point.announce : ''}
      </span>
    </>
  );
}
