import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  request,
  setAuthToken,
  setUnauthorizedHandler,
  setRefreshHandler,
  ApiError,
} from '../api/client';
import { logout as apiLogout } from '../api/auth';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import RequireAuth from '../auth/RequireAuth';

// Tests run in fixtures mode (VITE_API_MODE=fixtures). The client-level silent-renew
// tests drive request()/handlers directly (mode-agnostic); the boot tests exercise
// the fixtures reload marker, which is the offline stand-in for the refresh cookie.

function fakeRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  setAuthToken(null);
  setUnauthorizedHandler(null);
  setRefreshHandler(null);
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------------
// credentials:'include' — auth routes ONLY
// -----------------------------------------------------------------------------
describe('credentials:include is sent on auth routes only', () => {
  it.each(['/api/auth/refresh', '/api/auth/login', '/api/auth/logout'])(
    'sends credentials:include on %s',
    async (path) => {
      const fetchMock = vi.fn(async () => fakeRes(200, {}));
      vi.stubGlobal('fetch', fetchMock);

      await request(path, { method: 'POST' });

      const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
      expect(init.credentials).toBe('include');
    },
  );

  it('does NOT send credentials on data routes (Bearer only, no ambient cookies)', async () => {
    const fetchMock = vi.fn(async () => fakeRes(200, []));
    vi.stubGlobal('fetch', fetchMock);

    await request('/api/crops/get/all');

    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.credentials).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// 401 -> silent renew -> retry-once
// -----------------------------------------------------------------------------
describe('data-route 401 -> silent renew -> retry once', () => {
  it('renews and retries the failed request exactly once on success', async () => {
    setRefreshHandler(async () => true);
    let call = 0;
    const fetchMock = vi.fn(async () =>
      call++ === 0 ? fakeRes(401, { errors: [{ message: 'expired' }] }) : fakeRes(200, { ok: true }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await request<{ ok: boolean }>('/api/forecast/best-crops');

    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + one retry
  });

  it('falls to the signed-out path when renew fails', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setRefreshHandler(async () => false);
    vi.stubGlobal('fetch', vi.fn(async () => fakeRes(401, { errors: [{ message: 'x' }] })));

    await expect(request('/api/forecast/best-crops')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('never loops: at most one refresh+retry even if the retry also 401s', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setRefreshHandler(async () => true); // renew "succeeds" but data keeps rejecting
    const fetchMock = vi.fn(async () => fakeRes(401, { errors: [{ message: 'x' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/api/forecast/best-crops')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + single retry, no more
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does NOT attempt a refresh for a 401 on an AUTH route', async () => {
    const onRefresh = vi.fn(async () => true);
    setRefreshHandler(onRefresh);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes(401, { errors: [{ message: 'Invalid username or password.' }] })),
    );

    await expect(
      request('/api/auth/login', { method: 'POST', body: '{}' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// logout — endpoint call + local clear resilient to network failure
// -----------------------------------------------------------------------------
describe('logout endpoint + resilience', () => {
  it('POSTs /api/auth/logout with credentials (via request pipeline)', async () => {
    const fetchMock = vi.fn(async () => fakeRes(204, undefined));
    vi.stubGlobal('fetch', fetchMock);

    await request('/api/auth/logout', { method: 'POST' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });

  it('apiLogout never rejects even when the network fails', async () => {
    // fixtures apiLogout clears the marker (no network); a rejecting fetch must
    // still leave logout resolving — the local session clear does not depend on it.
    sessionStorage.setItem('fx-session', 'farmer1');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));

    await expect(apiLogout()).resolves.toBeUndefined();
    expect(sessionStorage.getItem('fx-session')).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Boot / reload — fixtures marker parity (offline stand-in for the refresh cookie)
// -----------------------------------------------------------------------------
function Probe() {
  const { isAuthenticated, session, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="name">{session?.username ?? ''}</span>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

function renderGuardedAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/prices" element={<div>PRICES</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('boot session restore (reload)', () => {
  it('restores the session on reload with NO login flash', () => {
    sessionStorage.setItem('fx-session', 'farmer1'); // marker present == "cookie valid"
    renderGuardedAt('/prices');
    // Synchronous restore -> guarded content, login page never rendered.
    expect(screen.getByText('PRICES')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN')).toBeNull();
  });

  it('redirects to /login when there is no session to restore', () => {
    renderGuardedAt('/prices'); // no marker
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('PRICES')).toBeNull();
  });

  it('logout clears the reload marker so a later reload does not restore', async () => {
    sessionStorage.setItem('fx-session', 'farmer1');
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('auth').textContent).toBe('true');

    act(() => {
      screen.getByText('logout').click();
    });
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'));
    expect(sessionStorage.getItem('fx-session')).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Full interplay through the AuthContext-registered refresh handler
// -----------------------------------------------------------------------------
describe('AuthContext wires silent-renew into the client', () => {
  it('a data-route 401 is transparently renewed+retried, session survives', async () => {
    sessionStorage.setItem('fx-session', 'farmer1'); // apiRefresh (fixtures) can renew
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('auth').textContent).toBe('true');

    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        call++ === 0 ? fakeRes(401, { errors: [{ message: 'x' }] }) : fakeRes(200, { ok: true }),
      ),
    );

    let out: unknown;
    await act(async () => {
      out = await request('/api/forecast/best-crops');
    });

    expect(out).toEqual({ ok: true });
    // Renew succeeded + retry succeeded -> the farmer stays signed in.
    expect(screen.getByTestId('auth').textContent).toBe('true');
  });
});
