import { describe, it, expect, afterEach, vi } from 'vitest';
import { useRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  nearestPoint,
  svgPointToWrapPx,
  pointerToViewBox,
  useChartTooltip,
  ChartTooltip,
  type TooltipPoint,
} from '../lib/chartTooltip';

// Two crops/markets overlaid; a past point per series plus one forecast point that
// carries a band — exercises multi-series naming + the "likely" band text.
const POINTS: TooltipPoint[] = [
  { key: 'cap-h', x: 10, y: 50, seriesName: 'Capsicum', label: 'Jul 2026', valueText: 'Rs. 400', announce: 'Capsicum · Jul 2026 · Rs. 400' },
  { key: 'bea-h', x: 10, y: 60, seriesName: 'Beans', label: 'Jul 2026', valueText: 'Rs. 300', announce: 'Beans · Jul 2026 · Rs. 300' },
  { key: 'cap-f', x: 90, y: 40, seriesName: 'Capsicum', label: '15 Oct 2026', valueText: 'Rs. 552', bandText: 'likely Rs. 233 – 694', announce: 'Capsicum · 15 Oct 2026 · Rs. 552 · likely Rs. 233 – 694' },
];

function Harness({ points = POINTS }: { points?: TooltipPoint[] }) {
  const tt = useChartTooltip(points, 100, 100);
  return (
    <div className="ct-wrap">
      <svg data-testid="chart" viewBox="0 0 100 100" role="img" aria-label="chart" {...tt.svgProps} />
      <ChartTooltip point={tt.active} mode={tt.mode} viewW={100} viewH={100} />
    </div>
  );
}

describe('chartTooltip — nearest-point math', () => {
  it('picks the closest point by Euclidean distance', () => {
    expect(nearestPoint(POINTS, 88, 42)?.key).toBe('cap-f');
    expect(nearestPoint(POINTS, 9, 49)?.key).toBe('cap-h');
    expect(nearestPoint(POINTS, 11, 61)?.key).toBe('bea-h');
  });
  it('returns null for an empty set', () => {
    expect(nearestPoint([], 0, 0)).toBeNull();
  });
});

// The real single-market chart: 640x220 viewBox, last point at x=626 (plot.right), and
// the CSS cap that caused the bug — .pr-svg maxes out at 680px inside a wrapper that
// stretches to the page column (967px at a 1280px viewport).
const VW = 640;
const VH = 220;
const LAST_X = 626;
const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe('svgPointToWrapPx — viewBox -> wrapper pixels', () => {
  it('is the identity when the wrapper IS the svg box at scale 1', () => {
    const p = svgPointToWrapPx({ x: LAST_X, y: 110 }, VW, VH, box(0, 0, VW, VH), box(0, 0, VW, VH))!;
    expect(p.leftPx).toBeCloseTo(626, 6);
    expect(p.topPx).toBeCloseTo(110, 6);
  });

  it('scales with a uniformly resized svg', () => {
    const p = svgPointToWrapPx({ x: 320, y: 110 }, VW, VH, box(0, 0, 320, 110), box(0, 0, 320, 110))!;
    expect(p.leftPx).toBeCloseTo(160, 6);
    expect(p.topPx).toBeCloseTo(55, 6);
  });

  it('THE BUG: a wrapper wider than the capped svg no longer drags the tip off the chart', () => {
    // svg 680x233.75 (640x220 at scale 1.0625) inside a 967px wrapper.
    const svg = box(0, 0, 680, 233.75);
    const wrap = box(0, 0, 967, 233.75);
    const p = svgPointToWrapPx({ x: LAST_X, y: 110 }, VW, VH, svg, wrap)!;
    expect(p.leftPx).toBeCloseTo(665.125, 3); // 626 * 1.0625
    // The old wrapper-percentage answer, and the ~281px displacement it produced.
    const oldLeftPx = (LAST_X / VW) * wrap.width;
    expect(oldLeftPx).toBeCloseTo(945.83, 1);
    expect(oldLeftPx - p.leftPx).toBeGreaterThan(275);
    // The point must land inside the drawn chart, never past its right edge.
    expect(p.leftPx).toBeLessThanOrEqual(svg.width);
  });

  it('adds the svg offset when the svg is inset inside the wrapper', () => {
    const p = svgPointToWrapPx({ x: LAST_X, y: 110 }, VW, VH, box(100, 12, 680, 233.75), box(40, 0, 967, 250))!;
    expect(p.leftPx).toBeCloseTo(60 + 665.125, 3); // (100-40) + 626*1.0625
    expect(p.topPx).toBeCloseTo(12 + 116.875, 3); // (12-0) + 110*1.0625
  });

  it('centres the drawing when a max-height cap letterboxes it horizontally', () => {
    // .pf-card__chart .pr-svg { max-height:160px } binding on a 640px-wide element.
    const p = svgPointToWrapPx({ x: LAST_X, y: 110 }, VW, VH, box(0, 0, 640, 160), box(0, 0, 640, 160))!;
    const scale = 160 / VH; // 0.72727 — height binds
    const pad = (640 - VW * scale) / 2; // 87.27 pillarbox on each side
    expect(p.leftPx).toBeCloseTo(pad + LAST_X * scale, 3);
    expect(p.topPx).toBeCloseTo(80, 3);
    expect(p.leftPx).toBeLessThan(640 - pad); // still inside the drawing
  });

  it('centres the drawing when a width cap letterboxes it vertically', () => {
    const p = svgPointToWrapPx({ x: 320, y: 110 }, VW, VH, box(0, 0, 320, 220), box(0, 0, 320, 220))!;
    expect(p.leftPx).toBeCloseTo(160, 3);
    expect(p.topPx).toBeCloseTo(55 + 55, 3); // 55px letterbox + 110*0.5
  });

  it('flips in the right third and drops below in the top 30% of the DRAWN box', () => {
    const at = (x: number, y: number, svg = box(0, 0, 100, 100), wrap = box(0, 0, 100, 100)) =>
      svgPointToWrapPx({ x, y }, 100, 100, svg, wrap)!;
    expect(at(66, 50).flip).toBe(false);
    expect(at(67, 50).flip).toBe(true);
    expect(at(50, 30).below).toBe(false);
    expect(at(50, 29).below).toBe(true);
    // Same fractions on a letterboxed, offset box — thresholds follow the drawing.
    const svg = box(200, 0, 400, 100);
    const wrap = box(0, 0, 900, 100);
    expect(at(66, 50, svg, wrap).flip).toBe(false);
    expect(at(67, 50, svg, wrap).flip).toBe(true);
    expect(at(50, 29, svg, wrap).below).toBe(true);
  });

  it('returns null when nothing has been laid out (jsdom, hidden chart, bad viewBox)', () => {
    expect(svgPointToWrapPx({ x: 1, y: 1 }, VW, VH, box(0, 0, 0, 0), box(0, 0, 0, 0))).toBeNull();
    expect(svgPointToWrapPx({ x: 1, y: 1 }, VW, VH, box(0, 0, 680, 0), box(0, 0, 967, 0))).toBeNull();
    expect(svgPointToWrapPx({ x: 1, y: 1 }, 0, VH, box(0, 0, 680, 234), box(0, 0, 967, 234))).toBeNull();
  });
});

