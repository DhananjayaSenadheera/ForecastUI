// =============================================================================
// Best harvest window panel (2026-07-25).
//
// The tests that matter are the HONESTY ones. It is easy to write this feature so
// that a crop with no usable signal still shows a confident-looking recommendation
// — bars render, a window gets highlighted, and nobody notices the numbers were
// noise. So the not-rankable state is pinned hard: no bars, no verdict, no
// "expected price" anywhere on screen, just the reason.
//
// The other load-bearing test is tap-to-apply. Without it the panel is a poster:
// the farmer reads a date and then types it into a field two panels down. With it
// the panel is the control and the date input is the readout.
//
// Since the <details> table was removed (2026-07-25) the bars' aria-labels + the
// roving tabindex ARE the text alternative, so the tests that pin them are no
// longer "nice extra coverage" — they are the accessibility contract.
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import BestWindowPanel from '../components/BestWindowPanel';
import MyHarvestPage from '../pages/MyHarvestPage';
import { api } from '../api/client';
import { formatDate, ymdLocal } from '../lib/format';
import { fxCrops, fxHarvestWindowFor, fxForecastFor } from '../api/fixtures';
import { RecommendationLevel } from '../api/types';
import type { HarvestWindow } from '../api/types';

const RANKABLE: HarvestWindow = {
  cropId: 'c1',
  cropName: 'Tomato',
  asOf: '2026-07-25',
  growthPeriodDays: 70,
  rankable: true,
  reasonCode: 'ml_served',
  activePredictor: 'residual',
  confidence: 'Medium',
  modelVersion: 'v17',
  explanation: 'server prose',
  windowDays: 2,
  // Today's price sits BELOW the best window's 245, so the default fixture is the
  // "this is genuinely good news" case; the loss case is opted into per test.
  currentPrice: 190,
  points: [
    { plantDate: '2026-07-25', harvestDate: '2026-10-03', predictedPrice: 200, lowerBound: 150, upperBound: 260, inBestWindow: false },
    { plantDate: '2026-07-26', harvestDate: '2026-10-04', predictedPrice: 240, lowerBound: 180, upperBound: 300, inBestWindow: true },
    { plantDate: '2026-07-27', harvestDate: '2026-10-05', predictedPrice: 250, lowerBound: 190, upperBound: 320, inBestWindow: true },
    { plantDate: '2026-07-28', harvestDate: '2026-10-06', predictedPrice: 210, lowerBound: 160, upperBound: 270, inBestWindow: false },
  ],
  best: {
    plantStart: '2026-07-26',
    plantEnd: '2026-07-27',
    harvestStart: '2026-10-04',
    harvestEnd: '2026-10-05',
    predictedPrice: 245,
    lowerBound: 185,
    upperBound: 310,
    upliftPct: 8.4,
  },
};

const UNRANKED: HarvestWindow = {
  ...RANKABLE,
  rankable: false,
  reasonCode: 'crop_not_model_served',
  activePredictor: 'unavailable',
  confidence: 'Low',
  explanation: 'server prose fallback',
  windowDays: null,
  points: [],
  best: null,
};

function renderPanel(props: Partial<React.ComponentProps<typeof BestWindowPanel>> = {}) {
  const onPickDate = vi.fn();
  const utils = render(
    <BestWindowPanel
      window={RANKABLE}
      loading={false}
      error={false}
      onRetry={() => {}}
      onPickDate={onPickDate}
      cropLabel="Tomato"
      {...props}
    />,
  );
  return { ...utils, onPickDate };
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  // A successful forecast now happens inside these tests (the strip only renders
  // after one), and it writes the crop onto the Recent list — which would then be
  // rendered a second time in the picker of the NEXT test.
  localStorage.clear();
});

