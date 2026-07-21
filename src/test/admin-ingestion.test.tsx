import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import { fxIngestionRuns, fxIngestionStatusObj } from '../api/fixtures';
import type { IngestionRun, IngestionRunPage } from '../api/types';
import { useServerPagination } from '../components/TablePagination';
import IngestionRunsPage from '../admin/IngestionRunsPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/logs/ingestion']}>
      <AuthProvider>
        <IngestionRunsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const PENDING = () => new Promise<never>(() => {}); // never resolves — holds the loading state

function runsResponse(items: IngestionRun[], total = items.length): IngestionRunPage {
  return { items, page: 1, pageSize: 25, total };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

// "DAMBULLA_DEC" also appears in the filter <option> + the source-health card — scope
// row lookups to the runs <table> (its <caption> gives it the accessible name).
async function findRow(source: string): Promise<HTMLElement> {
  const table = await screen.findByRole('table', { name: 'Recent runs' });
  return within(table).getByText(source).closest('tr') as HTMLElement;
}

describe('Ingestion runs page (ADM-8)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    setHidden(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    setHidden(false);
  });

  // ---- four async states: STATUS ------------------------------------------
  describe('status card — four async states', () => {
    it('loading: shows a skeleton while the status is pending', async () => {
      vi.spyOn(api, 'getIngestionStatus').mockImplementation(PENDING);
      vi.spyOn(api, 'getIngestionRuns').mockImplementation(PENDING);
      renderPage();
      expect(document.querySelector('.adm-skeleton')).not.toBeNull();
    });

    it('success: renders serviceAddress verbatim from the payload', async () => {
      vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
      vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
      renderPage();
      // serviceAddress is rendered straight from the payload ("unconfigured").
      expect(await screen.findByText('unconfigured')).toBeInTheDocument();
      // textual state (the a11y source of truth) is present, not just a colour dot.
      expect(screen.getByText(/Ingestion service is/i)).toBeInTheDocument();
    });

    it('error: shows the error state with a retry when the status has never loaded', async () => {
      vi.spyOn(api, 'getIngestionStatus').mockRejectedValue(new ApiError('boom', 500));
      vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
      renderPage();
      expect(await screen.findAllByText('Could not load')).not.toHaveLength(0);
      expect(screen.getAllByText('Retry').length).toBeGreaterThan(0);
    });

    // A status snapshot always returns an object — there is no "empty" state for it
    // (unlike the runs list). The three states above are the meaningful set.
  });

  // ---- four async states: RUNS --------------------------------------------
  describe('runs list — four async states', () => {
    it('loading: shows a skeleton while runs are pending', async () => {
      vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
      vi.spyOn(api, 'getIngestionRuns').mockImplementation(PENDING);
      renderPage();
      expect(document.querySelector('.adm-skeleton')).not.toBeNull();
    });

    it('success: renders the runs table with a row per run', async () => {
      vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
      vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
      renderPage();
      const table = await screen.findByRole('table', { name: 'Recent runs' });
      expect(within(table).getByText('DAMBULLA_DEC')).toBeInTheDocument();
      expect(within(table).getByText('HARTI')).toBeInTheDocument();
    });

    it('empty: shows the empty state when there are no runs', async () => {
      vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
      vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(runsResponse([], 0));
      renderPage();
      expect(await screen.findByText('No runs')).toBeInTheDocument();
    });

    it('error: shows the error state with retry on a runs failure', async () => {
      vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
      vi.spyOn(api, 'getIngestionRuns').mockRejectedValue(new ApiError('boom', 500));
      renderPage();
      // status succeeds; the runs section fails INDEPENDENTLY with its own retry.
      await screen.findByText('unconfigured');
      expect(screen.getAllByText('Could not load').length).toBeGreaterThan(0);
    });
  });

  // ---- badge mapping -------------------------------------------------------
  it('maps run status + verification verdict to labelled badges (never colour-only)', async () => {
    vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
    vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
    renderPage();
    const decRow = await findRow('DAMBULLA_DEC');
    expect(within(decRow).getByText('Succeeded')).toBeInTheDocument();
    expect(within(decRow).getByText('Warn')).toBeInTheDocument(); // verdict text present
    const table = screen.getByRole('table', { name: 'Recent runs' });
    const hartiRow = within(table).getByText('HARTI').closest('tr')!;
    expect(within(hartiRow).getByText('Failed')).toBeInTheDocument();
    expect(within(hartiRow).getByText('Not run')).toBeInTheDocument(); // no verification
    // last-run rollup badge on the status card
    expect(screen.getByText('Partial')).toBeInTheDocument();
  });

  // ---- expand / collapse ---------------------------------------------------
  it('toggles a run row open/closed via aria-expanded and reveals parsed checks', async () => {
    vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
    vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
    renderPage();
    const decRow = await findRow('DAMBULLA_DEC');
    const toggle = within(decRow).getByRole('button', { name: /show checks/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // an individual parsed check name + its raw counts appear
    expect(await screen.findByText('dec_row_count')).toBeInTheDocument();
    expect(screen.getByText('rows: 320')).toBeInTheDocument();
    // aria-controls references the detail row only while expanded
    expect(toggle).toHaveAttribute('aria-controls');
    fireEvent.click(within(decRow).getByRole('button', { name: /hide checks/i }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).not.toHaveAttribute('aria-controls'); // no dangling reference when collapsed
  });

  // ---- checksJson parse failure -------------------------------------------
  it('degrades to a plain note (no crash) when checksJson is not valid JSON', async () => {
    const badRun: IngestionRun = {
      ...fxIngestionRuns(1, 25).items[0],
      id: 'bad-run',
      source: 'DAMBULLA_DEC',
      errorSummary: null,
      verification: {
        overallStatus: 'Warn',
        ranAtUtc: '2026-07-21T19:11:02Z',
        nChecksPass: 0,
        nChecksWarn: 1,
        nChecksFail: 0,
        checksJson: '{not valid json',
      },
    };
    vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
    vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(runsResponse([badRun]));
    renderPage();
    const row = await findRow('DAMBULLA_DEC');
    fireEvent.click(within(row).getByRole('button', { name: /show checks/i }));
    expect(await screen.findByText(/Verification details are unavailable/i)).toBeInTheDocument();
  });

  // ---- server paging -------------------------------------------------------
  it('calls the API with server page params and re-fetches on next page', async () => {
    const spy = vi
      .spyOn(api, 'getIngestionRuns')
      .mockResolvedValue(runsResponse(fxIngestionRuns(1, 25).items, 45)); // total>pageSize -> pager shows
    vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
    renderPage();
    await screen.findByText('DAMBULLA_DEC');
    // initial load is server-paged: page 1, pageSize 25, no source filter
    expect(spy).toHaveBeenCalledWith(1, 25, undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(2, 25, undefined));
  });

  it('passes the chosen source key to the API and resets to page 1', async () => {
    const spy = vi
      .spyOn(api, 'getIngestionRuns')
      .mockResolvedValue(fxIngestionRuns(1, 25));
    vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
    renderPage();
    await screen.findByText('DAMBULLA_DEC');
    const select = screen.getByLabelText('Source') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'HARTI' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, 'HARTI'));
  });

  // ---- stale-response race (S1): a slow older load must not clobber newer data
  it('drops a stale runs response when a newer load resolves first', async () => {
    const deferreds: Array<(v: IngestionRunPage) => void> = [];
    vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
    vi.spyOn(api, 'getIngestionRuns').mockImplementation(
      () => new Promise<IngestionRunPage>((resolve) => deferreds.push(resolve)),
    );
    const decRun = fxIngestionRuns(1, 25).items.find((r) => r.source === 'DAMBULLA_DEC')!;
    const hartiRun = fxIngestionRuns(1, 25).items.find((r) => r.source === 'HARTI')!;
    renderPage();
    // load #1 fires on mount (source=''); wait until the mock has been called once
    await waitFor(() => expect(deferreds.length).toBe(1));
    // change the filter -> load #2 fires
    fireEvent.change(screen.getByLabelText('Source') as HTMLSelectElement, { target: { value: 'HARTI' } });
    await waitFor(() => expect(deferreds.length).toBe(2));
    // newer load (#2) resolves FIRST with HARTI-only data ...
    await act(async () => {
      deferreds[1](runsResponse([hartiRun]));
    });
    // ... then the stale older load (#1) resolves LATE with the old DEC data
    await act(async () => {
      deferreds[0](runsResponse([decRun]));
    });
    const table = await screen.findByRole('table', { name: 'Recent runs' });
    // the newer HARTI data wins; the stale DEC response is dropped
    expect(within(table).getByText('HARTI')).toBeInTheDocument();
    expect(within(table).queryByText('DAMBULLA_DEC')).toBeNull();
  });

  // ---- Nit 4: no immediate mount fetch while the tab starts hidden ----------
  it('skips the initial status poll when the tab starts hidden, and fires it on resume', async () => {
    setHidden(true);
    const spy = vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
    vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
    renderPage();
    await flush();
    expect(spy).not.toHaveBeenCalled(); // hidden at mount -> no poll
    setHidden(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(spy).toHaveBeenCalledTimes(1); // resume handler fired the first poll
  });

  // ---- reduced-motion hook: the class the CSS disables is applied ----------
  it('applies the .ing-dot--running class (the reduced-motion CSS target) when running', async () => {
    vi.spyOn(api, 'getIngestionStatus').mockResolvedValue({ ...fxIngestionStatusObj, state: 'running' });
    vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
    renderPage();
    await screen.findByText('unconfigured');
    expect(document.querySelector('.ing-dot--running')).not.toBeNull();
  });

  // ---- polling: pause on hidden + exponential backoff on error -------------
  it('polls the status on a 30s cadence and pauses while the tab is hidden', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(api, 'getIngestionStatus').mockResolvedValue(fxIngestionStatusObj);
    vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
    renderPage();
    await flush();
    expect(spy).toHaveBeenCalledTimes(1); // initial poll
    await advance(30_000);
    expect(spy).toHaveBeenCalledTimes(2); // 30s cadence
    // hide the tab -> the pending timer is cleared, no further polls fire
    setHidden(true);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await advance(120_000);
    expect(spy).toHaveBeenCalledTimes(2); // paused
  });

  it('backs off 30 -> 60 -> 120s on consecutive status errors', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(api, 'getIngestionStatus').mockRejectedValue(new ApiError('boom', 500));
    vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
    renderPage();
    await flush();
    expect(spy).toHaveBeenCalledTimes(1); // fail #1 -> next in 30s
    await advance(29_000);
    expect(spy).toHaveBeenCalledTimes(1); // not yet
    await advance(1_000);
    expect(spy).toHaveBeenCalledTimes(2); // 30s elapsed, fail #2 -> next in 60s
    await advance(59_000);
    expect(spy).toHaveBeenCalledTimes(2); // 60s not elapsed
    await advance(1_000);
    expect(spy).toHaveBeenCalledTimes(3); // 60s elapsed, fail #3 -> next in 120s
    await advance(119_000);
    expect(spy).toHaveBeenCalledTimes(3);
    await advance(1_000);
    expect(spy).toHaveBeenCalledTimes(4); // 120s cap reached
  });
});

// S2: the server-page cursor self-clamps when `total` shrinks under it.
describe('useServerPagination — page clamp on shrinking total', () => {
  it('clamps a stale page cursor to the last available page', () => {
    const { result, rerender } = renderHook(({ total }) => useServerPagination(total, 25), {
      initialProps: { total: 100 }, // 4 pages
    });
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    expect(result.current.totalPages).toBe(4);
    // total shrinks to a single page (e.g. a Refresh returns far fewer rows)
    rerender({ total: 5 });
    expect(result.current.totalPages).toBe(1);
    expect(result.current.page).toBe(1); // clamped, never "3 of 1"
  });
});
