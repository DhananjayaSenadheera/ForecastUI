// The watchlist grid's column minimum, as a tripwire — a sibling of
// css-containment-boundary.test.ts, and it exists for the same reason: a regression that
// breaks the product on every desktop while all 900-odd behaviour tests stay green.
//
// WHY THIS EXISTS. Two numbers in portfolio.css have to agree and are 800 lines apart:
//   * the GRID decides how wide a card is (`repeat(auto-fill, minmax(<min>, 1fr))`);
//   * the CARD's container query decides, from that width, whether the price and the trend
//     badge share a line (`@container pf-card (min-width: <band>)`).
// The query container is the inner surface's CONTENT box, so a card is `<band> + padding +
// border` wide before the side-by-side row switches on. When the grid minimum was 300px, a
// maximised 1280px window packed 311px cards — 277px of container — and every desktop card
// silently rendered the phone arrangement with the badge stacked under the price. Nothing
// failed; it just looked wrong, which is what the owner reported.
//
// jsdom applies no CSS and evaluates no container queries, so this can only be pinned as
// source. The widths themselves were measured in headless Chrome (see the PR table); this
// test pins the RELATIONSHIP between the two numbers, so moving either one alone fails here.
//
// WHAT THIS IS NOT: a layout oracle. It knows one grid rule, one band and one box model. If
// the card's padding stops coming from --sp-4, or the price row learns a third arrangement,
// re-measure in a browser and update this file deliberately.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const portfolioCss = readFileSync(resolve(__dirname, '../styles/portfolio.css'), 'utf8');
const tokensCss = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8');

/** The grid's own minimum: the `356` in `minmax(min(100%, 356px), 1fr)`. */
const gridMinimum = portfolioCss.match(
  /grid-template-columns:\s*repeat\(\s*auto-fill\s*,\s*minmax\(\s*min\(\s*100%\s*,\s*(\d+(?:\.\d+)?)px\s*\)/,
);

/** Every min-width band the card queries — the widest is the one a card has to clear if
 *  the whole wide-card arrangement (price row, badge cap, split prediction) is to apply. */
const cardBands = [...portfolioCss.matchAll(/@container\s+pf-card\s+\(min-width:\s*(\d+(?:\.\d+)?)px\)/g)]
  .map((m) => Number(m[1]));
const widestBand = cardBands.length > 0 ? Math.max(...cardBands) : NaN;

/** The card's inner padding token — the container is that much narrower on each side. */
const spacingToken = tokensCss.match(/--sp-4:\s*(\d+(?:\.\d+)?)px/);

/** The 1px hairline in `.pf-card__inner { border: 1px solid … }`, on each side too. */
const cardBorderPx = 1;

describe('watchlist grid: the narrowest card it can produce still queries wide enough', () => {
  it('finds all three numbers in the stylesheets (self-check, so a stale regex cannot pass)', () => {
    // Without this, a rename would turn every assertion below into a match against null and
    // the tripwire would be silently disarmed.
    expect(gridMinimum).not.toBeNull();
    expect(cardBands.length).toBeGreaterThan(0);
    expect(spacingToken).not.toBeNull();
    expect(portfolioCss).toMatch(/border:\s*1px solid var\(--line\)/);
  });

  it('leaves the card at least as much container as the side-by-side price row needs', () => {
    const min = Number(gridMinimum![1]);
    const chrome = 2 * Number(spacingToken![1]) + 2 * cardBorderPx;
    // Measured in Chrome: 356 - 34 = 322 container px against a 320px band, two to spare
    // for subpixel track widths. Read as an object so a failure names the bug — "the grid
    // packs cards too narrow for their own header" — instead of "expected 277 to be >= 320".
    expect({
      gridMinimumPx: min,
      cardChromePx: chrome,
      containerAtGridMinimumPx: min - chrome,
      clearsBandPx: min - chrome >= widestBand,
    }).toMatchObject({ clearsBandPx: true });
  });

  it('clamps that minimum to the grid box, so a narrow screen never scrolls sideways', () => {
    // `minmax(356px, 1fr)` makes the TRACK 356px wide even inside a 260px grid — the page
    // then scrolls horizontally, which on a phone is the worst bug on this list. Measured:
    // bare 356 in a 260px grid gives a 356px card; min(100%, 356px) gives 260px and the
    // card falls back to the stacked arrangement it was designed for.
    expect(portfolioCss).toMatch(/minmax\(\s*min\(\s*100%\s*,\s*\d+px\s*\)\s*,\s*1fr\s*\)/);
  });
});
