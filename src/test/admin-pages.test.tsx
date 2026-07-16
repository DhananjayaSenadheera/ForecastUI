import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import type { PolicyFlag } from '../api/types';
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

    // ---- API-13 Edit / Delete / trainingDataWarning banner ----------------
    const FUEL = 'Monthly fuel price formula (CPC pricing formula)';

    it('opens a prefilled edit dialog and saves the edited flag (no banner when warning is null)', async () => {
      const spy = vi
        .spyOn(api, 'updatePolicyFlag')
        .mockResolvedValue({ id: 'x', trainingDataWarning: null });
      renderPage(<PolicyFlagsPage />);
      const row = (await screen.findByText(FUEL)).closest('tr')!;
      fireEvent.click(within(row).getByText('Edit'));
      const dialog = screen.getByRole('dialog');
      // prefilled: the first text input is the Title, seeded from the row
      const title = dialog.querySelector('input[type="text"]') as HTMLInputElement;
      expect(title.value).toBe(FUEL);
      fireEvent.change(title, { target: { value: 'Updated fuel price formula' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(spy).toHaveBeenCalled());
      const dto = spy.mock.calls[0][0];
      expect(dto.title).toBe('Updated fuel price formula');
      expect(dto.source).toBeTruthy(); // required citation preserved through the form
      expect(await screen.findByText('Policy flag updated.')).toBeInTheDocument();
      // trainingDataWarning was null -> no amber banner
      expect(screen.queryByText(/This touched training data/)).toBeNull();
    });

    it('shows a dismissible amber banner (not an error) when a mutation returns trainingDataWarning', async () => {
      vi.spyOn(api, 'updatePolicyFlag').mockResolvedValue({
        id: 'x',
        trainingDataWarning: 'past window touched',
      });
      renderPage(<PolicyFlagsPage />);
      const row = (await screen.findByText(FUEL)).closest('tr')!;
      fireEvent.click(within(row).getByText('Edit'));
      const dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
      // banner appears as a status note (mutation succeeded) — never role=alert
      const banner = (await screen.findByText(/This touched training data/)).closest('.adm-warn')!;
      expect(banner).toBeInTheDocument();
      expect(banner.getAttribute('role')).toBe('status');
      // and the success flash is still shown (the edit succeeded)
      expect(screen.getByText('Policy flag updated.')).toBeInTheDocument();
      // dismissible
      fireEvent.click(screen.getByLabelText('Dismiss'));
      await waitFor(() => expect(screen.queryByText(/This touched training data/)).toBeNull());
    });

    it('deletes a flag through the confirm dialog and refetches the register', async () => {
      const mk = (id: string, title: string): PolicyFlag => ({
        id,
        policyType: 6,
        title,
        description: null,
        effectiveFrom: '2022-09-01T00:00:00',
        effectiveTo: null,
        direction: 0,
        source: 'Gov',
        referenceUrl: null,
        createdAtUtc: '2026-07-01T00:00:00Z',
      });
      const fuel = mk('pf-fuel', FUEL);
      const other = mk('pf-other', 'Some other flag');
      vi.spyOn(api, 'getPolicyFlags')
        .mockResolvedValueOnce([fuel, other]) // initial load
        .mockResolvedValue([other]); // post-delete refetch
      const delSpy = vi
        .spyOn(api, 'deletePolicyFlag')
        .mockResolvedValue({ id: 'pf-fuel', trainingDataWarning: null });
      renderPage(<PolicyFlagsPage />);
      const row = (await screen.findByText(FUEL)).closest('tr')!;
      fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog.querySelector('.adm-btn--danger') as HTMLButtonElement);
      await waitFor(() => expect(delSpy).toHaveBeenCalledWith('pf-fuel'));
      await waitFor(() => expect(screen.queryByText(FUEL)).toBeNull());
      expect(screen.getByText('Some other flag')).toBeInTheDocument();
      expect(screen.getByText(/deleted/i)).toBeInTheDocument();
    });

    it('surfaces a server guard message verbatim when a delete is rejected', async () => {
      const msg = 'Policy flag does not exist.';
      vi.spyOn(api, 'deletePolicyFlag').mockRejectedValueOnce(new ApiError(msg, 400));
      renderPage(<PolicyFlagsPage />);
      const row = (await screen.findByText(FUEL)).closest('tr')!;
      fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog.querySelector('.adm-btn--danger') as HTMLButtonElement);
      expect(await screen.findByText(msg)).toBeInTheDocument();
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

    it('surfaces the last-admin server guard message on a rejected role change', async () => {
      const msg = 'You cannot demote the last remaining admin.';
      vi.spyOn(api, 'updateUserRole').mockRejectedValueOnce(new ApiError(msg, 400));
      renderPage(<UsersPage />);
      // any page-1 row — the FE surfaces whatever 400 the server guard returns
      const row = (await screen.findByText('dilani_seneviratne', { exact: true })).closest('tr')!;
      fireEvent.click(within(row).getByText('Edit role'));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(dialog.querySelector('select') as HTMLSelectElement, {
        target: { value: 'Farmer' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      // server guard text is shown verbatim (honest constraint surfacing)
      expect(await screen.findByText(msg)).toBeInTheDocument();
    });

    it('surfaces the self-delete server guard message on a rejected delete', async () => {
      const msg = 'You cannot delete your own account.';
      vi.spyOn(api, 'deleteUser').mockRejectedValueOnce(new ApiError(msg, 400));
      renderPage(<UsersPage />);
      const row = (await screen.findByText('nimal_perera', { exact: true })).closest('tr')!;
      fireEvent.click(row.querySelector('.adm-rowbtn--danger') as HTMLButtonElement);
      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog.querySelector('.adm-btn--danger') as HTMLButtonElement);
      expect(await screen.findByText(msg)).toBeInTheDocument();
    });
  });

  // ---- ADM-5 festivals (API-10 — LIVE) ------------------------------------
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

    it('shows a dismissible amber banner (not an error) when a mutation returns trainingDataWarning', async () => {
      vi.spyOn(api, 'updateFestival').mockResolvedValue({
        id: 'x',
        trainingDataWarning: 'past date touched',
      });
      renderPage(<FestivalsPage />);
      await screen.findByText('2026');
      fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
      const dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      // banner appears as a status note (mutation succeeded) — never role=alert
      const banner = (await screen.findByText(/This touched training data/)).closest('.adm-warn')!;
      expect(banner).toBeInTheDocument();
      expect(banner.getAttribute('role')).toBe('status');
      expect(screen.getByText('Festival updated.')).toBeInTheDocument();
      // dismissible
      fireEvent.click(screen.getByLabelText('Dismiss'));
      await waitFor(() => expect(screen.queryByText(/This touched training data/)).toBeNull());
    });

    it('creates a festival with leadUpDays=0 (paired-day value is not coerced to the default)', async () => {
      const spy = vi.spyOn(api, 'createFestival').mockResolvedValue(true);
      renderPage(<FestivalsPage />);
      await screen.findByText('2026');
      fireEvent.click(screen.getByText(/Add festival/));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(dialog.querySelector('input[type="date"]') as HTMLInputElement, {
        target: { value: '2027-04-14' },
      });
      fireEvent.change(dialog.querySelector('input[type="number"]') as HTMLInputElement, {
        target: { value: '0' },
      });
      fireEvent.change(dialog.querySelector('input[type="text"]') as HTMLInputElement, {
        target: { value: 'Public holidays gazette 2027' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(spy.mock.calls[0][0].leadUpDays).toBe(0);
      expect(spy.mock.calls[0][0].source).toBe('Public holidays gazette 2027');
      expect(await screen.findByText('Festival added.')).toBeInTheDocument();
    });

    it('surfaces a server guard message verbatim when a delete is rejected', async () => {
      const msg = 'Festival does not exist.';
      vi.spyOn(api, 'deleteFestival').mockRejectedValueOnce(new ApiError(msg, 400));
      renderPage(<FestivalsPage />);
      await screen.findByText('2026');
      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog.querySelector('.adm-btn--danger') as HTMLButtonElement);
      expect(await screen.findByText(msg)).toBeInTheDocument();
    });
  });

  // ---- ADM-6 indicators (API-11 — LIVE) -----------------------------------
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

    it('gauge reads the ready-made YoY series directly (latest 8.3%, elevated) — not derived MoM', async () => {
      renderPage(<IndicatorsPage />);
      // fixture YoY latest is 8.3% (in the 6–11 "elevated" band) — a MoM-of-index
      // gauge would show a small ~0.x% value, so this pins the series switch.
      await screen.findByLabelText(/8\.3% per year/);
      expect(document.querySelector('.adm-gauge__value')?.textContent).toBe('8.3%');
      // zone label reads "per year · elevated" (not "per month")
      expect(document.querySelector('.adm-gauge__zonelabel')?.textContent).toContain('per year');
      expect(document.querySelector('.adm-gauge__zonelabel')?.textContent).toContain('elevated');
    });

    it('surfaces a revision note when a referenceDate has multiple vintages (does not silently drop them)', async () => {
      renderPage(<IndicatorsPage />);
      // The YoY fixture ships two vintages of the latest month (provisional 8.1 -> revised 8.3).
      await screen.findByText(/were later revised/);
    });

    it('the dual-date (vintage) explainer is dismissible', async () => {
      renderPage(<IndicatorsPage />);
      const note = await screen.findByText(/Each point shows two dates/);
      const dismiss = within(note.closest('p') as HTMLElement).getByRole('button');
      fireEvent.click(dismiss);
      await waitFor(() => expect(screen.queryByText(/Each point shows two dates/)).toBeNull());
    });

    it('renders an honest empty state (not an error) when the catalog lists no macro series', async () => {
      vi.spyOn(api, 'getIndicatorCatalog').mockResolvedValueOnce([]);
      renderPage(<IndicatorsPage />);
      await screen.findByText('No data for this series yet.');
      expect(document.querySelector('.adm-line')).toBeNull();
      expect(document.querySelector('.adm-gauge__needle')).toBeNull();
      expect(screen.queryByText('Could not load')).toBeNull();
    });

    it('shows the error state with retry when the catalog fetch fails', async () => {
      vi.spyOn(api, 'getIndicatorCatalog').mockRejectedValueOnce(new ApiError('boom', 500));
      renderPage(<IndicatorsPage />);
      await screen.findByText('Could not load');
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