describe('BestWindowPanel — rankable', () => {
  it('states the window in words, not only in bar heights', () => {
    renderPanel();
    // The verdict must be readable without interpreting the chart.
    expect(screen.getByText(/Jul 26, 2026 – Jul 27, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Oct 4, 2026 – Oct 5, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/8\.4% better than planting at an average time/)).toBeInTheDocument();
  });

  it('renders one bar per candidate date and marks the best window', () => {
    renderPanel();
    const bars = screen.getAllByRole('button', { name: /^Plant / });
    expect(bars).toHaveLength(4);
    // The two in-window bars carry the is-best class; the others do not.
    const best = bars.filter((b) => b.className.includes('is-best'));
    expect(best).toHaveLength(2);
  });

  it('applies the tapped date — the panel is a control, not a poster', async () => {
    const { onPickDate } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Plant Jul 27, 2026/ }));
    expect(onPickDate).toHaveBeenCalledWith('2026-07-27');
  });

  it('keeps the strip to ONE tab stop and moves with arrow keys', async () => {
    renderPanel();
    const bars = screen.getAllByRole('button', { name: /^Plant / });
    // Roving tabindex parks on the recommendation (index 1 — first best bar).
    expect(bars.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(bars[1].tabIndex).toBe(0);

    const strip = bars[1].parentElement!;
    fireEvent.focus(bars[1]);
    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(bars[2]).toHaveFocus();
    fireEvent.keyDown(strip, { key: 'Home' });
    expect(bars[0]).toHaveFocus();
  });

  it('marks the currently selected date with aria-pressed', () => {
    renderPanel({ selectedDate: '2026-07-27' });
    expect(screen.getByRole('button', { name: /Plant Jul 27, 2026/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('always carries the timing-only caveat (not a weather forecast)', () => {
    renderPanel();
    expect(screen.getByText(/compares timing only/i)).toBeInTheDocument();
    expect(screen.getByText(/not a weather forecast/i)).toBeInTheDocument();
  });

  it('keeps every bar naming plant date, harvest date AND price — the table is gone,', () => {
    // ...so these labels are now the ONLY non-visual path to the numbers.
    renderPanel();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Plant Jul 27, 2026, harvest Oct 5, 2026 — expected Rs. 250',
      }),
    ).toBeInTheDocument();
  });

  it('softens the copy when the difference is not worth acting on', () => {
    renderPanel({
      window: { ...RANKABLE, best: { ...RANKABLE.best!, upliftPct: 0.6 } },
    });
    expect(screen.getByText(/difference across these dates is small/i)).toBeInTheDocument();
    expect(screen.queryByText(/better than planting at an average time/)).toBeNull();
  });
});

describe('BestWindowPanel — the bar tooltip', () => {
  it('shows date AND price on hover, because the choice is being made on price', () => {
    renderPanel();
    expect(screen.queryByText('Plant Jul 27, 2026')).toBeNull(); // nothing until asked

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Plant Jul 27, 2026/ }));
    expect(screen.getByText('Plant Jul 27, 2026')).toBeInTheDocument();
    expect(screen.getByText('Harvest Oct 5, 2026')).toBeInTheDocument();
    expect(screen.getByText('Expected Rs. 250')).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole('button', { name: /Plant Jul 27, 2026/ }));
    expect(screen.queryByText('Plant Jul 27, 2026')).toBeNull();
  });

  it('appears on keyboard focus too — hover-only would hide it from half the users', () => {
    renderPanel();
    const bar = screen.getByRole('button', { name: /Plant Jul 26, 2026/ });
    fireEvent.focus(bar);
    expect(screen.getByText('Plant Jul 26, 2026')).toBeInTheDocument();
    expect(screen.getByText('Expected Rs. 240')).toBeInTheDocument();

    // Dismissible without moving focus (WCAG 1.4.13).
    fireEvent.keyDown(bar.parentElement!, { key: 'Escape' });
    expect(screen.queryByText('Plant Jul 26, 2026')).toBeNull();

    fireEvent.blur(bar);
    expect(screen.queryByText('Plant Jul 26, 2026')).toBeNull();
  });

  it('anchors to the panel edges so it cannot hang off screen at 375px', () => {
    // jsdom has no layout, so the geometry is stubbed: a 300px-wide strip with
    // four 10px bars at 0 / 75 / 150 / 225. What is being pinned is the RULE —
    // a card centred on a bar near either end would overflow the panel and give
    // the whole page a horizontal scrollbar on a phone.
    const rect = (left: number, width: number) =>
      ({ left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON() {} }) as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('bw-stripwrap')) return rect(0, 300);
      if (this.classList.contains('bw-bar')) {
        return rect(Array.from(this.parentElement!.children).indexOf(this) * 75, 10);
      }
      return rect(0, 0);
    });

    const { container } = renderPanel();
    const bars = screen.getAllByRole('button', { name: /^Plant / });
    const tipClass = () => container.querySelector('.bw-tip')!.className;

    fireEvent.mouseEnter(bars[0]);
    expect(tipClass()).toContain('bw-tip--start');
    fireEvent.mouseEnter(bars[2]);
    expect(tipClass()).toContain('bw-tip--mid');
    fireEvent.mouseEnter(bars[3]);
    expect(tipClass()).toContain('bw-tip--end');

    spy.mockRestore();
  });

  it('never blocks the tap and never re-announces what the bar already says', () => {
    const { onPickDate } = renderPanel();
    const bar = screen.getByRole('button', { name: /Plant Jul 27, 2026/ });
    fireEvent.mouseEnter(bar);
    // aria-hidden: the button's own label already carries all three values, so a
    // screen reader must not hear them twice.
    const tip = screen.getByText('Plant Jul 27, 2026').parentElement!;
    expect(tip).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(bar);
    expect(onPickDate).toHaveBeenCalledWith('2026-07-27');
  });
});

