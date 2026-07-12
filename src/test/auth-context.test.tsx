import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { request } from '../api/client';

// Tests run in fixtures mode (VITE_API_MODE=fixtures) so login/register mint a
// simulated session with no network.
function Probe() {
  const { isAuthenticated, session, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="name">{session?.username ?? ''}</span>
      <span data-testid="sim">{String(session?.simulated ?? false)}</span>
      <button onClick={() => void login('farmer1', 'secret12')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AuthContext', () => {
  it('starts unauthenticated', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('auth').textContent).toBe('false');
  });

  it('login mints a (simulated) session, logout clears it', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'));
    expect(screen.getByTestId('name').textContent).toBe('farmer1');
    expect(screen.getByTestId('sim').textContent).toBe('true');

    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'));
    expect(screen.getByTestId('name').textContent).toBe('');
  });

  it('logout asks the service worker to drop cached authenticated data', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: { postMessage } },
      configurable: true,
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'));
    fireEvent.click(screen.getByText('logout'));

    expect(postMessage).toHaveBeenCalledWith({ type: 'CLEAR_DATA_CACHE' });
    // clean up the defined property
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
  });

  it('a 401 on a data route clears the session via the registered interceptor', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'));

    // The provider registered the global 401 handler on mount; a token-rejected
    // data call must clear the in-memory session.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: '',
        headers: new Headers(),
        json: async () => ({ errors: [{ message: 'x' }] }),
      })),
    );
    await act(async () => {
      await request('/api/forecast/best-crops').catch(() => undefined);
    });

    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'));
  });
});
