import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import { fxSystemErrors } from '../api/fixtures';
import { formatDateTime } from '../lib/format';
import type { SystemError, SystemErrorPage } from '../api/types';
import SystemErrorsPage from '../admin/logs/SystemErrorsPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/logs/errors']}>
      <AuthProvider>
        <SystemErrorsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const PENDING = () => new Promise<never>(() => {}); // never resolves — holds loading

function page(items: SystemError[], total = items.length): SystemErrorPage {
  return { items, page: 1, pageSize: 25, total };
}

// A row with a long, multi-line stack trace (exercises the scrollable <pre> drill-down).
const STACK_ROW: SystemError = {
  id: 100,
  occurredUtc: '2026-07-22T00:56:05Z',
  source: 'API',
  exceptionType: 'System.InvalidOperationException',
  message: 'Sequence contains no elements while resolving the latest forecast frame.',
  path: '/api/forecast/best-crops',
  method: 'GET',
  traceId: '0HNN7HFVC11H0:00000001',
  stackTrace:
    'System.InvalidOperationException: Sequence contains no elements\n' +
    '   at System.Linq.ThrowHelper.ThrowNoElementsException()\n' +
    '   at AgriForecast.Application.Forecast.BestCropsHandler.Handle(BestCropsQuery q)',
};

// A row with NULL message AND NULL stack (exercises both quiet "none" drill-down states).
const NULL_ROW: SystemError = {
  id: 101,
  occurredUtc: '2026-07-21T18:12:40Z',
  source: 'API',
  exceptionType: 'System.NullReferenceException',
  message: null,
  path: '/api/crops/get/all',
  method: 'GET',
  traceId: '0HNN7H9AB2K44:00000007',
  stackTrace: null,
};

async function table(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: 'System errors' });
}

async function findRow(typeName: string): Promise<HTMLElement> {
  const t = await table();
  return within(t).getByText(typeName).closest('tr') as HTMLElement;
}

