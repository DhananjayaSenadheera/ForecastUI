import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import { fxForecastAccuracySummary, fxForecastSnapshots } from '../api/fixtures';
import type {
  ForecastAccuracyMetrics,
  ForecastAccuracySummary,
  ForecastSnapshot,
  ForecastSnapshotPage,
} from '../api/types';
import ForecastAccuracyPage from '../admin/logs/ForecastAccuracyPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/logs/forecast-accuracy']}>
      <AuthProvider>
        <ForecastAccuracyPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const PENDING = () => new Promise<never>(() => {}); // never resolves — holds loading

function snapshotPage(items: ForecastSnapshot[], total = items.length): ForecastSnapshotPage {
  return { items, page: 1, pageSize: 25, total };
}

/** Metrics with every field null — the "not computable yet" case the UI must NOT
 *  render as zeroes. */
const NULL_METRICS: ForecastAccuracyMetrics = {
  maturedCount: null,
  scoredCount: null,
  mape: null,
  medianApe: null,
  signedBias: null,
  intervalScoredCount: null,
  withinIntervalCount: null,
  intervalCoverage: null,
  nominalIntervalCoverage: null,
  intervalCoverageGap: null,
  directionalAccuracy: null,
  directionalScored: null,
  directionalExcluded: null,
};

const EMPTY_SUMMARY: ForecastAccuracySummary = {
  generatedAtUtc: '2026-07-27T17:08:20Z',
  windowDays: 365,
  latestSnapshotDate: null,
  counts: { total: 0, pending: 0, matured: 0, actualUnavailable: 0, notMaturable: 0 },
  byActivePredictor: [],
  byModelVersion: [],
};

/** Both mocks resolved — the ordinary success path. */
function mockBoth(
  summary: ForecastAccuracySummary = fxForecastAccuracySummary(),
  snapshots: ForecastSnapshotPage = fxForecastSnapshots(1, 25),
) {
  const summarySpy = vi.spyOn(api, 'getForecastAccuracySummary').mockResolvedValue(summary);
  const snapshotSpy = vi.spyOn(api, 'getForecastSnapshots').mockResolvedValue(snapshots);
  return { summarySpy, snapshotSpy };
}

async function summaryPanel(): Promise<HTMLElement> {
  return await screen.findByRole('region', { name: 'Accuracy summary' });
}

/** The per-predictor card for one predictor. Scoped to the CARD GRID on purpose: the
 *  same predictor string also appears in the per-version table and in the ledger's
 *  "served by" column, which is itself the point — the split is visible everywhere. */
async function predictorCard(predictor: string): Promise<HTMLElement> {
  const panel = await summaryPanel();
  const cards = panel.querySelector('.fa-cards') as HTMLElement;
  return within(cards).getByText(predictor).closest('.fa-card') as HTMLElement;
}