describe('BestWindowPanel — the caption', () => {
  it('names the crop and today’s price the forecasts are judged against', () => {
    renderPanel({ window: { ...RANKABLE, currentPrice: 175 }, cropLabel: 'Brinjal' });
    expect(screen.getByText('Brinjal')).toBeInTheDocument();
    expect(screen.getByText('Rs. 175')).toBeInTheDocument();
    // The number is meaningless unless AT hears what it IS.
    expect(screen.getByText(/Today.s average price/)).toBeInTheDocument();
  });

  it('shows the crop alone when today’s price is unknown — never "Rs. 0"', () => {
    for (const currentPrice of [0, undefined as unknown as number]) {
      const { unmount } = renderPanel({
        window: { ...RANKABLE, currentPrice },
        cropLabel: 'Brinjal',
      });
      expect(screen.getByText('Brinjal')).toBeInTheDocument();
      expect(screen.queryByText(/Rs\.\s*0\b/)).toBeNull();
      expect(screen.queryByText(/Today.s average price/)).toBeNull();
      unmount();
    }
  });
});

describe('BestWindowPanel — best window still below today', () => {
  // The bug this pins: the panel highlighted a window, the farmer picked that date
  // from OUR strip, and the forecast screen then said "Not recommended: forecast
  // below today's price". Two screens, opposite messages, same numbers.
  const LOSS = { ...RANKABLE, currentPrice: 300 }; // best is 245

  it('warns in words when even the best window loses against today', () => {
    renderPanel({ window: LOSS });
    expect(
      screen.getByText(/Even at the best time, the forecast is below today.s price of Rs\. 300/),
    ).toBeInTheDocument();
    expect(screen.getByText(/least-bad timing, not a gain/)).toBeInTheDocument();
  });

  it('stops the uplift line reading like good news', () => {
    renderPanel({ window: LOSS });
    // Still states the magnitude — but says what it is a comparison OF.
    expect(screen.getByText(/compares these dates with each other, not with today/)).toBeInTheDocument();
    expect(screen.queryByText(/^About 8\.4% better than planting at an average time\.$/)).toBeNull();
  });

  it('still shows the window — least-bad timing is real information', () => {
    renderPanel({ window: LOSS });
    expect(screen.getAllByRole('button', { name: /^Plant / })).toHaveLength(4);
    expect(screen.getByText(/Jul 26, 2026 – Jul 27, 2026/)).toBeInTheDocument();
  });

  it('drops the green "good news" tint so colour and copy cannot disagree', () => {
    const { container, unmount } = renderPanel({ window: LOSS });
    expect(container.querySelector('.bw-verdict.is-below')).not.toBeNull();
    unmount();
    const ok = renderPanel();
    expect(ok.container.querySelector('.bw-verdict.is-below')).toBeNull();
  });

  it('stays silent when the window MEAN is below today but a single date still wins', () => {
    // The gate is the top of the strip, never best.predictedPrice — that field is
    // the rolling MEAN of the window's p50s, so a window straddling today has a
    // mean below today while the strip still holds a date worth taking. Warning
    // here would be literally false ("even at the best time") AND would contradict
    // the forecast screen, which reports that date as a gain.
    const STRADDLE = { ...RANKABLE, currentPrice: 248 }; // mean 245 < 248 < top bar 250
    renderPanel({ window: STRADDLE });
    expect(STRADDLE.best!.predictedPrice).toBeLessThan(STRADDLE.currentPrice); // the trap
    expect(screen.queryByText(/below today.s price/)).toBeNull();
    expect(document.querySelector('.bw-verdict.is-below')).toBeNull();
    // ...and the uplift line must not be softened either — one gate, not two.
    expect(screen.getByText(/8\.4% better than planting at an average time/)).toBeInTheDocument();
    expect(screen.queryByText(/compares these dates with each other/)).toBeNull();
    // The winning date is still there to be tapped.
    expect(screen.getByRole('button', { name: /Plant Jul 27, 2026.*Rs\. 250/ })).toBeInTheDocument();
  });

  it('stays silent when the window BEATS today, and when today is unknown', () => {
    const { unmount } = renderPanel(); // currentPrice 190 < best 245
    expect(screen.queryByText(/below today.s price/)).toBeNull();
    unmount();
    // Unknown current price must not be treated as zero (which would look like a win).
    renderPanel({ window: { ...RANKABLE, currentPrice: 0 } });
    expect(screen.queryByText(/below today.s price/)).toBeNull();
    expect(screen.getByText(/8\.4% better than planting at an average time/)).toBeInTheDocument();
  });
});