// Wires the real component to stubbed layout: only the <svg> and the .ct-wrap report a box,
// everything else stays 0x0 (as in real jsdom), so a wrong wrapper lookup shows up as a
// wrong number rather than passing quietly.
function stubLayout(svg: ReturnType<typeof box>, wrap: ReturnType<typeof box>, deco = box(0, 0, 0, 0)) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const r = this.classList.contains('deco')
      ? deco
      : this.tagName.toLowerCase() === 'svg'
        ? svg
        : this.classList.contains('ct-wrap')
          ? wrap
          : box(0, 0, 0, 0);
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) } as DOMRect;
  });
}

// jsdom has no ResizeObserver. This stands in for one: it records what is being observed
// and lets a test fire the callback by hand.
function stubResizeObserver() {
  const live = new Set<{ els: Element[]; cb: () => void }>();
  class RO {
    entry = { els: [] as Element[], cb: () => {} };
    constructor(cb: () => void) {
      this.entry.cb = cb;
      live.add(this.entry);
    }
    observe(el: Element) { this.entry.els.push(el); }
    unobserve() { /* unused */ }
    disconnect() { live.delete(this.entry); }
  }
  vi.stubGlobal('ResizeObserver', RO);
  return {
    observed: () => [...live].flatMap((e) => e.els).map((el) => el.tagName),
    fire: () => live.forEach((e) => e.cb()),
  };
}

function MeasuredHarness({ decoy = false }: { decoy?: boolean }) {
  const points: TooltipPoint[] = [
    { key: 'a', x: 10, y: 110, label: 'Jul 1', valueText: 'Rs. 100', announce: 'Jul 1 · Rs. 100' },
    { key: 'z', x: LAST_X, y: 110, label: 'Jul 30', valueText: 'Rs. 200', announce: 'Jul 30 · Rs. 200' },
  ];
  const tt = useChartTooltip(points, VW, VH);
  const svgRef = useRef<SVGSVGElement>(null);
  return (
    <div className="ct-wrap">
      {/* A decorative icon that happens to sit inside the wrapper BEFORE the chart. */}
      {decoy && <svg className="deco" aria-hidden="true" />}
      <svg ref={svgRef} data-testid="chart" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="chart" {...tt.svgProps} />
      <ChartTooltip point={tt.active} mode={tt.mode} viewW={VW} viewH={VH} svgRef={svgRef} />
    </div>
  );
}

