import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import { fxTrainingRuns } from '../api/fixtures';
import type { TrainingRun, TrainingRunPage } from '../api/types';
import TrainingRunsPage from '../admin/logs/TrainingRunsPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/logs/training']}>
      <AuthProvider>
        <TrainingRunsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const PENDING = () => new Promise<never>(() => {}); // never resolves — holds loading

function page(items: TrainingRun[], total = items.length): TrainingRunPage {
  return { items, page: 1, pageSize: 25, total };
}

const OVERRIDE_ROW: TrainingRun = {
  version: 'v17',
  trainedAtUtc: '2026-07-21T02:14:30Z',
  promoted: true, // currently LIVE
  decisionPromoted: false, // ...yet the gate declined it => manual override
  promotionDecision: 'Guardrail blocked the cross-frame comparison; overridden manually after re-scoring.',
  bestMlKind: 'hybrid',
  bestMlMae: 97.925,
  bestBaselineKind: 'crop_mean',
  bestBaselineMae: 118.4,
  nTrainRows: 84120,
  nCrops: 96,
};

async function findRow(version: string): Promise<HTMLElement> {
  const table = await screen.findByRole('table', { name: 'Model training runs' });
  return within(table).getByText(version).closest('tr') as HTMLElement;
}

describe('Model training tab (Logs P2.6)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- four async states ---------------------------------------------------
  it('loading: shows a skeleton while runs are pending', () => {
    vi.spyOn(api, 'getTrainingRuns').mockImplementation(PENDING);
    renderPage();
    expect(document.querySelector('.adm-skeleton')).not.toBeNull();
  });

  it('no longer renders the explainer banner on the page (it moved to the tab tooltip)', async () => {
    vi.spyOn(api, 'getTrainingRuns').mockResolvedValue(fxTrainingRuns(1, 25));
    renderPage();
    await screen.findByRole('table', { name: 'Model training runs' });
    expect(screen.queryByText(i18n.t('admin.logs.training.explainer'))).toBeNull();
  });

  it('success: renders a row per training run', async () => {
    vi.spyOn(api, 'getTrainingRuns').mockResolvedValue(fxTrainingRuns(1, 25));
    renderPage();
    const table = await screen.findByRole('table', { name: 'Model training runs' });
    expect(within(table).getByText('v17')).toBeInTheDocument();
    expect(within(table).getByText('v16')).toBeInTheDocument();
  });

  it('empty: shows the empty state when there are no runs', async () => {
    vi.spyOn(api, 'getTrainingRuns').mockResolvedValue(page([], 0));
    renderPage();
    expect(await screen.findByText('No training runs')).toBeInTheDocument();
  });

  it('error: shows the error state with a retry when the load fails', async () => {
    const spy = vi
      .spyOn(api, 'getTrainingRuns')
      .mockRejectedValueOnce(new ApiError('boom', 500))
      .mockResolvedValueOnce(fxTrainingRuns(1, 25));
    renderPage();
    expect(await screen.findByText('Could not load')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('table', { name: 'Model training runs' })).toBeInTheDocument();
  });

  // ---- the honest override edge case --------------------------------------
  it('shows Live AND "Failed quality check" together on a manual-override row', async () => {
    vi.spyOn(api, 'getTrainingRuns').mockResolvedValue(page([OVERRIDE_ROW]));
    renderPage();
    const row = await findRow('v17');
    // both signals are surfaced honestly — never collapsed into one
    expect(within(row).getByText('Live')).toBeInTheDocument();
    expect(within(row).getByText('Failed quality check')).toBeInTheDocument();
    // the promotionDecision is available as a tooltip on the Live badge
    expect(within(row).getByText('Live')).toHaveAttribute('title', OVERRIDE_ROW.promotionDecision!);
  });

  it('shows Live AND "Passed quality check" together on a healthy live row (no override)', async () => {
    const healthyLive: TrainingRun = {
      ...OVERRIDE_ROW,
      version: 'v18',
      promoted: true,
      decisionPromoted: true,
    };
    vi.spyOn(api, 'getTrainingRuns').mockResolvedValue(page([healthyLive]));
    renderPage();
    const row = await findRow('v18');
    expect(within(row).getByText('Live')).toBeInTheDocument();
    expect(within(row).getByText('Passed quality check')).toBeInTheDocument();
    expect(within(row).queryByText('Failed quality check')).toBeNull();
  });

  it('shows "Passed quality check" (and no Live badge) on a past gate-promoted, non-live row', async () => {
    const pastPromoted: TrainingRun = {
      ...OVERRIDE_ROW,
      version: 'v16',
      promoted: false,
      decisionPromoted: true,
    };
    vi.spyOn(api, 'getTrainingRuns').mockResolvedValue(page([pastPromoted]));
    renderPage();
    const row = await findRow('v16');
    expect(within(row).getByText('Passed quality check')).toBeInTheDocument();
    expect(within(row).queryByText('Live')).toBeNull();
  });

  // ---- MAE formatting (2dp, not colour-coded) -----------------------------
  it('formats MAE to 2 decimal places', async () => {
    vi.spyOn(api, 'getTrainingRuns').mockResolvedValue(page([OVERRIDE_ROW]));
    renderPage();
    const row = await findRow('v17');
    expect(within(row).getByText('MAE 97.93')).toBeInTheDocument(); // 97.925 -> 97.93
    expect(within(row).getByText('MAE 118.40')).toBeInTheDocument(); // trailing zero kept
  });

  // ---- promotionDecision drill-down ---------------------------------------
  it('expands a row to reveal the promotion decision text verbatim', async () => {
    vi.spyOn(api, 'getTrainingRuns').mockResolvedValue(page([OVERRIDE_ROW]));
    renderPage();
    const row = await findRow('v17');
    const toggle = within(row).getByRole('button', { name: /show decision/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(OVERRIDE_ROW.promotionDecision!)).toBeInTheDocument();
  });

  // ---- server paging -------------------------------------------------------
  it('calls the API server-paged and re-fetches on next page', async () => {
    const spy = vi
      .spyOn(api, 'getTrainingRuns')
      .mockResolvedValue(page(fxTrainingRuns(1, 25).items, 45)); // total>pageSize -> pager shows
    renderPage();
    await screen.findByText('v17');
    expect(spy).toHaveBeenCalledWith(1, 25);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(2, 25));
  });
});
