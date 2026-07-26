import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import { fxUserActivity, fxUserActivityAll } from '../api/fixtures';
import type { UserActivityEvent, UserActivityPage } from '../api/types';
import UserActivityPageComponent from '../admin/logs/UserActivityPage';

/** Surfaces the live query string so the ?group= round-trip is assertable. */
function SearchProbe() {
  return <span data-testid="search">{useLocation().search}</span>;
}

function renderPage(entry = '/admin/logs/user-activity') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <UserActivityPageComponent />
        <SearchProbe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const SIGN_IN_TYPES = ['loginSucceeded', 'loginFailed'];
const USER_MGMT_TYPES = ['userRegistered', 'roleChanged', 'userDeleted'];
const CONTENT_TYPES = [
  'policyFlagChanged',
  'festivalChanged',
  'newsEventChanged',
  'cropChanged',
  'marketChanged',
];

const groupTablist = () => screen.getByRole('tablist', { name: 'Activity type' });
const groupTab = (name: string) => within(groupTablist()).getByRole('tab', { name });

const PENDING = () => new Promise<never>(() => {}); // never resolves — holds loading

function page(items: UserActivityEvent[], total = items.length): UserActivityPage {
  return { items, page: 1, pageSize: 25, total };
}

const LONG_GUID = 'a1111111-1111-4111-8111-111111111111';

const FAILED_ROW: UserActivityEvent = {
  occurredUtc: '2026-07-21T08:42:11Z',
  eventType: 'loginFailed',
  actorUserId: null,
  targetUserId: null,
  usernameAttempted: 'admin',
  details: 'Invalid username or password.',
};

const ROLE_ROW: UserActivityEvent = {
  occurredUtc: '2026-07-21T07:30:04Z',
  eventType: 'roleChanged',
  actorUserId: LONG_GUID,
  targetUserId: LONG_GUID,
  usernameAttempted: null,
  details: 'Role changed Farmer → Admin.',
};

async function table(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: 'System log' });
}

describe('System log tab (Logs P2.7)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- four async states ---------------------------------------------------
  it('loading: shows a skeleton while events are pending', () => {
    vi.spyOn(api, 'getUserActivity').mockImplementation(PENDING);
    renderPage();
    expect(document.querySelector('.adm-skeleton')).not.toBeNull();
  });

  it('success: renders an event badge per row', async () => {
    vi.spyOn(api, 'getUserActivity').mockResolvedValue(fxUserActivity(1, 25));
    renderPage();
    const t = await table();
    expect(within(t).getAllByText('Sign-in').length).toBeGreaterThan(0);
    expect(within(t).getAllByText('Failed sign-in').length).toBeGreaterThan(0);
  });

  it('empty: shows the empty state when there is no activity', async () => {
    vi.spyOn(api, 'getUserActivity').mockResolvedValue(page([], 0));
    renderPage();
    expect(await screen.findByText('No activity')).toBeInTheDocument();
  });

  it('error: shows the error state with a retry when the load fails', async () => {
    const spy = vi
      .spyOn(api, 'getUserActivity')
      .mockRejectedValueOnce(new ApiError('boom', 500))
      .mockResolvedValueOnce(fxUserActivity(1, 25));
    renderPage();
    expect(await screen.findByText('Could not load')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(await table()).toBeInTheDocument();
  });

  // ---- loginFailed: quoted, unverified attempt ----------------------------
  it('renders the loginFailed username quoted and flagged as an unverified attempt', async () => {
    vi.spyOn(api, 'getUserActivity').mockResolvedValue(page([FAILED_ROW]));
    renderPage();
    const t = await table();
    // quoted username + an explicit "unverified attempt" flag beside it
    expect(within(t).getByText('“admin”')).toBeInTheDocument();
    expect(within(t).getByText('(unverified attempt)')).toBeInTheDocument();
  });

  // ---- GUID truncation with full value in the title -----------------------
  it('truncates GUIDs to the first 8 chars with the full value in the title', async () => {
    vi.spyOn(api, 'getUserActivity').mockResolvedValue(page([ROLE_ROW]));
    renderPage();
    const t = await table();
    const truncated = within(t).getAllByText('a1111111…');
    expect(truncated.length).toBe(2); // actor + target
    expect(truncated[0]).toHaveAttribute('title', LONG_GUID);
  });

  // ---- type filter drives the query param + resets to page 1 --------------
  it('passes the chosen event type to the API and resets to page 1', async () => {
    const spy = vi.spyOn(api, 'getUserActivity').mockResolvedValue(fxUserActivity(1, 25));
    renderPage();
    await table();
    expect(spy).toHaveBeenNthCalledWith(1, 1, 25, {}); // initial load: no filter at all
    const select = screen.getByLabelText('Event') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'loginFailed' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, { type: 'loginFailed' }));
  });

  it('resets to page 1 when the filter changes after paging forward', async () => {
    const spy = vi
      .spyOn(api, 'getUserActivity')
      .mockResolvedValue(page(fxUserActivity(1, 25).items, 60)); // total>pageSize -> pager shows
    renderPage();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(2, 25, {}));
    fireEvent.change(screen.getByLabelText('Event') as HTMLSelectElement, {
      target: { value: 'roleChanged' },
    });
    // filter change snaps the cursor back to page 1
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, { type: 'roleChanged' }));
  });

  // ---- forward compatibility ----------------------------------------------
  // The server may log an event type this build has never heard of. A log that
  // silently drops rows is not a log: render it verbatim, in a neutral badge.
  it('renders an UNKNOWN event type verbatim in a neutral badge', async () => {
    vi.spyOn(api, 'getUserActivity').mockResolvedValue(
      page([{ ...ROLE_ROW, eventType: 'somethingNobodyShippedYet' }]),
    );
    renderPage();
    const t = await table();
    const badge = within(t).getByText('somethingNobodyShippedYet');
    expect(badge).toHaveClass('adm-status--neutral');
  });

  it('labels each of the five content-change event types', async () => {
    vi.spyOn(api, 'getUserActivity').mockResolvedValue(
      page(CONTENT_TYPES.map((eventType) => ({ ...ROLE_ROW, eventType }))),
    );
    renderPage();
    const t = await table();
    for (const label of [
      'Policy flag changed',
      'Festival changed',
      'News event changed',
      'Crop changed',
      'Market changed',
    ]) {
      expect(within(t).getByText(label)).toBeInTheDocument();
    }
  });
});

