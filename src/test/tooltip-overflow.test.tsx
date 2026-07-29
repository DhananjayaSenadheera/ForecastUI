// The tooltips must not widen the page, and must fit on it when they open.
//
// THE BUG THIS FILE EXISTS FOR. Both hover tooltips on a crop card — the ⓘ explainer and the
// market chip's full name — used to be hidden with `visibility: hidden`. That keeps the box:
// an absolutely positioned, up-to-260px-wide box anchored at a control on the right of a
// 375px card still counted towards the document's scrollable width. /portfolio laid out
// 457px wide on a 375px phone with nothing visibly wrong, the page dragged sideways, and —
// because a mobile viewport's initial containing block grows with that overflow — the
// details dialog's `position: fixed; inset: 0` backdrop stretched to 457px, putting its ✕ at
// x≈441: off screen, unreachable by touch.
//
// Nothing in jsdom can see any of that: it applies no CSS and has no layout engine, which is
// exactly why the whole suite stayed green while the page was broken. So this file pins the
// two halves the way each half can actually be pinned —
//   • the stylesheet, read as text: closed means display: none, never visibility: hidden;
//   • the clamp maths, as a pure function, and the fact that the components are still wired
//     to call it on reveal.
// The measurement itself (no overflow at 320–430, ✕ back on screen) is a headless-Chrome
// screenshot in the PR, not something a test runner can assert.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { rules, declares } from './support/cssRules';
import { tipShiftPx, placeTooltip, TIP_GUTTER } from '../lib/tooltip';
import InfoHint from '../components/InfoHint';
import '../i18n';

/** jsdom has no layout: documentElement.clientWidth is 0 until a test says otherwise. */
function screenWidth(px: number): void {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: px,
    configurable: true,
  });
}
afterEach(() => {
  screenWidth(0);
  vi.restoreAllMocks();
});

const parsed = rules(readFileSync(resolve(__dirname, '../styles/portfolio.css'), 'utf8'));

/** The two hover tooltips, and the wrapper whose :hover reveals each. */
const TOOLTIPS = [
  { tip: '.pf-hint-tip', wrap: '.pf-hint-wrap' },
  { tip: '.pf-mtab-tip', wrap: '.pf-mtab-wrap' },
];

describe('portfolio.css: a closed tooltip must not be laid out', () => {
  it('parses the stylesheet into real rules (self-check, so a broken parser cannot pass)', () => {
    // Without this every assertion below could pass vacuously on an empty list.
    expect(parsed.length).toBeGreaterThan(50);
    expect(parsed.some((r) => r.selectors.includes('.pf-hint-tip'))).toBe(true);
    expect(parsed.some((r) => r.at.some((a) => a.includes('hover')))).toBe(true);
  });

  it.each(TOOLTIPS)('$tip is display: none until it is revealed', ({ tip }) => {
    const base = parsed.filter((r) => r.selectors.includes(tip) && r.at.length === 0);
    expect(base).toHaveLength(1);
    expect(base[0].body).toMatch(/display\s*:\s*none/);
    // The box is still absolutely positioned — this is the rule that was overflowing, not
    // some unrelated one that happens to share the name.
    expect(base[0].body).toMatch(/position\s*:\s*absolute/);
  });

  it.each(TOOLTIPS)('$tip is never hidden with visibility (the regression that overflowed)', ({ tip }) => {
    const offenders = parsed
      .filter((r) => r.selectors.some((s) => s.includes(tip)))
      .filter((r) => declares(r.body, 'visibility'));
    expect({ visibilityDeclaredOn: offenders.flatMap((r) => r.selectors) }).toEqual({
      visibilityDeclaredOn: [],
    });
  });

  it.each(TOOLTIPS)('$tip is revealed only inside @media (hover: hover)', ({ tip, wrap }) => {
    // Both halves matter. Inside the media query, because a tap must get the inline note and
    // not a tooltip it cannot dismiss. AND as the ONLY reveal, because these selectors are
    // more specific than the base rule: a `@media (hover: none) { .pf-…-tip { display: none } }`
    // override placed after a top-level reveal would lose, and touch would grow the tooltip
    // back — which is how the old rule survived only by never setting `display` at all.
    const reveals = parsed.filter(
      (r) => r.selectors.some((s) => s.startsWith(`${wrap}:`) && s.endsWith(tip)) && declares(r.body, 'display'),
    );
    expect(reveals.length).toBeGreaterThan(0);
    for (const r of reveals) {
      expect(r.body).toMatch(/display\s*:\s*block/);
      expect(r.at.join(' ')).toMatch(/\(\s*hover\s*:\s*hover\s*\)/);
    }
    // Hover and keyboard focus both still reveal it.
    const selectors = reveals.flatMap((r) => r.selectors);
    expect(selectors).toContain(`${wrap}:hover ${tip}`);
    expect(selectors).toContain(`${wrap}:focus-within ${tip}`);
  });
});