describe('Forecast accuracy tab — async states', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loading: shows a skeleton while the summary and snapshots are pending', () => {
    vi.spyOn(api, 'getForecastAccuracySummary').mockImplementation(PENDING);
    vi.spyOn(api, 'getForecastSnapshots').mockImplementation(PENDING);
    renderPage();
    expect(document.querySelectorAll('.adm-skeleton').length).toBe(2);
  });

  it('success: fetches both endpoints and renders the summary plus the ledger', async () => {
    const { summarySpy, snapshotSpy } = mockBoth();
    renderPage();
    await screen.findByRole('table', { name: 'Recorded forecasts' });
    expect(summarySpy).toHaveBeenCalledTimes(1);
    expect(snapshotSpy).toHaveBeenCalledWith(1, 25, {});
    expect(await screen.findByText('Capsicum')).toBeInTheDocument();
  });

  it('error: each panel keeps its own retry (the summary failing does not blank the table)', async () => {
    const summarySpy = vi
      .spyOn(api, 'getForecastAccuracySummary')
      .mockRejectedValueOnce(new ApiError('boom', 500))
      .mockResolvedValueOnce(fxForecastAccuracySummary());
    vi.spyOn(api, 'getForecastSnapshots').mockResolvedValue(fxForecastSnapshots(1, 25));
    renderPage();

    // The ledger still renders while the summary is broken.
    await screen.findByRole('table', { name: 'Recorded forecasts' });
    const panel = await summaryPanel();
    expect(within(panel).getByText('Could not load')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(summarySpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Accuracy by forecast source')).toBeInTheDocument();
  });

  it('empty ledger (the normal state for the first months) is stated as a fact, not zeroes', async () => {
    mockBoth(EMPTY_SUMMARY, snapshotPage([], 0));
    renderPage();
    expect(await screen.findByText('No forecasts recorded yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Accuracy appears here once harvest days start passing/),
    ).toBeInTheDocument();
    // No fabricated metrics and no forever-spinner behind the empty state.
    const panel = await summaryPanel();
    expect(within(panel).queryByText('Accuracy by forecast source')).toBeNull();
    expect(panel.querySelector('.adm-skeleton')).toBeNull();
    // ...and the ledger says its own empty truth, not "no match".
    expect(screen.getByText('No forecast has been recorded yet.')).toBeInTheDocument();
  });
});

describe('Forecast accuracy tab — the model/fallback split law (PRD §3.4)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders model and fallback metrics in SEPARATE cards, with no blended number anywhere', async () => {
    mockBoth();
    renderPage();
    const panel = await summaryPanel();

    // Each predictor owns its own card, named by its own verbatim wire string.
    const modelCard = await predictorCard('residual');
    const fallbackCard = await predictorCard('crop_mean_fallback');
    expect(modelCard).not.toBe(fallbackCard);

    // The headline number of each card is that predictor's OWN median error.
    expect(modelCard.querySelector('.fa-headline__value')).toHaveTextContent('4.40%');
    expect(fallbackCard.querySelector('.fa-headline__value')).toHaveTextContent('20.21%');
    expect(within(modelCard).queryByText('20.21%')).toBeNull();
    expect(within(fallbackCard).queryByText('4.40%')).toBeNull();

    // Model vs fallback is stated in words, not left to the predictor string.
    expect(within(modelCard).getByText('Model')).toBeInTheDocument();
    expect(within(fallbackCard).getByText('Fallback')).toBeInTheDocument();

    // THE LAW: no averaged/summed figure of the two anywhere on the page. mean(4.40,
    // 20.21) = 12.31 (medianAPE), mean(9.33, 20.21) = 14.77 (MAPE), and the summed row
    // counts 4/4 would all be honest-looking lies.
    for (const blended of ['12.31%', '12.30%', '14.77%', '-12.55%', '-25.09%']) {
      expect(screen.queryByText(blended)).toBeNull();
    }
    expect(within(panel).getByText('Model forecasts and fallback forecasts are counted separately and never combined. A fallback is a crop average rather than a prediction, so a single blended number would hide which of the two you are looking at.')).toBeInTheDocument();
  });

  it('labels the per-predictor headline as windowed AND cross-version (never "the current model")', async () => {
    mockBoth();
    renderPage();
    const panel = await summaryPanel();
    const modelCard = await predictorCard('residual');

    // The scope caption sits with the headline metric inside the card.
    expect(within(modelCard).getByText(/Last 365 days/)).toBeInTheDocument();
    expect(within(modelCard).getByText(/all model versions together/)).toBeInTheDocument();
    // Counts are a different scope and say so.
    expect(
      within(panel).getByText('Every forecast recorded so far (all time).'),
    ).toBeInTheDocument();
  });

  it('keeps one per-version row per (version, predictor) group — rows are never merged', async () => {
    mockBoth();
    renderPage();
    const table = await screen.findByRole('table', { name: 'Accuracy by model version' });
    const rows = within(table).getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(3); // v17/residual, v17/crop_mean_fallback, (no version)/fallback

    const v17Rows = rows.filter((r) => within(r).queryByText('v17') !== null);
    expect(v17Rows).toHaveLength(2); // the same version appears twice, once per predictor
    expect(within(v17Rows[0]).getByText('residual')).toBeInTheDocument();
    expect(within(v17Rows[1]).getByText('crop_mean_fallback')).toBeInTheDocument();
    // A row that recorded no version says so rather than borrowing one.
    expect(within(table).getByText('Not recorded')).toBeInTheDocument();
  });

  it('shows the direction score with its denominators wherever it appears', async () => {
    mockBoth();
    renderPage();
    const modelCard = await predictorCard('residual');
    expect(within(modelCard).getByText('33.3%')).toBeInTheDocument();
    expect(within(modelCard).getByText('3 scored · 0 not counted')).toBeInTheDocument();
    // The fallback group could not score a direction at all: no rate, but the
    // denominators still show, so "no verdict" never reads as "always wrong".
    const fallbackCard = await predictorCard('crop_mean_fallback');
    expect(within(fallbackCard).getByText('0 scored · 1 not counted')).toBeInTheDocument();
  });

  it('reports band coverage against the nominal target with the gap in plain words', async () => {
    mockBoth();
    renderPage();
    const modelCard = await predictorCard('residual');
    expect(within(modelCard).getByText(/Target 80%/)).toBeInTheDocument();
    expect(within(modelCard).getByText(/13\.3 points below/)).toBeInTheDocument();
    expect(within(modelCard).getByText(/band is too narrow/)).toBeInTheDocument();
  });
});