describe('ChartTooltip — placement against the measured svg box', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('positions the last point in pixels on the chart, not on the wider wrapper', () => {
    stubLayout(box(100, 12, 680, 233.75), box(40, 0, 967, 250));
    render(<MeasuredHarness />);
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowLeft' }); // first keyboard activation lands on the LAST point
    const tip = document.querySelector('.ct-tip') as HTMLElement;
    expect(tip.textContent).toContain('Rs. 200');
    expect(parseFloat(tip.style.left)).toBeCloseTo(725.125, 2); // 60 + 626*1.0625
    expect(tip.style.left.endsWith('px')).toBe(true);
    expect(parseFloat(tip.style.top)).toBeCloseTo(128.875, 2); // 12 + 110*1.0625
    expect(tip.className).toContain('ct-tip--flip');
    expect(tip.className).not.toContain('ct-tip--below');
  });

  it('re-measures when the chart is resized under a VISIBLE tooltip', () => {
    const ro = stubResizeObserver();
    stubLayout(box(0, 0, 680, 233.75), box(0, 0, 967, 233.75));
    render(<MeasuredHarness />);
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    expect(parseFloat((document.querySelector('.ct-tip') as HTMLElement).style.left)).toBeCloseTo(665.125, 2);
    // Both boxes are watched (the drawn box is what the mapping depends on).
    expect(ro.observed()).toEqual(expect.arrayContaining(['DIV', 'svg']));
    // The dialog locks body scroll: the scrollbar goes and the column reflows narrower.
    stubLayout(box(0, 0, 360, 123.75), box(0, 0, 360, 123.75));
    act(() => ro.fire());
    expect(parseFloat((document.querySelector('.ct-tip') as HTMLElement).style.left)).toBeCloseTo(352.125, 2);
  });

  it('watches nothing while no tooltip is shown', () => {
    const ro = stubResizeObserver();
    stubLayout(box(0, 0, 680, 233.75), box(0, 0, 967, 233.75));
    render(<MeasuredHarness />);
    expect(ro.observed()).toEqual([]); // idle chart costs nothing
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    expect(ro.observed().length).toBe(2);
    fireEvent.keyDown(svg, { key: 'Escape' });
    expect(ro.observed()).toEqual([]); // ...and stops again on dismiss
  });

  it('measures on the FIRST keyboard activation, with no pointer event to piggyback on', () => {
    render(<MeasuredHarness />); // mounts before the chart column has any layout
    stubLayout(box(0, 0, 680, 233.75), box(0, 0, 967, 233.75)); // laid out later, no resize event
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    const tip = document.querySelector('.ct-tip') as HTMLElement;
    expect(parseFloat(tip.style.left)).toBeCloseTo(665.125, 2);
  });

  it('uses the svgRef, not "the first svg in the wrapper", when an icon shares the box', () => {
    stubLayout(box(0, 0, 680, 233.75), box(0, 0, 967, 233.75), box(0, 0, 16, 16));
    render(<MeasuredHarness decoy />);
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    const tip = document.querySelector('.ct-tip') as HTMLElement;
    expect(parseFloat(tip.style.left)).toBeCloseTo(665.125, 2); // the chart's box, not the 16px icon's
  });

  it('falls back to wrapper percentages when nothing is laid out', () => {
    render(<MeasuredHarness />); // no layout stub: every rect is 0x0
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    const tip = document.querySelector('.ct-tip') as HTMLElement;
    expect(tip.style.left).toBe(`${(LAST_X / VW) * 100}%`);
    expect(tip.className).toContain('ct-tip--flip');
  });
});

