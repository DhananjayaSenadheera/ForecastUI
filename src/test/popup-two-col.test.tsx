// The "More details" popup's two columns (owner, 2026-08-02: on a maximised window, put what
// sits under "See the full forecast" BESIDE it instead).
//
// The change is layout only, and layout splits cleanly into two things that can each go wrong
// on their own:
//
//   * the MARKUP — which sections landed in which column, and in what DOM order. jsdom can see
//     this, and it is the half that carries the accessibility risk: DOM order IS tab order and
//     screen-reader order here, so "the sales book moved to the right" must not mean "the sales
//     book is now read before the planting date". Pinned by rendering the real popup.
//   * the CSS — the 1024px fence, the two grid tracks and the widened sheet. vitest runs with
//     `css: false`, so jsdom would keep every one of those green if the media query were
//     deleted tomorrow and the popup silently went back to one 560px column on desktop. Pinned
//     by reading portfolio.css as text, the same way grid-card-width.test.ts does.
//
// WHAT THIS IS NOT: a renderer. It cannot tell you the two columns LOOK right — the widths
// were measured separately, in headless Chrome against these same stylesheets (1024: sheet
// 976px, columns 440/484; ≥1280: sheet 1060px, columns 480/528, sales grid 502px, the width
// it had in the 560px popup; below 1024 both wrappers compute to `display: contents` and have
// no box at all). What this file tells you is that the columns still EXIST, are still made of
// the right sections in the right order, and still collapse to one column on a phone.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import i18n from '../i18n';
import WatchlistCard from '../components/WatchlistCard';
import { api } from '../api/client';
import { RecommendationLevel } from '../api/types';
import type {
  HarvestForecast,
  Market,
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
} from '../api/types';
import { rules, type Rule } from './support/cssRules';

const TODAY = '2026-07-28';
const PLANTED = '2026-05-04';

const DAMBULLA: PortfolioDashboardMarket = {
  marketId: 'm1',
  name: 'Dambulla Dedicated Economic Centre',
  shortCode: 'DEC',
  isDefaultMarket: false,
  price: {
    price: 210,
    observedDate: '2026-07-25',
    direction: 'up',
    changePct: 4.2,
    previousPrice: 201,
    previousObservedDate: '2026-07-21',
  },
  priceUnavailableReason: null,
};

const MARKETS: Market[] = [
  {
    id: 'm1',
    name: 'Dambulla Dedicated Economic Centre',
    shortCode: 'DEC',
    district: 'Matale',
    marketType: 1,
    isEconomicCenter: true,
    hasStoredData: true,
    lastStoredDate: '2026-07-25',
    isTrainingSource: true,
  },
];

/** A crop the farmer HAS planted: only then does the left column carry the whole thing the
 *  owner's ask names — the forecast for that planting, down to its "See the full forecast". */
function tomato(): PortfolioDashboardItem {
  return {
    cropId: 'c1',
    cropName: 'Tomato',
    cropCode: 'VEG000065',
    plantedDate: PLANTED,
    markets: [DAMBULLA],
    prediction: null,
    predictionUnavailableReason: 'no_snapshot',
  };
}

function forecast(): HarvestForecast {
  return {
    cropId: 'c1',
    cropName: 'Tomato',
    plantDate: PLANTED,
    harvestDate: '2026-08-12',
    growthPeriodDays: 100,
    currentPrice: 210,
    predictedPrice: 240,
    lowerBound: 190,
    upperBound: 300,
    confidence: 'High',
    activePredictor: 'residual',
    modelVersion: 'v17',
    explanation: 'Seasonal supply is tightening.',
    recommendationLevel: RecommendationLevel.Recommended,
    reason: 'above today',
    upsidePct: 14.3,
    intervalWidthPct: 45.8,
    lowTrust: false,
  };
}

/** Render the card and open its popup — the state every markup test below starts from. */
async function openPopup() {
  render(
    <MemoryRouter>
      <ul>
        <WatchlistCard
          item={tomato()}
          readiness={null}
          lang="en"
          todayYmd={TODAY}
          selected={false}
          onToggleSelect={vi.fn()}
          onSavePlantedDate={async () => null}
          onClearPlantedDate={async () => null}
          allMarkets={MARKETS}
          busy={false}
        />
      </ul>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));
  const dialog = screen.getByRole('dialog');
  // The sales section really mounted (it fetches) before anything asserts where it sits.
  await within(dialog).findByRole('region', { name: 'Sales you have recorded' });
  return dialog;
}