describe('Forecast accuracy tab — null metrics are never zero', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an em-dash + "No data yet" for every uncomputable metric, and no 0', async () => {
    mockBoth(
      {
        ...EMPTY_SUMMARY,
        // rows exist, but none of them could be scored yet
        counts: { total: 3, pending: 3, matured: 0, actualUnavailable: 0, notMaturable: 0 },
        byActivePredictor: [{ activePredictor: 'residual', metrics: { ...NULL_METRICS } }],
        byModelVersion: [],
      },
      snapshotPage([], 0),
    );
    renderPage();
    const panel = await summaryPanel();
    const card = await predictorCard('residual');

    // The headline is absent, not zero.
    expect(within(card).queryByText('0.00%')).toBeNull();
    expect(within(card).queryByText('0.0%')).toBeNull();
    const markers = within(card).getAllByText('No data yet');
    expect(markers.length).toBeGreaterThanOrEqual(4); // median, mape, bias, coverage, direction
    // The visible marker is an em-dash and the sentence is screen-reader only.
    expect(card.querySelectorAll('.fa-nodata [aria-hidden="true"]')[0]).toHaveTextContent('—');
    expect(markers[0]).toHaveClass('sr-only');
    // Latest snapshot date is unknown, and says so rather than showing a fake date.
    expect(within(panel).getByText(/Latest recorded forecast:/)).toBeInTheDocument();
  });
});

describe('Forecast accuracy tab — the snapshot ledger', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders every maturity state as a glyph AND a word (colour is never the only signal)', async () => {
    mockBoth();
    renderPage();
    const table = await screen.findByRole('table', { name: 'Recorded forecasts' });

    const expected: Array<[string, string, string]> = [
      ['Carrot', 'Waiting for harvest', '…'],
      ['Banana', 'Cannot be scored', '–'],
      ['Beans', 'Scored', '✓'],
      ['Papaya', 'No market price found', '?'],
    ];
    for (const [crop, word, glyph] of expected) {
      const row = within(table).getByText(crop).closest('tr') as HTMLElement;
      const badge = within(row).getByText(word).closest('span') as HTMLElement;
      // the word is real text, not a title/colour, and the glyph is decorative only
      expect(badge).toHaveTextContent(word);
      expect(within(badge).getByText(glyph.trim(), { exact: false })).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    }
  });

  it('shows the forecast with its band and never a bare single number', async () => {
    mockBoth();
    renderPage();
    const table = await screen.findByRole('table', { name: 'Recorded forecasts' });
    const row = within(table).getByText('Capsicum').closest('tr') as HTMLElement;
    expect(within(row).getByText('Rs. 552.00')).toBeInTheDocument();
    expect(within(row).getByText('80% band Rs. 470.00 – 640.00')).toBeInTheDocument();
    // The frozen confidence string is translated, never re-graded.
    expect(within(row).getByText('Good')).toBeInTheDocument();
    // A scored row shows its signed error; a pending row shows the no-data marker.
    expect(within(row).getByText('+4.40%')).toBeInTheDocument();
    const pending = within(table).getByText('Carrot').closest('tr') as HTMLElement;
    expect(within(pending).getAllByText('No data yet').length).toBeGreaterThan(0);
  });

  it('expands a row to reveal how the forecast was made and what it was scored against', async () => {
    mockBoth();
    renderPage();
    const table = await screen.findByRole('table', { name: 'Recorded forecasts' });
    const row = within(table).getByText('Tomato').closest('tr') as HTMLElement;
    const toggle = within(row).getByRole('button', { name: 'Show details for Tomato' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).not.toHaveAttribute('aria-controls'); // no dangling idref while closed

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('model_served')).toBeInTheDocument();
    // The band missed on this row, and the drill-down says so in words.
    expect(screen.getByText('The actual price fell outside the band')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Hide details for Tomato' })).toBeInTheDocument();
  });

  it('calls the ledger server-paged and re-fetches on the next page', async () => {
    const { snapshotSpy } = mockBoth(
      fxForecastAccuracySummary(),
      snapshotPage(fxForecastSnapshots(1, 25).items, 45), // total > pageSize -> pager shows
    );
    renderPage();
    await screen.findByRole('table', { name: 'Recorded forecasts' });
    expect(snapshotSpy).toHaveBeenCalledWith(1, 25, {});
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(snapshotSpy).toHaveBeenCalledWith(2, 25, {}));
  });
});

