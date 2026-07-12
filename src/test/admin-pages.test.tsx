import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import { ymdLocal } from '../lib/format';
import PolicyFlagsPage from '../admin/PolicyFlagsPage';
import MarketsPage from '../admin/MarketsPage';
import UsersPage from '../admin/UsersPage';
import FestivalsPage from '../admin/FestivalsPage';
import IndicatorsPage from '../admin/IndicatorsPage';
import NewsPage from '../admin/NewsPage';

function renderPage(el: React.ReactNode, path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>{el}</AuthProvider>
    </MemoryRouter>,
  );
}

describe('Admin console pages', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- ADM-2 policy flags -------------------------------------------------
  describe('PolicyFlagsPage (ADM-2)', () => {
    it('defaults to TODAY (active flags only), and "Show all flags" reveals the full register', async () => {
      renderPage(<PolicyFlagsPage />);
      await screen.findByText('Monthly fuel price formula (CPC pricing formula)');
      // default = as-of today -> only active flags; no expired/scheduled rows yet
      expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
      expect(screen.queryByText('Expired')).toBeNull();
      expect(screen.queryByText('Scheduled')).toBeNull();
      // direction glyph rendered (bearish ▼ appears somewhere)
      expect(document.body.textContent).toContain('▼');
      // clearing the default date shows the whole register (expired 2021 import ban
      // + the scheduled future price-floor row reappear)
      fireEvent.click(screen.getByText('Show all flags'));
      await waitFor(() => expect(screen.getAllByText('Expired').length).toBeGreaterThan(0));
      expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0);
    });

    it('treats a 400 (contract quirk: empty list) as the empty state, not an error', async () => {
      vi.spyOn(api, 'getPolicyFlags').mockRejectedValueOnce(new ApiError('No policy flags found.', 400));
      renderPage(<PolicyFlagsPage />);
      await screen.findByText('No policy flags');
      expect(screen.queryByText('Could not load')).toBeNull();
    });

    it('shows the error state with retry on a non-400 failure', async () => {
      vi.spyOn(api, 'getPolicyFlags').mockRejectedValueOnce(new ApiError('boom', 500));
      renderPage(<PolicyFlagsPage />);
      await screen.findByText('Could not load');
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it("loads with today's date by default and passes a changed as-of date to the query", async () => {
      const spy = vi.spyOn(api, 'getPolicyFlags');
      renderPage(<PolicyFlagsPage />);
      await screen.findByText('Monthly fuel price formula (CPC pricing formula)');
      // initial load queried as-of TODAY (local calendar date)
      expect(spy).toHaveBeenCalledWith(ymdLocal(new Date()));
      const input = document.querySelector('input[type="date"]') as HTMLInputElement;
      expect(input.value).toBe(ymdLocal(new Date()));
      fireEvent.change(input, { target: { value: '2021-06-01' } });
      await waitFor(() => expect(spy).toHaveBeenCalledWith('2021-06-01'));
    });
  });

  // ---- ADM-3 markets ------------------------------------------------------
  describe('MarketsPage (ADM-3)', () => {
    it('paginates the 12 real markets at 10 per page with Dambulla as the economic centre', async () => {
      renderPage(<MarketsPage />);
      await screen.findByText('Dambulla Dedicated Economic Centre');
      // 12 markets, 10 per page -> page 1 shows 10 rows and the pager reads "1 of 2"
      expect(document.querySelectorAll('.adm-table tbody tr').length).toBe(10);
      expect(screen.getByText('1 of 2')).toBeInTheDocument();
      // exactly one economic-centre marker (Dambulla, page 1)
      expect(screen.getAllByText('Economic centre', { selector: '.adm-yes' }).length).toBe(1);
      // next page -> remaining 2 rows
      fireEvent.click(screen.getByLabelText('Next page'));
      await waitFor(() => expect(document.querySelectorAll('.adm-table tbody tr').length).toBe(2));
      expect(screen.getByText('2 of 2')).toBeInTheDocument();
      // items-per-page 25 -> everything on one page, pager still visible (total > 10)
      fireEvent.change(screen.getByLabelText(/Items per page/), { target: { value: '25' } });
      await waitFor(() => expect(document.querySelectorAll('.adm-table tbody tr').length).toBe(12));
      expect(screen.getByText('1 of 1')).toBeInTheDocument();
    });
  });

  // ---- ADM-4 users --------------------------------------------------------
  describe('UsersPage (ADM-4)', () => {
    it('renders users paged at 10 and deletes one from in-memory state', async () => {
      renderPage(<UsersPage />);
      await screen.findByText('claudetest');
      // >10 fixture users -> page 1 holds exactly 10 rows and the pager is shown
      expect(document.querySelectorAll('.adm-table tbody tr').length).toBe(10);
      expect(screen.getByLabelText(/Items per page/)).toBeInTheDocument();
      // delete claudetest: open its row's delete button
      const row = screen.getByText('claudetest').closest('tr')!;
      fireEvent.click(row.querySelector('.adm-rowbtn--danger') as HTMLButtonElement);
      // confirm dialog — click the danger confirm button inside the dialog
      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog.querySelector('.adm-btn--danger') as HTMLButtonElement);
      // the row is gone (page 1 refills from page 2, so the count stays at 10)
      await waitFor(() => expect(screen.queryByText('claudetest')).toBeNull());
      expect(screen.getByText(/removed|deleted/i)).toBeInTheDocument();
    });
  });

  // ---- ADM-5 festivals ----------------------------------------------------
  describe('FestivalsPage (ADM-5)', () => {
    it('groups festivals by year and shows the model warning', async () => {
      renderPage(<FestivalsPage />);
      await screen.findByText('2026');
      expect(screen.getByText('2025')).toBeInTheDocument();
      expect(
        screen.getAllByText(/feeds the forecasting model/i).length,
      ).toBeGreaterThan(0);
      // a provisional 2026 row carries the Provisional badge
      expect(screen.getAllByText('Provisional').length).toBeGreaterThan(0);
    });
  });

  // ---- ADM-6 indicators ---------------------------------------------------
  describe('IndicatorsPage (ADM-6)', () => {
    it('shows the CCPI line chart + inflation-pace gauge side by side, no USD/LKR, no table', async () => {
      renderPage(<IndicatorsPage />);
      // CCPI renders directly (owner redlines: USD/LKR removed, no series picker)
      await waitFor(() => expect(document.querySelector('.adm-line')).toBeInTheDocument());
      expect(document.querySelector('.adm-select')).toBeNull();
      expect(screen.queryByText(/USD/)).toBeNull();
      // gauge (owner-decided, replaces the bar chart): needle + four zones + stats
      expect(document.querySelector('.adm-duo')).toBeInTheDocument();
      expect(document.querySelector('.adm-gauge__needle')).toBeInTheDocument();
      expect(document.querySelectorAll('[class*="adm-gauge__zone--"]').length).toBe(4);
      expect(screen.getByText('Last month')).toBeInTheDocument();
      expect(screen.getByText('12-month average')).toBeInTheDocument();
      expect(document.querySelector('.adm-bar')).toBeNull();
      // no data table (owner redline) — charts + plain-language explainer instead
      expect(document.querySelector('.adm-table')).toBeNull();
      expect(screen.getByText(/background inflation/)).toBeInTheDocument();
    });
  });

  // ---- ADM-7 news ---------------------------------------------------------
  describe('NewsPage (ADM-7)', () => {
    it('lists events chronologically with a direction glyph and adds one via the form', async () => {
      renderPage(<NewsPage />);
      await screen.findByText('Diesel price raised by Rs. 25/litre');
      const before = document.querySelectorAll('.adm-newsitem').length;
      fireEvent.click(screen.getByText(/Add event/));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(dialog.querySelector('input[type="text"]') as HTMLInputElement, {
        target: { value: 'Test market event' },
      });
      fireEvent.change(dialog.querySelector('input[type="date"]') as HTMLInputElement, {
        target: { value: '2026-07-11' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(document.querySelectorAll('.adm-newsitem').length).toBe(before + 1),
      );
      expect(screen.getByText('Test market event')).toBeInTheDocument();
    });
  });
});