describe('System errors tab (Logs P3.B)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- four async states ---------------------------------------------------
  it('loading: shows a skeleton while errors are pending', () => {
    vi.spyOn(api, 'getSystemErrors').mockImplementation(PENDING);
    renderPage();
    expect(document.querySelector('.adm-skeleton')).not.toBeNull();
  });

  it('success: renders a row per system error from the fixtures', async () => {
    vi.spyOn(api, 'getSystemErrors').mockResolvedValue(fxSystemErrors(1, 25));
    renderPage();
    const t = await table();
    expect(within(t).getByText('InvalidOperationException')).toBeInTheDocument();
    expect(within(t).getByText('NullReferenceException')).toBeInTheDocument();
    expect(within(t).getByText('TimeoutException')).toBeInTheDocument();
  });

  it('renders rows newest-first (fixture OccurredUtc DESC order is load-bearing)', async () => {
    // Fixture-order bugs have shipped before: the API contract is OccurredUtc DESC, and the
    // fixtures must model it. Assert the RENDERED timestamps are monotonically non-increasing
    // so a scrambled fxSystemErrorsAll can never pass green.
    vi.spyOn(api, 'getSystemErrors').mockResolvedValue(fxSystemErrors(1, 25));
    renderPage();
    const t = await table();
    const rendered = within(t)
      .getAllByRole('row')
      .map((row) => row.querySelector('td[data-label="When"]')?.textContent ?? '')
      .filter(Boolean);
    const fixtureUtcDesc = fxSystemErrors(1, 25).items.map((e) => e.occurredUtc);
    const sorted = [...fixtureUtcDesc].sort((a, b) => (a < b ? 1 : -1));
    expect(fixtureUtcDesc).toEqual(sorted);
    expect(rendered[0]).toBe(formatDateTime(fixtureUtcDesc[0], 'en'));
  });

  it('empty: shows the positive "No system errors" state when there are none', async () => {
    vi.spyOn(api, 'getSystemErrors').mockResolvedValue(page([], 0));
    renderPage();
    expect(await screen.findByText('No system errors')).toBeInTheDocument();
  });

  it('error: shows the error state with a retry when the load fails', async () => {
    const spy = vi
      .spyOn(api, 'getSystemErrors')
      .mockRejectedValueOnce(new ApiError('boom', 500))
      .mockResolvedValueOnce(fxSystemErrors(1, 25));
    renderPage();
    expect(await screen.findByText('Could not load')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(await table()).toBeInTheDocument();
  });

  // ---- exception type: namespace de-emphasised, full value in the title ----
  it('splits the exception type into a muted namespace + the class name, full value in the title', async () => {
    vi.spyOn(api, 'getSystemErrors').mockResolvedValue(page([STACK_ROW]));
    renderPage();
    const row = await findRow('InvalidOperationException');
    expect(within(row).getByText('System.')).toBeInTheDocument(); // namespace prefix
    // the full fully-qualified type is preserved in a title for the reader who needs it
    expect(within(row).getByTitle('System.InvalidOperationException')).toBeInTheDocument();
  });

  // ---- drill-down reveals the full message + stack trace verbatim ----------
  it('expands a row to reveal the full message and stack trace verbatim, toggling aria-expanded', async () => {
    vi.spyOn(api, 'getSystemErrors').mockResolvedValue(page([STACK_ROW]));
    renderPage();
    const row = await findRow('InvalidOperationException');
    const toggle = within(row).getByRole('button', { name: /show details/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = document.getElementById('err-detail-100') as HTMLElement;
    // full message verbatim in the drill-down + the stack trace preserved line-for-line
    expect(within(detail).getByText(STACK_ROW.message!)).toBeInTheDocument();
    expect(within(detail).getByText(/ThrowNoElementsException/)).toBeInTheDocument();
    // the full (untruncated) trace id is shown in the drill-down
    expect(within(detail).getByText(STACK_ROW.traceId!)).toBeInTheDocument();
  });

  // ---- null message + null stack -> quiet "none" notes (never empty boxes) --
  it('shows the quiet "No stack trace" and "No message" notes on a null-stack row', async () => {
    vi.spyOn(api, 'getSystemErrors').mockResolvedValue(page([NULL_ROW]));
    renderPage();
    const row = await findRow('NullReferenceException');
    fireEvent.click(within(row).getByRole('button', { name: /show details/i }));
    const detail = document.getElementById('err-detail-101') as HTMLElement;
    expect(within(detail).getByText('No stack trace')).toBeInTheDocument();
    expect(within(detail).getByText('No message recorded.')).toBeInTheDocument();
  });

  // ---- "Where" = method + path --------------------------------------------
  it('renders the method + request path in the "Where" cell', async () => {
    vi.spyOn(api, 'getSystemErrors').mockResolvedValue(page([STACK_ROW]));
    renderPage();
    const row = await findRow('InvalidOperationException');
    expect(within(row).getByText('GET')).toBeInTheDocument();
    expect(within(row).getByText('/api/forecast/best-crops')).toBeInTheDocument();
  });

  // ---- date formatting -----------------------------------------------------
  it('formats the occurredUtc timestamp with the locale date formatter', async () => {
    vi.spyOn(api, 'getSystemErrors').mockResolvedValue(page([STACK_ROW]));
    renderPage();
    const row = await findRow('InvalidOperationException');
    expect(within(row).getByText(formatDateTime(STACK_ROW.occurredUtc, 'en'))).toBeInTheDocument();
  });

  // ---- server paging -------------------------------------------------------
  it('calls the API server-paged and re-fetches on next page', async () => {
    const spy = vi
      .spyOn(api, 'getSystemErrors')
      .mockResolvedValue(page(fxSystemErrors(1, 25).items, 45)); // total>pageSize -> pager shows
    renderPage();
    await findRow('InvalidOperationException');
    expect(spy).toHaveBeenCalledWith(1, 25);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(2, 25));
  });
});