describe('tipShiftPx: how far an open tooltip must move to fit', () => {
  it('leaves a tooltip that already fits exactly where CSS put it', () => {
    expect(tipShiftPx(20, 280, 375)).toBe(0);
    // Right on the gutter is still a fit.
    expect(tipShiftPx(20, 375 - TIP_GUTTER, 375)).toBe(0);
  });

  it('pulls an overhanging tooltip back to the gutter', () => {
    // The measured bug: the price-date ⓘ opened 197…457 on a 375px screen.
    expect(tipShiftPx(197, 457, 375)).toBe(-90);
    expect(197 - 90).toBe(107);
    expect(457 - 90).toBe(367); // = 375 − gutter
  });

  it('never pushes the start edge off in the process', () => {
    // Wider than the screen (only reachable if the max-width is raised): pin it to the start
    // gutter and let it wrap, rather than dragging its beginning out of reach.
    expect(tipShiftPx(40, 500, 320)).toBe(-32);
    expect(40 - 32).toBe(TIP_GUTTER);
  });

  it('moves a tooltip that starts off the left edge back in', () => {
    expect(tipShiftPx(-30, 100, 375)).toBe(38);
  });
});

describe('placeTooltip', () => {
  const withRect = (rect: Partial<DOMRect>) => {
    const el = document.createElement('span');
    el.getBoundingClientRect = vi.fn(() => ({ left: 0, right: 0, width: 0, ...rect }) as DOMRect);
    return el;
  };

  it('does nothing to a tooltip with no box (closed, or a touch device)', () => {
    const el = withRect({ left: 0, right: 0, width: 0 });
    el.style.transform = 'translateX(-90px)';
    placeTooltip(el);
    // Cleared, not kept: a stale shift computed for another screen width would misplace the
    // next reveal, and there is nothing on screen to measure.
    expect(el.style.transform).toBe('');
  });

  it('shifts an overhanging tooltip inside the viewport', () => {
    screenWidth(375);
    const el = withRect({ left: 197, right: 457, width: 260 });
    placeTooltip(el);
    expect(el.style.transform).toBe('translateX(-90px)');
  });

  it('tolerates a missing tooltip', () => {
    expect(() => placeTooltip(null)).not.toThrow();
  });
});

describe('InfoHint stays wired to the clamp', () => {
  it('places its tooltip when the ⓘ is hovered or focused', () => {
    render(<InfoHint hint="Prices are collected the day before." id="t1" label="What is this?" />);
    const tip = document.querySelector<HTMLElement>('.pf-hint-tip');
    expect(tip).not.toBeNull();
    // The tooltip must stay in the DOM even while it is hidden: aria-describedby points at
    // it, and a directly referenced element's text is used for the description regardless.
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-describedby', tip!.id);
    expect(tip).toHaveAttribute('data-tip'); // how the handler finds it

    tip!.getBoundingClientRect = vi.fn(
      () => ({ left: 197, right: 457, width: 260 }) as DOMRect,
    );
    screenWidth(375);

    const wrap = document.querySelector('.pf-hint-wrap')!;
    // pointerOver, not pointerEnter: React synthesises the enter events from over/out, so a
    // bare `pointerenter` (which does not bubble) never reaches the handler.
    fireEvent.pointerOver(wrap);
    expect(tip!.style.transform).toBe('translateX(-90px)');

    tip!.style.transform = '';
    btn.focus(); // keyboard reveal, no pointer involved
    expect(tip!.style.transform).toBe('translateX(-90px)');
  });
});
