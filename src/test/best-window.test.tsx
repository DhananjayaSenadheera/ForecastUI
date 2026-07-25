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
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import BestWindowPanel from '../components/BestWindowPanel';
import MyHarvestPage from '../pages/MyHarvestPage';
import { formatDate } from '../lib/format';
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
    bars[1].focus();
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

  it('offers the mandatory table alternative with a per-row apply', async () => {
    const { onPickDate } = renderPanel();
    fireEvent.click(screen.getByText('See the dates as a table'));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(5); // header + 4
    fireEvent.click(within(table).getAllByRole('button', { name: 'Use this date' })[0]);
    expect(onPickDate).toHaveBeenCalledWith('2026-07-25');
  });

  it('softens the copy when the difference is not worth acting on', () => {
    renderPanel({
      window: { ...RANKABLE, best: { ...RANKABLE.best!, upliftPct: 0.6 } },
    });
    expect(screen.getByText(/difference across these dates is small/i)).toBeInTheDocument();
    expect(screen.queryByText(/better than planting at an average time/)).toBeNull();
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

describe('MyHarvestPage — window placement and wiring', () => {
  it('appears as step 2, above the planting-date field, only after a crop is picked', async () => {
    render(
      <MemoryRouter initialEntries={['/my-harvest']}>
        <MyHarvestPage />
      </MemoryRouter>,
    );

    // Before a crop is chosen there is nothing to rank, so no panel at all.
    await screen.findByRole('button', { name: 'Beans' });
    expect(screen.queryByRole('heading', { name: /Best time to harvest/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Beans' }));
    const heading = await screen.findByRole('heading', { name: /Best time to harvest/ });
    expect(heading).toBeInTheDocument();

    // Reading order: the window must come BEFORE the date question it informs.
    const dateHeading = screen.getByRole('heading', { name: 'When did you plant?' });
    expect(heading.compareDocumentPosition(dateHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('tapping a bar fills the planting-date field', async () => {
    render(
      <MemoryRouter initialEntries={['/my-harvest']}>
        <MyHarvestPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Beans' }));

    const bars = await screen.findAllByRole('button', { name: /^Plant / });
    const target = bars[5];
    const label = target.getAttribute('aria-label')!;
    fireEvent.click(target);

    const field = screen.getByLabelText<HTMLInputElement>(/planting date/i);
    // The applied value must be the date the bar NAMED — never a clamped rewrite.
    // (The sweep horizon and the field's max are deliberately kept equal so the
    // clamp can never silently hand back a different date than the one tapped.)
    await waitFor(() => expect(field.value).not.toBe(''));
    expect(label).toContain(formatDate(field.value, 'en'));
  });

  it('never offers a date the planting-date field would clamp away', async () => {
    // Regression: the sweep horizon and the field's max must stay equal. When they
    // drift, the late bars still render but tapping one silently rewrites the date
    // to the field's max — the farmer gets a different date from the one they
    // chose, and nothing on screen says so.
    render(
      <MemoryRouter initialEntries={['/my-harvest']}>
        <MyHarvestPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Beans' }));
    await screen.findAllByRole('button', { name: /^Plant / });

    const field = screen.getByLabelText<HTMLInputElement>(/planting date/i);
    const min = field.min;
    const max = field.max;
    const table = screen.getByText('See the dates as a table');
    fireEvent.click(table);

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
  });
});
