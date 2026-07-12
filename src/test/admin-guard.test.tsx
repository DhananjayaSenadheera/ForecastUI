import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import i18n from '../i18n';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import RequireAdmin from '../admin/RequireAdmin';
import AppShell from '../components/AppShell';

// Login stub: logs in with a chosen username (fixtures mode -> `admin` becomes role
// Admin, anyone else Farmer) then returns to the intended route (state.from).
function LoginStub() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const go = async (username: string) => {
    await login(username, 'secret12');
    navigate(from ?? '/', { replace: true });
  };
  return (
    <div>
      <span>LOGIN</span>
      <span data-testid="from">{from ?? ''}</span>
      <button onClick={() => go('admin')}>login-admin</button>
      <button onClick={() => go('farmer1')}>login-farmer</button>
    </div>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginStub />} />
          <Route path="/admin" element={<RequireAdmin />}>
            <Route index element={<div>ADMIN AREA</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequireAdmin guard (ADM-1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    // ensure no simulated session leaks between tests
    try {
      sessionStorage.clear();
    } catch {
      /* noop */
    }
  });

  it('redirects an unauthenticated visitor to /login and remembers the destination', () => {
    renderAt('/admin');
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN AREA')).toBeNull();
    expect(screen.getByTestId('from').textContent).toBe('/admin');
  });

  it('blocks an authenticated FARMER with an honest no-access state (no redirect loop)', async () => {
    renderAt('/admin');
    fireEvent.click(screen.getByText('login-farmer'));
    await waitFor(() =>
      expect(screen.getByText("You don't have access to this area")).toBeInTheDocument(),
    );
    expect(screen.queryByText('ADMIN AREA')).toBeNull();
    // still on /admin (no bounce back to /login)
    expect(screen.queryByText('LOGIN')).toBeNull();
  });

  it('lets an authenticated ADMIN through to the admin area', async () => {
    renderAt('/admin');
    fireEvent.click(screen.getByText('login-admin'));
    await waitFor(() => expect(screen.getByText('ADMIN AREA')).toBeInTheDocument());
  });

  it('shows the admin nav in the shell once signed in as Admin', async () => {
    function AutoAdminShell() {
      const { login } = useAuth();
      useEffect(() => {
        void login('admin', 'secret12');
      }, [login]);
      return <AppShell />;
    }
    render(
      <MemoryRouter initialEntries={['/admin/policy-flags']}>
        <AuthProvider>
          <AutoAdminShell />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText('Policy flags').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Markets').length).toBeGreaterThan(0);
  });
});
