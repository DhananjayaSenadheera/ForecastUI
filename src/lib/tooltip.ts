// Keeping a hover/focus tooltip inside a narrow screen.
//
// WHOSE SCREEN, EXACTLY. Not a touch phone: both tooltips were already switched off there by
// `@media (hover: none) { display: none }`, so a farmer's Android never laid one out. The
// damage was on NARROW HOVER-CAPABLE viewports — a desktop browser at 375px (where this was
// measured; Chrome's mobile metrics do not change the hover/pointer media features), a
// touchscreen laptop, a tablet with a trackpad. Worth stating plainly, because the tempting
// wrong conclusion is that the hover gate protects the closed state and the unconditional
// `display: none` below is therefore redundant. It is the other way round: the base rule now
// does the protecting on every device, and the hover gate is only about behaviour.
//
// TWO separate problems live here, and only the first one is about looks.
//
// 1. THE TOOLTIP MUST NOT EXIST WHEN IT IS CLOSED. A closed tooltip used to be hidden with
//    `visibility: hidden`, which still lays the box out — and an absolutely positioned box
//    hanging past the right edge of a 375px viewport still counts towards the DOCUMENT's
//    scrollable width. /portfolio therefore laid out 457px wide with nothing visibly wrong,
//    the whole page could be dragged sideways, and (because the initial containing block
//    grows with that overflow) `position: fixed; inset: 0` on the details dialog's backdrop
//    stretched to 457px too, carrying its ✕ off the screen. The fix is in the stylesheet —
//    `display: none` when closed, for everyone — and it is pinned by
//    tooltip-overflow.test.tsx, because jsdom applies no CSS and no behaviour test can see it.
//
// 2. AN OPEN TOOLTIP MUST FIT. The box is anchored at its ⓘ with `inset-inline-start: 0` and
//    is up to 260px wide, so any anchor right of ~115px on a 375px screen opens a tooltip
//    that runs off the edge — truncated text on every hover-capable device narrow enough.
//    CSS alone cannot express "shift left by however much you stick out" (anchor positioning
//    is far too new for the browsers this app targets), so the shift is measured here, in a
//    handler, and written straight onto the node's style. Doing it imperatively in the
//    pointer/focus handler — not via React state — is deliberate: the browser has not painted
//    the hover yet when the handler runs, so the tooltip appears already clamped instead of
//    jumping into place a frame later (and never contributes an overflowing frame).
//
// KNOWN LIMIT: a tooltip held open across a window resize keeps the shift it was given, until
// it is next revealed. Deliberate — there is no resize listener. Re-placing would mean either
// a listener per mounted ⓘ (ten crop cards carry twenty of them) or a shared one, to correct
// a tooltip that a hover-capable user is holding open with one hand while resizing with the
// other. The next hover or focus measures again from scratch.
//
// The maths is a pure function so it can be tested without a layout engine.

/** Breathing room kept between the tooltip and the edge of the screen. */
export const TIP_GUTTER = 8;

/**
 * How far (CSS px, negative = leftwards) a tooltip spanning `left`…`right` must move to sit
 * inside a `viewportWidth`-wide screen. 0 when it already fits.
 *
 * Pulling the end edge in never gets to push the start edge out: a tooltip wider than the
 * screen (only reachable if the max-width is ever raised) is pinned to the start gutter and
 * wraps, rather than being dragged off the other side where nothing can reach it.
 */
export function tipShiftPx(
  left: number,
  right: number,
  viewportWidth: number,
  gutter: number = TIP_GUTTER,
): number {
  let shift = 0;
  const maxRight = viewportWidth - gutter;
  if (right > maxRight) shift = maxRight - right;
  if (left + shift < gutter) shift = gutter - left;
  return Math.round(shift);
}

/**
 * Measure a tooltip that is being revealed and clamp it into the viewport.
 *
 * A tooltip that is not displayed (closed, or a touch device where the whole hover tooltip is
 * switched off) has no box at all, reports a zero-size rect, and is left alone — there is
 * nothing on screen to place, and guessing would leave a stale transform behind.
 */
export function placeTooltip(tip: HTMLElement | null | undefined): void {
  if (!tip) return;
  // Measure the tooltip where CSS puts it, not where the last hover left it.
  tip.style.transform = '';
  const rect = tip.getBoundingClientRect();
  if (rect.width === 0) return;
  const shift = tipShiftPx(rect.left, rect.right, document.documentElement.clientWidth);
  if (shift !== 0) tip.style.transform = `translateX(${shift}px)`;
}

/**
 * Handler for the wrapper of a ⓘ / chip: place the tooltip it contains, marked `data-tip`.
 *
 * The wrapper is the element that owns the `:hover` / `:focus-within` rule, so by the time
 * this runs the tooltip is displayed and can be measured. Attach it to BOTH pointer entry and
 * focus — a keyboard user reveals the same tooltip without a pointer ever moving.
 */
export function onTipReveal(e: { currentTarget: HTMLElement }): void {
  placeTooltip(e.currentTarget.querySelector<HTMLElement>('[data-tip]'));
}