describe('demo mode must be able to SHOW the below-today state', () => {
  // Every fixture crop used to sweep above today's price (fxWindowPrice's seasonal
  // and bump terms are both non-negative over a 0–90 day sweep), so the warning
  // above could only ever be seen in this test file. Cabbage — the one crop the
  // fixtures already label Falling / Not recommended — now carries it.
  const CABBAGE = fxCrops.find((c) => c.name === 'Cabbage')!;
  const cabbageWindow = () => fxHarvestWindowFor(CABBAGE.id, 60, '2026-07-25');

  it('Cabbage ranks, and its whole sweep sits below today', () => {
    const w = cabbageWindow();
    expect(w.rankable).toBe(true);
    expect(w.currentPrice).toBeGreaterThan(0);
    expect(w.best!.predictedPrice).toBeLessThan(w.currentPrice);
    // Not just the best window — no date in the strip beats today. STRICTLY below:
    // this is the exact property the panel gates on, so a fixture that merely ties
    // today's price would silently stop demoing the warning.
    expect(Math.max(...w.points.map((p) => p.predictedPrice))).toBeLessThan(w.currentPrice);
    // Big enough spread that the SOFTENED uplift copy renders rather than the
    // "difference is small" branch, so the demo shows the intended wording.
    expect(w.best!.upliftPct).toBeGreaterThanOrEqual(1);
  });

  it('renders the warning end-to-end from the fixture, not just from a hand-made object', () => {
    renderPanel({ window: cabbageWindow(), cropLabel: 'Cabbage' });
    expect(screen.getByText(/Even at the best time, the forecast is below today.s price/)).toBeInTheDocument();
    expect(screen.getByText(/compares these dates with each other, not with today/)).toBeInTheDocument();
  });

  it('does not contradict the other demo screens about the same crop', () => {
    const w = cabbageWindow();
    const card = fxForecastFor(CABBAGE.id, '2026-07-25');
    // Same "today" on the window panel and the harvest card...
    expect(w.currentPrice).toBe(card.currentPrice);
    // ...and the card must not be promising a rise while the panel warns of a fall.
    expect(card.predictedPrice).toBeLessThan(card.currentPrice);
  });

  it('still leaves a rising crop to demo the good state', () => {
    const w = fxHarvestWindowFor(fxCrops.find((c) => c.name === 'Capsicum')!.id, 60, '2026-07-25');
    expect(w.best!.predictedPrice).toBeGreaterThan(w.currentPrice);
    expect(w.currentPrice).toBe(fxForecastFor(w.cropId, '2026-07-25').currentPrice);
  });
});