/** The two column elements, in DOM order. */
function columns(dialog: HTMLElement) {
  const cols = dialog.querySelector('.pf-dlg__cols');
  expect(cols).not.toBeNull();
  return [...cols!.children] as HTMLElement[];
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(api, 'getPriceHistory').mockResolvedValue([]);
  vi.spyOn(api, 'getHarvestForecast').mockResolvedValue(forecast());
  vi.spyOn(api, 'getSales').mockResolvedValue({ items: [], page: 1, pageSize: 3, total: 0 });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the popup deals its sections into two columns', () => {
  it('wraps the body in exactly one cols element holding exactly two columns', async () => {
    const dialog = await openPopup();
    const body = dialog.querySelector('.pf-modal__body') as HTMLElement;

    // One wrapper, and it is the body's ONLY child: a section left outside it would sit above
    // both columns on desktop, which is the bug this shape exists to make impossible.
    expect(dialog.querySelectorAll('.pf-dlg__cols')).toHaveLength(1);
    expect([...body.children].map((c) => c.className)).toEqual(['pf-dlg__cols']);

    const cols = columns(dialog);
    expect(cols).toHaveLength(2);
    for (const col of cols) expect(col).toHaveClass('pf-dlg__col');
    expect(cols[0]).toHaveClass('pf-dlg__col--main');
    expect(cols[1]).toHaveClass('pf-dlg__col--side');
  });

  it('puts market, price and planting on the left — everything down to the forecast CTA', async () => {
    const dialog = await openPopup();
    const [main, side] = columns(dialog);

    expect(within(main).getByText('Dambulla Dedicated Economic Centre')).toBeInTheDocument();
    expect(within(main).getByRole('heading', { name: 'Price now' })).toBeInTheDocument();
    expect(within(main).getByRole('heading', { name: 'Forecast for your planting' })).toBeInTheDocument();
    expect(within(main).getByText('Planted on May 4, 2026')).toBeInTheDocument();
    // The owner's landmark: "See the full forecast" is the LAST thing in the left column.
    expect(within(main).getByRole('link', { name: /See the full forecast/ })).toBeInTheDocument();
    expect(within(side).queryByRole('heading', { name: 'Forecast for your planting' })).toBeNull();
  });

  it('puts the sales book and the way out on the right', async () => {
    const dialog = await openPopup();
    const [main, side] = columns(dialog);

    expect(within(side).getByRole('region', { name: 'Sales you have recorded' })).toBeInTheDocument();
    expect(side.querySelector('.pf-dlg__links')).not.toBeNull();
    expect(within(side).getByRole('link', { name: /Open the full crop page/ })).toBeInTheDocument();
    // …and nowhere else. Two copies of the sales book would be two answers to one question.
    expect(within(main).queryByRole('region', { name: 'Sales you have recorded' })).toBeNull();
    expect(main.querySelector('.pf-dlg__links')).toBeNull();
  });

  it('leaves reading order and tab order exactly as they were: planting, then sales', async () => {
    // The frozen law of this change. The right column comes AFTER the left in the DOM, so the
    // eye, the caret and a screen reader still walk the same path they did in one column — no
    // control changed name, role or position in the sequence.
    const dialog = await openPopup();
    const [main, side] = columns(dialog);
    expect(main.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea'),
    ];
    const changeDate = within(main).getByRole('button', {
      name: 'Change the planting date for Tomato',
    });
    const recordSale = within(side).getByRole('button', { name: 'Record a sale of Tomato' });
    expect(focusable.indexOf(changeDate)).toBeGreaterThanOrEqual(0);
    expect(focusable.indexOf(changeDate)).toBeLessThan(focusable.indexOf(recordSale));
    // Nothing re-orders the sequence behind the DOM's back.
    expect(dialog.querySelector('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])')).toBeNull();
  });

  it('asks the shell for the desktop width, and still names itself by its heading', async () => {
    const dialog = await openPopup();
    expect(dialog).toHaveClass('pf-modal--wide');
    // Unchanged a11y contract: the sheet is named by the crop heading it renders, not a label.
    expect(dialog).toHaveAttribute('aria-labelledby', 'pf-dlg-title-c1');
    expect(dialog).toHaveAccessibleName('Tomato');
  });
});

/* ---- The half jsdom cannot see ------------------------------------------- */

const CSS = readFileSync(resolve(__dirname, '../styles/portfolio.css'), 'utf8');
const cssRules = rules(CSS);

/** Every rule whose selector list contains `selector`, inside `at`-rules or not. */
function ruleFor(selector: string): Rule[] {
  return cssRules.filter((r) => r.selectors.includes(selector));
}
/** The min-width floor of the media query a rule sits in, or NaN at the top level. */
function floorOf(rule: Rule): number {
  const m = /min-width:\s*(\d+)px/.exec(rule.at.join(' '));
  return m ? Number(m[1]) : NaN;
}

const DESKTOP = 1024;