// The fixtures MUST mirror the wire semantics, or fixtures mode demos a feature that
// behaves differently against the live API.
describe('System log fixtures — filter semantics mirror the server', () => {
  it('filters on types= as an OR-set, newest first', () => {
    const res = fxUserActivity(1, 25, { types: CONTENT_TYPES });
    expect(res.items.length).toBeGreaterThanOrEqual(5);
    expect(res.total).toBe(res.items.length);
    expect(res.items.every((e) => CONTENT_TYPES.includes(e.eventType))).toBe(true);
    const stamps = res.items.map((e) => e.occurredUtc);
    expect([...stamps].sort().reverse()).toEqual(stamps); // OccurredUtc DESC
  });

  it('lets the narrower type= win over types=', () => {
    const res = fxUserActivity(1, 25, { type: 'loginFailed', types: CONTENT_TYPES });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.every((e) => e.eventType === 'loginFailed')).toBe(true);
  });

  it('returns everything when neither filter is given', () => {
    expect(fxUserActivity(1, 100).total).toBe(fxUserActivityAll.length);
  });
});

// ===========================================================================
// System log — group sub-tabs (All / Sign-ins / User management / Content changes).
// A LOCAL-STATE tab strip inside the page, mirrored into ?group= so it deep-links.
// ===========================================================================
describe('System log — group sub-tabs', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.spyOn(api, 'getUserActivity').mockResolvedValue(fxUserActivity(1, 25));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- ARIA structure ------------------------------------------------------
  it('is a tablist of four tabs with All selected by default', async () => {
    renderPage();
    await table();
    const tabs = within(groupTablist()).getAllByRole('tab');
    expect(tabs.map((el) => el.textContent)).toEqual([
      'All',
      'Sign-ins',
      'User management',
      'Content changes',
    ]);
    expect(groupTab('All')).toHaveAttribute('aria-selected', 'true');
    expect(groupTab('Sign-ins')).toHaveAttribute('aria-selected', 'false');
  });

  it('wires each tab to the group panel and labels the panel by the active tab', async () => {
    renderPage();
    await table();
    const active = groupTab('All');
    const panel = screen.getByRole('tabpanel');
    expect(active).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', active.id);
    // The sub-tab ids must never collide with the hub's route-segment tab ids
    // (logs-tab-user-activity), since both strips share one document.
    expect(active.id).toBe('syslog-group-tab-all');
    expect(within(panel).getByRole('table')).toBeInTheDocument();
  });

  it('uses a roving tabindex — only the selected tab is in the Tab order', async () => {
    renderPage();
    await table();
    expect(groupTab('All')).toHaveAttribute('tabindex', '0');
    expect(groupTab('Sign-ins')).toHaveAttribute('tabindex', '-1');
    expect(groupTab('Content changes')).toHaveAttribute('tabindex', '-1');
  });

  // ---- keyboard: MANUAL activation ----------------------------------------
  it('arrow keys move focus (and wrap) without changing the selection', async () => {
    renderPage();
    await table();
    const all = groupTab('All');
    all.focus();
    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(groupTab('Sign-ins'));
    // MANUAL activation: focus moved, but the selected group did not follow.
    expect(groupTab('All')).toHaveAttribute('aria-selected', 'true');
    expect(groupTab('Sign-ins')).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(groupTab('All'));
    // Left from the first tab wraps to the last.
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(groupTab('Content changes'));
  });

  it('Home/End jump to the first and last tab', async () => {
    renderPage();
    await table();
    groupTab('All').focus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement).toBe(groupTab('Content changes'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(document.activeElement).toBe(groupTab('All'));
  });

  // ---- group -> API types= -------------------------------------------------
  it('sends the group wire strings as types= and reflects the group in the URL', async () => {
    const spy = vi.mocked(api.getUserActivity);
    renderPage();
    await table();
    expect(spy).toHaveBeenNthCalledWith(1, 1, 25, {}); // All = no filter at all

    fireEvent.click(groupTab('Sign-ins'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, { types: SIGN_IN_TYPES }));
    expect(groupTab('Sign-ins')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('search')).toHaveTextContent('?group=sign-ins');

    fireEvent.click(groupTab('User management'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, { types: USER_MGMT_TYPES }));
    expect(screen.getByTestId('search')).toHaveTextContent('?group=user-management');

    fireEvent.click(groupTab('Content changes'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, { types: CONTENT_TYPES }));
    expect(screen.getByTestId('search')).toHaveTextContent('?group=content-changes');
  });

  it('drops ?group= again when returning to All (no ?group=all noise)', async () => {
    renderPage('/admin/logs/user-activity?group=sign-ins');
    await table();
    fireEvent.click(groupTab('All'));
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(''));
    expect(screen.getByTestId('search').textContent).toBe('');
  });

  // ---- deep link -----------------------------------------------------------
  it('deep-links: ?group=content-changes selects that group on FIRST load', async () => {
    const spy = vi.mocked(api.getUserActivity);
    renderPage('/admin/logs/user-activity?group=content-changes');
    await table();
    // The very first request already carries the group — no all-events flash.
    expect(spy).toHaveBeenNthCalledWith(1, 1, 25, { types: CONTENT_TYPES });
    expect(groupTab('Content changes')).toHaveAttribute('aria-selected', 'true');
  });

  it('degrades an unknown ?group= to All rather than showing nothing', async () => {
    const spy = vi.mocked(api.getUserActivity);
    renderPage('/admin/logs/user-activity?group=not-a-group');
    await table();
    expect(spy).toHaveBeenNthCalledWith(1, 1, 25, {});
    expect(groupTab('All')).toHaveAttribute('aria-selected', 'true');
  });

  // ---- the single-event dropdown is SCOPED to the group --------------------
  it('scopes the event dropdown to the active group', async () => {
    renderPage();
    await table();
    const select = () => screen.getByLabelText('Event') as HTMLSelectElement;
    // All: every known event type is offered (+ the "All events" option).
    expect(select().options).toHaveLength(11);

    fireEvent.click(groupTab('Sign-ins'));
    await waitFor(() =>
      expect([...select().options].map((o) => o.value)).toEqual([
        '',
        'loginSucceeded',
        'loginFailed',
      ]),
    );

    fireEvent.click(groupTab('Content changes'));
    await waitFor(() =>
      expect([...select().options].map((o) => o.value)).toEqual(['', ...CONTENT_TYPES]),
    );
  });

  it('clears an event selection the new group cannot show', async () => {
    const spy = vi.mocked(api.getUserActivity);
    renderPage();
    await table();
    const select = () => screen.getByLabelText('Event') as HTMLSelectElement;
    fireEvent.change(select(), { target: { value: 'loginFailed' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, { type: 'loginFailed' }));

    fireEvent.click(groupTab('Content changes'));
    // The stale loginFailed is dropped — it could only ever return zero rows here.
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(1, 25, { types: CONTENT_TYPES }));
    expect(select().value).toBe('');
  });

  it('keeps a selection the new group CAN show', async () => {
    const spy = vi.mocked(api.getUserActivity);
    renderPage();
    await table();
    fireEvent.change(screen.getByLabelText('Event') as HTMLSelectElement, {
      target: { value: 'loginFailed' },
    });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, { type: 'loginFailed' }));
    fireEvent.click(groupTab('Sign-ins'));
    await waitFor(() => expect(groupTab('Sign-ins')).toHaveAttribute('aria-selected', 'true'));
    // Still the narrower single-type request — the group did not widen it back.
    expect(spy).toHaveBeenLastCalledWith(1, 25, { type: 'loginFailed' });
    expect((screen.getByLabelText('Event') as HTMLSelectElement).value).toBe('loginFailed');
  });

  // ---- paging cursor -------------------------------------------------------
  it('resets to page 1 when the group changes after paging forward', async () => {
    const spy = vi
      .mocked(api.getUserActivity)
      .mockResolvedValue(page(fxUserActivity(1, 25).items, 60)); // total>pageSize -> pager shows
    renderPage();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(2, 25, {}));
    fireEvent.click(groupTab('User management'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, { types: USER_MGMT_TYPES }));
  });

  // ---- honest empty state --------------------------------------------------
  it('distinguishes "nothing recorded" from "nothing matches this filter"', async () => {
    vi.mocked(api.getUserActivity).mockResolvedValue(page([], 0));
    renderPage();
    expect(await screen.findByText('No activity has been recorded yet.')).toBeInTheDocument();
    fireEvent.click(groupTab('Content changes'));
    expect(
      await screen.findByText(/Nothing of this kind has been recorded yet/),
    ).toBeInTheDocument();
  });
});