describe('Forecast accuracy tab — filters', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends modelVersion as a query filter and offers only versions the server reported', async () => {
    const { snapshotSpy } = mockBoth();
    renderPage();
    const select = await screen.findByRole('combobox', { name: 'Model version' });
    // Options come from the summary's own version groups; the null-version group is
    // dropped because it is not something the server can be asked to filter on.
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All versions', 'v17']);

    fireEvent.change(select, { target: { value: 'v17' } });
    await waitFor(() => expect(snapshotSpy).toHaveBeenCalledWith(1, 25, { modelVersion: 'v17' }));
  });

  it('sends maturedOnly only when the toggle is ON (the default request carries no filter)', async () => {
    const { snapshotSpy } = mockBoth();
    renderPage();
    const toggle = await screen.findByRole('checkbox', { name: 'Scored forecasts only' });
    expect(toggle).not.toBeChecked();
    expect(snapshotSpy).toHaveBeenCalledWith(1, 25, {});

    fireEvent.click(toggle);
    await waitFor(() => expect(snapshotSpy).toHaveBeenCalledWith(1, 25, { maturedOnly: true }));

    fireEvent.click(toggle);
    await waitFor(() => expect(snapshotSpy).toHaveBeenLastCalledWith(1, 25, {}));
  });

  it('resets to page 1 when a filter changes (a stale cursor never outlives its query)', async () => {
    const { snapshotSpy } = mockBoth(
      fxForecastAccuracySummary(),
      snapshotPage(fxForecastSnapshots(1, 25).items, 45),
    );
    renderPage();
    await screen.findByRole('table', { name: 'Recorded forecasts' });
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(snapshotSpy).toHaveBeenCalledWith(2, 25, {}));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Scored forecasts only' }));
    await waitFor(() => expect(snapshotSpy).toHaveBeenCalledWith(1, 25, { maturedOnly: true }));
  });

  it('tells "nothing recorded" and "nothing matches this filter" apart', async () => {
    const spy = vi.spyOn(api, 'getForecastSnapshots').mockResolvedValue(snapshotPage([], 0));
    vi.spyOn(api, 'getForecastAccuracySummary').mockResolvedValue(fxForecastAccuracySummary());
    renderPage();
    expect(await screen.findByText('No forecast has been recorded yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Scored forecasts only' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, { maturedOnly: true }));
    expect(
      await screen.findByText(/No recorded forecast matches these filters/),
    ).toBeInTheDocument();
  });
});

describe('Forecast accuracy tab — accessible names', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives every new control and region an exact accessible name', async () => {
    mockBoth();
    renderPage();
    await screen.findByRole('table', { name: 'Recorded forecasts' });

    expect(screen.getByRole('region', { name: 'Accuracy summary' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recorded forecasts' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Model version' })).toHaveAccessibleName(
      'Model version',
    );
    expect(screen.getByRole('checkbox', { name: 'Scored forecasts only' })).toHaveAccessibleName(
      'Scored forecasts only',
    );
    // Row expanders name their row, so a screen-reader user knows WHICH crop opens.
    expect(
      screen.getByRole('button', { name: 'Show details for Capsicum' }),
    ).toHaveAccessibleName('Show details for Capsicum');
    // Predictor cards are named by their own heading, not by a repeated label.
    const card = await predictorCard('residual');
    const head = card.querySelector('.fa-card__head') as HTMLElement;
    expect(card).toHaveAttribute('aria-labelledby', head.id);
    // The Model/Fallback badge is part of the heading's text, so it is announced.
    expect(head).toHaveTextContent('residual Model');
  });
});