describe('ChartTooltip — keyboard access + band + multi-series naming', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reveals the tooltip on ArrowRight and names the series (keyboard)', () => {
    render(<Harness />);
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowRight' }); // sorted-by-x -> first point
    const tip = document.querySelector('.ct-tip')!;
    expect(tip).toBeInTheDocument();
    expect(tip.textContent).toContain('Capsicum');
    expect(tip.textContent).toContain('Rs. 400');
    // keyboard mode announces via the aria-live region
    expect(document.querySelector('.ct-live')?.textContent).toContain('Capsicum');
  });

  it('shows the honest band text on a forecast point', () => {
    render(<Harness />);
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowRight' }); // point 0 (x=10,y=50)
    fireEvent.keyDown(svg, { key: 'ArrowRight' }); // point 1 (x=10,y=60)
    fireEvent.keyDown(svg, { key: 'ArrowRight' }); // point 2 (x=90) forecast
    const tip = document.querySelector('.ct-tip')!;
    expect(tip.textContent).toContain('Rs. 552');
    expect(tip.textContent).toContain('likely Rs. 233 – 694');
  });

  it('dismisses on Escape and on blur', () => {
    render(<Harness />);
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(document.querySelector('.ct-tip')).toBeInTheDocument();
    fireEvent.keyDown(svg, { key: 'Escape' });
    expect(document.querySelector('.ct-tip')).toBeNull();
  });

  it('renders on a simulated pointer move (nearest point under the cursor)', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    render(<Harness />);
    const svg = screen.getByTestId('chart');
    const ev: Event & { clientX?: number; clientY?: number } = new Event('pointermove', { bubbles: true });
    ev.clientX = 90;
    ev.clientY = 40;
    fireEvent(svg, ev);
    const tip = document.querySelector('.ct-tip')!;
    expect(tip).toBeInTheDocument();
    expect(tip.textContent).toContain('Rs. 552'); // the forecast point nearest (90,40)
    // pointer mode does NOT spam the live region
    expect(document.querySelector('.ct-live')?.textContent).toBe('');
  });
});

/* ---- The inverse mapping: hit-testing must share the placement's transform ------------- */

describe('pointerToViewBox — svgPointToWrapPx run backwards', () => {
  // Wrapper at origin so wrapper pixels ARE client pixels: the roundtrip needs one frame.
  const wrapAt = (svg: { left: number; top: number; width: number; height: number }) => ({
    left: 0,
    top: 0,
    width: svg.left + svg.width,
    height: svg.top + svg.height,
  });

  it('round-trips through svgPointToWrapPx exactly, including letterboxed geometry', () => {
    const geometries = [
      { left: 0, top: 0, width: 640, height: 220 }, // 1:1
      { left: 20, top: 8, width: 680, height: 233.75 }, // scaled, offset in wrap
      { left: 0, top: 0, width: 680, height: 160 }, // pillarboxed (max-height binding)
      { left: 10, top: 0, width: 300, height: 220 }, // narrow: vertical letterbox
    ];
    for (const svg of geometries) {
      for (const p of [{ x: 0, y: 0 }, { x: 626, y: 40 }, { x: 320, y: 110 }, { x: 640, y: 220 }]) {
        const placed = svgPointToWrapPx(p, 640, 220, svg, wrapAt(svg));
        expect(placed).not.toBeNull();
        // The wrapper sits at the client origin, so placement pixels are client pixels.
        const back = pointerToViewBox(placed!.leftPx, placed!.topPx, 640, 220, svg);
        expect(back).not.toBeNull();
        expect(back!.px).toBeCloseTo(p.x, 6);
        expect(back!.py).toBeCloseTo(p.y, 6);
      }
    }
  });

  it('maps a cursor on a pillarboxed drawing to the DRAWN plot, not the element box', () => {
    // 640x220 viewBox inside a 680x160-capped element: scale = 160/220, drawing centred
    // with 107.27px bars each side. A cursor at the drawing's true horizontal centre:
    const svg = { left: 100, top: 50, width: 680, height: 160 };
    const scale = 160 / 220;
    const centreX = 100 + 680 / 2; // drawing is centred, so element centre == drawing centre
    const m = pointerToViewBox(centreX, 50 + 80, 640, 220, svg);
    expect(m!.px).toBeCloseTo(320, 6);
    expect(m!.py).toBeCloseTo(110, 6);
    // The OLD full-element-box mapping put the drawing's right edge at px≈640 for a cursor
    // still 107px inside the element — this mapping puts it where the ink actually stops.
    const rightEdgeOfInk = 100 + 680 / 2 + (640 / 2) * scale;
    const edge = pointerToViewBox(rightEdgeOfInk, 50 + 80, 640, 220, svg);
    expect(edge!.px).toBeCloseTo(640, 6);
  });

  it('returns null for unlaid-out geometry, like its forward twin', () => {
    expect(pointerToViewBox(10, 10, 640, 220, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
    expect(pointerToViewBox(10, 10, 0, 220, { left: 0, top: 0, width: 100, height: 100 })).toBeNull();
  });
});

describe('the layout-effect choice is pinned in source (jsdom cannot see it)', () => {
  it('measures in useLayoutEffect, never useEffect', () => {
    // act() flushes passive effects synchronously, so a useEffect mutant passes every
    // behavioural test in this file while shipping a one-frame tooltip at the old bug
    // position that then TRANSITIONS to the fix. The choice is only visible in source.
    const src = readFileSync(resolve(__dirname, '../lib/chartTooltip.tsx'), 'utf8');
    const effect = /use(Layout)?Effect\(\(\) => \{\s*\n\s*measure\(\);/.exec(src);
    expect(effect).not.toBeNull();
    expect(effect![1]).toBe('Layout');
  });
});