describe('BestWindowPanel — the honesty states', () => {
  it('shows the reason and NOTHING resembling a recommendation when not rankable', () => {
    renderPanel({ window: UNRANKED });

    expect(screen.getByText(/still collecting data for this crop/i)).toBeInTheDocument();
    // No bars, no verdict, no price anywhere — nothing to mistake for advice.
    expect(screen.queryAllByRole('button', { name: /^Plant / })).toHaveLength(0);
    expect(screen.queryByText(/better than planting/)).toBeNull();
    expect(screen.queryByText(/Rs\./)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('translates each refusal reason rather than showing a raw code', () => {
    const codes: Array<[HarvestWindow['reasonCode'], RegExp]> = [
      ['flat_curve', /much the same whichever date you plant/i],
      ['no_growth_period', /confirmed growing period/i],
      ['model_inactive', /not running right now/i],
      ['no_feature_row', /no recent price data/i],
    ];
    for (const [reasonCode, copy] of codes) {
      const { unmount } = renderPanel({ window: { ...UNRANKED, reasonCode } });
      expect(screen.getByText(copy)).toBeInTheDocument();
      expect(screen.queryByText(reasonCode)).toBeNull(); // never the raw token
      unmount();
    }
  });

  it('falls back to the server explanation for an unknown reason code', () => {
    renderPanel({
      window: {
        ...UNRANKED,
        reasonCode: 'something_new_from_the_server' as HarvestWindow['reasonCode'],
        explanation: 'A newly added reason the UI has no copy for yet.',
      },
    });
    expect(screen.getByText('A newly added reason the UI has no copy for yet.')).toBeInTheDocument();
  });

  it('fails soft on error — a compact retry, never a dead panel', async () => {
    const onRetry = vi.fn();
    render(
      <BestWindowPanel
        window={null}
        loading={false}
        error
        onRetry={onRetry}
        onPickDate={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('announces the loading state', () => {
    render(
      <BestWindowPanel
        window={null}
        loading
        error={false}
        onRetry={() => {}}
        onPickDate={() => {}}
      />,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});

describe('BestWindowPanel — embedded in the forecast result', () => {
  // The move (2026-07-25, ClickUp 86cawt9tr) put the strip inches from the forecast
  // verdict. Two components now know the same thing about the same crop, so the
  // question stops being "is it true?" and becomes "who says it".
  const LOSS = { ...RANKABLE, currentPrice: 300 }; // every date loses against today

  it('KEEPS the loss sentence when embedded but nothing has proved a verdict says it', () => {
    // The bug this pins: dropping the sentence on position alone. Embedded is not
    // evidence that a "Not recommended" verdict is on screen — in the −5% deadband
    // the same numbers render as "Little data", and in the error / first-load
    // states there is no verdict at all. Silence there leaves the loss carried by
    // a background tint: colour alone, WCAG 1.4.1.
    renderPanel({ window: LOSS, embedded: true });
    expect(screen.getByText(/Even at the best time/)).toBeInTheDocument();
  });

  it('drops it ONLY when the caller proves a verdict is already stating the loss', () => {
    renderPanel({ window: LOSS, embedded: true, lossCarriedByVerdict: true });
    expect(screen.queryByText(/Even at the best time/)).toBeNull();
  });

  it('keeps the loss STATE — tint and softened uplift, so it cannot read as a win', () => {
    // Dropping the duplicate sentence must not quietly restore the good-news
    // styling: the panel would then look like encouragement next to "Not
    // recommended".
    const { container } = renderPanel({
      window: LOSS,
      embedded: true,
      lossCarriedByVerdict: true,
    });
    expect(container.querySelector('.bw-verdict.is-below')).not.toBeNull();
    expect(screen.getByText(/compares these dates with each other, not with today/)).toBeInTheDocument();
  });

  it('still carries the full warning when rendered standalone', () => {
    // Suppression is opt-in and proof-gated, not a deletion — this is the path
    // that keeps the standalone panel honest if it is ever used on its own again.
    renderPanel({ window: LOSS });
    expect(screen.getByText(/Even at the best time/)).toBeInTheDocument();
  });

  it('says what a bar actually does here — re-forecast, not fill a field below', () => {
    renderPanel({ embedded: true });
    expect(screen.getByText(/Choose a bar to see the forecast for that planting date/)).toBeInTheDocument();
    expect(screen.queryByText(/Choose a bar to use that planting date/)).toBeNull();
  });

  it('drops its own title line embedded — the block above supplies the heading', () => {
    const { container } = renderPanel({ window: UNRANKED, embedded: true });
    expect(container.querySelectorAll('.bw__title')).toHaveLength(0);
    // ...and the reason itself is still shown: this is a heading change, not a
    // silencing of the honest not-rankable state.
    expect(screen.getByText(/still collecting data for this crop/i)).toBeInTheDocument();
  });
});

describe('MyHarvestPage — the window strip lives inside the result', () => {
  // WHY IT MOVED: not accuracy. The strip and /predict build the same what-if row
  // from the same anchor, so the numbers are identical wherever it renders. It
  // moved for context (min-max bars need a price beside them) and for flow.
  const BEANS = 'Beans';

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/my-harvest']}>
        <MyHarvestPage />
      </MemoryRouter>,
    );
  }

  async function forecastBeans() {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: BEANS }));
    fireEvent.click(screen.getByRole('button', { name: 'Get forecast' }));
    return screen.findAllByRole('button', { name: /^Plant / });
  }

  function shiftYmd(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return ymdLocal(d);
  }

  it('is absent until a forecast is on screen, and then rendered exactly ONCE', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: BEANS }));

    // Picking a crop pre-loads the window data, but nothing renders yet: at that
    // point there is no price on screen to read the bars against.
    expect(screen.queryByRole('heading', { name: /Best time to harvest/ })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^Plant / })).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Get forecast' }));
    await screen.findAllByRole('button', { name: /^Plant / });

    // Exactly one strip: two charts of identical data on one screen is a bug, not
    // a convenience.
    expect(screen.getAllByRole('heading', { name: /Best time to harvest/ })).toHaveLength(1);
  });

  it('renders below the price range, inside the result — not back up the page', async () => {
    await forecastBeans();
    const heading = screen.getByRole('heading', { name: /Best time to harvest/ });
    // (The same string is also the sr-only caption of the table alternative.)
    const range = screen.getAllByText('Likely price range')[0];
    const dateHeading = screen.getByRole('heading', { name: 'When did you plant?' });

    // After the range block it explains...
    expect(range.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // ...and after the date field, so the loop never runs backwards up the page.
    expect(dateHeading.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // Physically inside the result panel, not a sibling of it.
    expect(screen.getByRole('region', { name: 'Expected at harvest' })).toContainElement(heading);
  });

  it('tapping a bar re-forecasts IN PLACE — new price, no unmount, no focus jump', async () => {
    // The fixture forecast is (still) plant-date independent, so the price is
    // stubbed per date here — that is exactly the live contract, where /predict
    // scores the what-if row for the date it is given.
    const spy = vi
      .spyOn(api, 'getHarvestForecast')
      .mockImplementation(async (cropId: string, plantDate: string | Date) => {
        const ymd = String(plantDate);
        return { ...fxForecastFor(cropId, ymd), predictedPrice: 100 + Number(ymd.slice(-2)) };
      });

    const bars = await forecastBeans();
    const result = screen.getByRole('region', { name: 'Expected at harvest' });
    const target = bars[10]; // the sweep starts at today, so bar i == today + i
    const targetDate = shiftYmd(10);
    // The hero numeral specifically — the same figure also appears on the band and
    // in the table alternative, and it is the HERO the farmer reads.
    const hero = () => document.querySelector('.fc-hero__num')!.textContent;
    await waitFor(() => expect(hero()).toBe(`Rs. ${100 + Number(shiftYmd(0).slice(-2))}`));

    target.focus();
    fireEvent.click(target);

    // The hero price is the tapped date's price...
    await waitFor(() => expect(hero()).toBe(`Rs. ${100 + Number(targetDate.slice(-2))}`));
    expect(spy).toHaveBeenLastCalledWith('c0000002-0000-0000-0000-000000000002', targetDate);
    // ...the date field (step 2, above) follows...
    expect(screen.getByLabelText<HTMLInputElement>(/planting date/i).value).toBe(targetDate);
    // ...the bar's own highlight moves with it...
    expect(target).toHaveAttribute('aria-pressed', 'true');
    // ...and NOTHING remounted: same result node, same bar node, focus untouched.
    expect(screen.getByRole('region', { name: 'Expected at harvest' })).toBe(result);
    expect(screen.getAllByRole('button', { name: /^Plant / })[10]).toBe(target);
    expect(target).toHaveFocus();
    spy.mockRestore();
  });

  it('re-forecasts identically from the keyboard', async () => {
    // Keyboard parity is the whole point of the roving tabindex: a bar reached with
    // the arrow keys and activated must do what a tap does, not merely fill a field.
    const spy = vi.spyOn(api, 'getHarvestForecast');
    const bars = await forecastBeans();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // One tab stop, arrow keys move within it (unchanged by the move).
    expect(bars.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    const start = bars.findIndex((b) => b.tabIndex === 0);
    bars[start].focus();
    fireEvent.keyDown(bars[start].parentElement!, { key: 'ArrowRight' });
    const active = document.activeElement as HTMLButtonElement;
    expect(active).toBe(bars[start + 1]);

    // A browser delivers Enter/Space on a focused <button> as a click.
    fireEvent.click(active);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith(
      'c0000002-0000-0000-0000-000000000002',
      shiftYmd(start + 1),
    );
    expect(active).toHaveAttribute('aria-pressed', 'true');
    expect(active).toHaveFocus();
    spy.mockRestore();
  });

  it('keeps the previous result on screen while the new one loads', async () => {
    // A skeleton here would unmount the strip mid-tap and jump the page. The old
    // numbers stay, flagged as being updated — never presented as the new date's.
    let resolve!: (v: unknown) => void;
    const bars = await forecastBeans();
    const spy = vi
      .spyOn(api, 'getHarvestForecast')
      .mockImplementation(() => new Promise((r) => { resolve = r as (v: unknown) => void; }) as never);

    fireEvent.click(bars[12]);
    expect(await screen.findByText(/Updating for the new planting date/)).toHaveAttribute('role', 'status');
    expect(screen.getAllByRole('button', { name: /^Plant / })).toHaveLength(bars.length);
    expect(screen.getByText('Expected at harvest')).toBeInTheDocument();

    resolve(fxForecastFor('c0000002-0000-0000-0000-000000000002', shiftYmd(12)));
    await waitFor(() =>
      expect(screen.queryByText(/Updating for the new planting date/)).toBeNull(),
    );
    spy.mockRestore();
  });

  // -- who says the loss out loud -------------------------------------------
  // Cabbage is the fixture crop whose WHOLE sweep sits below today's price, so
  // the panel's warn state is live in every test here; what varies is whether a
  // verdict on screen is also stating it. If none is, the panel must.
  describe('the loss sentence follows the verdict, not the position', () => {
    const CABBAGE = 'Cabbage';
    const LOSS_SENTENCE = /Even at the best time, the forecast is below today.s price/;

    async function forecastCabbage() {
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: CABBAGE }));
      fireEvent.click(screen.getByRole('button', { name: 'Get forecast' }));
    }

    function mockVerdict(level: RecommendationLevel, reason: string) {
      return vi.spyOn(api, 'getHarvestForecast').mockImplementation(async (id: string, d: string | Date) => ({
        ...fxForecastFor(id, String(d)),
        recommendationLevel: level,
        reason,
      }));
    }

    it('SPEAKS in the −5% deadband, where the verdict only says "Little data"', async () => {
      // The common case, not an edge: the panel warns when no single date beats
      // today, the API only says "Not recommended" below −5% upside. A sweep
      // sitting 0–5% under today therefore renders "Little data / roughly flat
      // versus today" — which states no loss at all — while every date on the
      // strip loses money. Without this the loss is carried by a tint alone.
      const spy = mockVerdict(
        RecommendationLevel.RecommendedWithRisk,
        'Roughly flat versus today - limited upside.',
      );
      await forecastCabbage();
      await screen.findAllByRole('button', { name: /^Plant / });

      expect(await screen.findByText('Little data')).toBeInTheDocument();
      expect(screen.getByText(LOSS_SENTENCE)).toBeInTheDocument();
      spy.mockRestore();
    });

    it('stays silent only when the verdict really is "Not recommended"', async () => {
      const spy = mockVerdict(
        RecommendationLevel.NotRecommended,
        "Forecast below today's price - consider another crop.",
      );
      await forecastCabbage();
      await screen.findAllByRole('button', { name: /^Plant / });

      expect(await screen.findByText('Not recommended')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText(LOSS_SENTENCE)).toBeNull());
      // ...and the state is still visible without reading the sentence.
      expect(document.querySelector('.bw-verdict.is-below')).not.toBeNull();
      spy.mockRestore();
    });

    it('SPEAKS on the error path, where no verdict exists at all', async () => {
      // The window is fetched independently of the forecast, so it can be perfectly
      // good while the forecast fails: strip fully painted, retry card beside it,
      // nothing anywhere saying the dates lose money.
      const spy = vi.spyOn(api, 'getHarvestForecast').mockRejectedValue(new Error('boom'));
      await forecastCabbage();

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(await screen.findByText(LOSS_SENTENCE)).toBeInTheDocument();
      spy.mockRestore();
    });

    it('SPEAKS during the first-load skeleton, before any verdict exists', async () => {
      // The window is pre-fetched on crop select, so the strip is already painted
      // while the forecast is still in flight.
      const spy = vi
        .spyOn(api, 'getHarvestForecast')
        .mockImplementation(() => new Promise(() => {}) as never);
      await forecastCabbage();

      expect(await screen.findByText('Loading…')).toBeInTheDocument();
      expect(await screen.findByText(LOSS_SENTENCE)).toBeInTheDocument();
      spy.mockRestore();
    });
  });

  it('never offers a date the planting-date field would clamp away', async () => {
    // Regression: the sweep horizon and the field's max must stay equal. When they
    // drift, the late bars still render but tapping one silently rewrites the date
    // to the field's max — the farmer gets a different date from the one they
    // chose, and nothing on screen says so. Now that a tap also RE-FORECASTS, a
    // drift would additionally price a date nobody asked for.
    await forecastBeans();

    const field = screen.getByLabelText<HTMLInputElement>(/planting date/i);
    const min = field.min;
    const max = field.max;

    // Every candidate the panel knows about must sit inside [min, max].
    const dates = screen
      .getAllByRole('button', { name: /^Plant / })
      .map((b) => b.getAttribute('aria-label')!);
    expect(dates.length).toBeGreaterThan(1);
    expect(formatDate(min, 'en')).toBeTruthy();
    for (const label of dates) {
      const day = label.match(/^Plant ([^,]+, \d{4})/)![1];
      const asDate = new Date(day);
      expect(asDate.getTime()).toBeGreaterThanOrEqual(new Date(min).getTime());
      expect(asDate.getTime()).toBeLessThanOrEqual(new Date(max).getTime());
    }
    // Stronger than "inside the range": the LAST bar must be the field's max, which
    // is the only way the two horizons can be shown to be the same number rather
    // than merely compatible.
    expect(dates[dates.length - 1]).toContain(formatDate(max, 'en'));
  });

  it('the tapped date is the date the bar NAMED — never a clamped rewrite', async () => {
    const bars = await forecastBeans();
    const label = bars[5].getAttribute('aria-label')!;
    fireEvent.click(bars[5]);

    const field = screen.getByLabelText<HTMLInputElement>(/planting date/i);
    await waitFor(() => expect(field.value).not.toBe(''));
    expect(label).toContain(formatDate(field.value, 'en'));
  });
});