describe('the two columns exist in CSS, and only above the desktop tier', () => {
  it('parses portfolio.css and finds both column selectors (self-check)', () => {
    // Without this a rename turns every assertion below into a filter over an empty array,
    // and the tripwire passes while the popup renders one column on every desktop.
    expect(cssRules.length).toBeGreaterThan(100);
    expect(ruleFor('.pf-dlg__cols').length).toBeGreaterThan(0);
    expect(ruleFor('.pf-dlg__col').length).toBeGreaterThan(0);
    expect(ruleFor('.pf-modal--wide').length).toBeGreaterThan(0);
  });

  it('collapses to the untouched single column below 1024px via display: contents', () => {
    // The phone contract. `display: contents` makes the wrappers vanish from layout, so the
    // sections stay direct flex children of .pf-modal__body with its own gaps — the ONLY shape
    // in which "nothing changes on a phone" is true by construction rather than by inspection.
    const unwrapped = cssRules.filter(
      (r) =>
        r.at.length === 0 &&
        /display\s*:\s*contents/.test(r.body) &&
        r.selectors.includes('.pf-dlg__cols') &&
        r.selectors.includes('.pf-dlg__col'),
    );
    expect(unwrapped).toHaveLength(1);
  });

  it('turns the wrapper into a 2-track grid, top-aligned, only at ≥1024px', () => {
    const grid = ruleFor('.pf-dlg__cols').filter((r) => /display\s*:\s*grid/.test(r.body));
    expect(grid).toHaveLength(1);
    expect(floorOf(grid[0])).toBeGreaterThanOrEqual(DESKTOP);
    // Both tracks guarded against the automatic-minimum trap (a bare `1fr` lets the sales
    // table's scroll wrapper widen its own track and shove the forecast column off the
    // sheet): the left track by minmax(0, …), the right by a bounded min(…, 100%) floor.
    const tracks = /grid-template-columns:\s*([^;]+)/.exec(grid[0].body)?.[1] ?? '';
    // The exact tracks are measured numbers, not taste: 537px = the edit row's 509px
    // min-content + 28px of card and wrapper chrome, the width below which recording a sale
    // opens a horizontal scrollbar. (The 10fr/11fr ratio is inert under the current 1060px
    // sheet cap — the floor binds everywhere; see the CSS comment.) A silent flip to
    // 1fr/1fr (or dropping the floor) re-opens the round-1 edit-row squeeze.
    expect(tracks).toMatch(
      /minmax\(\s*0\s*,\s*10fr\s*\)\s*minmax\(\s*min\(\s*537px\s*,\s*100%\s*\)\s*,\s*11fr\s*\)/,
    );
    expect(grid[0].body).toMatch(/gap:\s*var\(--sp-5\)/);
    // Top-aligned: the sales card is as tall as the sales it holds, never stretched to the
    // chart column's height.
    expect(grid[0].body).toMatch(/align-items:\s*start/);
  });

  it('drops the sales separator only in the side column, only at desktop', () => {
    // In the stacked sheet the <hr> separates the sales section from the sections above it;
    // in the side column there is nothing above it, so the rule would open the column as a
    // second line under the card's own border (owner's reference layout shows none).
    const hide = ruleFor('.pf-dlg__col--side .pf-sales__sep');
    expect(hide).toHaveLength(1);
    expect(floorOf(hide[0])).toBeGreaterThanOrEqual(DESKTOP);
    expect(hide[0].body).toMatch(/display:\s*none/);
    // And the stacked sheet keeps it: the base separator rule is still there, unfenced.
    const base = ruleFor('.pf-sales__sep');
    expect(base.some((r) => r.at.length === 0)).toBe(true);
  });

  it('gives each column its own stacking, and makes neither one a scroll container', () => {
    const col = ruleFor('.pf-dlg__col').filter((r) => floorOf(r) >= DESKTOP);
    expect(col).toHaveLength(1);
    expect(col[0].body).toMatch(/flex-direction:\s*column/);
    expect(col[0].body).toMatch(/min-width:\s*0/);
    // ONE scroll for the sheet, as on a phone: a farmer must never have to work out which of
    // two panes their answer is hiding in.
    for (const r of [...col, ...ruleFor('.pf-dlg__cols')]) {
      expect({ selectors: r.selectors, body: r.body }).toMatchObject({
        body: expect.not.stringMatching(/overflow[-a-z]*:|max-height:/),
      });
    }
  });

  it('widens only the opted-in sheet, only on desktop, and leaves the 560px default alone', () => {
    const wide = ruleFor('.pf-modal--wide');
    expect(wide).toHaveLength(1);
    expect(floorOf(wide[0])).toBeGreaterThanOrEqual(DESKTOP);
    expect(wide[0].body).toMatch(/max-width:\s*min\(\s*\d+px\s*,\s*calc\(100vw\s*-\s*\d+px\)\s*\)/);
    // The shell a one-column dialog inherits is untouched: still the 560px phone-first sheet.
    const shell = ruleFor('.pf-modal').filter((r) => /max-width/.test(r.body));
    expect(shell).toHaveLength(1);
    expect(shell[0].at).toEqual([]);
    expect(shell[0].body).toMatch(/max-width:\s*560px/);
  });
});
