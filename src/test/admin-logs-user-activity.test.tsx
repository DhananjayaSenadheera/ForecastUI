import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import { fxUserActivity } from '../api/fixtures';
import type { UserActivityEvent, UserActivityPage } from '../api/types';
import UserActivityPageComponent from '../admin/logs/UserActivityPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/logs/user-activity']}>
      <AuthProvider>
        <UserActivityPageComponent />
      </AuthProvider>
    </MemoryRouter>,
  );
}

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
  return screen.findByRole('table', { name: 'User activity' });
}

describe('User activity tab (Logs P2.7)', () => {
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
    expect(spy).toHaveBeenNthCalledWith(1, 1, 25, undefined); // initial load: all events
    const select = screen.getByLabelText('Event') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'loginFailed' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, 'loginFailed'));
  });

  it('resets to page 1 when the filter changes after paging forward', async () => {
    const spy = vi
      .spyOn(api, 'getUserActivity')
      .mockResolvedValue(page(fxUserActivity(1, 25).items, 60)); // total>pageSize -> pager shows
    renderPage();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(2, 25, undefined));
    fireEvent.change(screen.getByLabelText('Event') as HTMLSelectElement, {
      target: { value: 'roleChanged' },
    });
    // filter change snaps the cursor back to page 1
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 25, 'roleChanged'));
  });
});
