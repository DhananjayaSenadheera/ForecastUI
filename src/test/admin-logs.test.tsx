import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import AppShell from '../components/AppShell';
import RequireAdmin from '../admin/RequireAdmin';
import LogsPage from '../admin/logs/LogsPage';
import LogsTabs, { type LogsTab } from '../admin/logs/LogsTabs';

// Exposes the live pathname so redirect assertions read the resolved route.
function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="pathname">{loc.pathname}</span>;
}

// Mirrors App.tsx's /admin/logs subtree (index + child + legacy alias). The ingestion
// child is stubbed so these tests exercise ROUTING, not the polled ingestion page.
function renderLogsRoutes(start: string) {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <LocationProbe />
      <Routes>
        <Route path="/admin">
          <Route path="logs" element={<LogsPage />}>
            <Route index element={<Navigate to="/admin/logs/ingestion" replace />} />
            <Route path="ingestion" element={<div>INGESTION TAB CONTENT</div>} />
          </Route>
          <Route path="ingestion" element={<Navigate to="/admin/logs/ingestion" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('LogsTabs — tab-strip a11y (Phase 1)', () => {
  const TABS: LogsTab[] = [
    { to: '/overview', labelKey: 'nav.overview' }, // "Overview"
    { to: '/prices', labelKey: 'nav.prices' }, // "Prices"
  ];

  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  function renderTabs(start = '/prices') {
    return render(
      <MemoryRouter initialEntries={[start]}>
        <LocationProbe />
        <LogsTabs tabs={TABS} ariaLabel="Logs" />
      </MemoryRouter>,
    );
  }

  it('exposes a tablist with a tab per entry (WAI-ARIA roles)', () => {
    renderTabs();
    expect(screen.getByRole('tablist', { name: 'Logs' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('marks the route-matching tab as selected (aria-selected) with roving tabindex', () => {
    renderTabs('/prices');
    const selected = screen.getByRole('tab', { selected: true });
    expect(selected).toHaveTextContent('Prices');
    expect(selected).toHaveAttribute('tabindex', '0');
    const overview = screen.getByRole('tab', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-selected', 'false');
    expect(overview).toHaveAttribute('tabindex', '-1'); // only the selected tab is tabbable
  });

  it('moves focus with Left/Right/Home/End and wraps at the ends', () => {
    renderTabs('/prices');
    const [first, second] = screen.getAllByRole('tab');
    first.focus();
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: 'ArrowRight' }); // wrap forward -> first
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' }); // wrap backward -> last
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: 'Home' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'End' });
    expect(second).toHaveFocus();
  });

  it('does NOT navigate on arrow keys (manual activation — route only changes on Enter/click)', () => {
    renderTabs('/prices');
    const [first] = screen.getAllByRole('tab');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(screen.getByTestId('pathname')).toHaveTextContent('/prices');
  });
});

describe('Logs hub routing (Phase 1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the Logs shell (H1 + tab strip) and its single ingestion tab', () => {
    renderLogsRoutes('/admin/logs/ingestion');
    expect(screen.getByRole('heading', { level: 1, name: 'Logs' })).toBeInTheDocument();
    const tablist = screen.getByRole('tablist', { name: 'Logs' });
    expect(within(tablist).getByRole('tab', { name: 'Ingestion runs', selected: true })).toBeInTheDocument();
    expect(screen.getByText('INGESTION TAB CONTENT')).toBeInTheDocument();
  });

  it('links the tab to the content region (tabpanel labelled by the selected tab)', () => {
    renderLogsRoutes('/admin/logs/ingestion');
    const tab = screen.getByRole('tab', { name: 'Ingestion runs', selected: true });
    const panel = screen.getByRole('tabpanel');
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
    expect(within(panel).getByText('INGESTION TAB CONTENT')).toBeInTheDocument();
  });

  it('redirects the index /admin/logs to /admin/logs/ingestion', async () => {
    renderLogsRoutes('/admin/logs');
    await waitFor(() =>
      expect(screen.getByTestId('pathname')).toHaveTextContent('/admin/logs/ingestion'),
    );
    expect(screen.getByText('INGESTION TAB CONTENT')).toBeInTheDocument();
  });

  it('redirects the legacy /admin/ingestion bookmark to /admin/logs/ingestion', async () => {
    renderLogsRoutes('/admin/ingestion');
    await waitFor(() =>
      expect(screen.getByTestId('pathname')).toHaveTextContent('/admin/logs/ingestion'),
    );
    expect(screen.getByText('INGESTION TAB CONTENT')).toBeInTheDocument();
  });
});

describe('Logs hub auth gate (Phase 1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    try {
      sessionStorage.clear();
    } catch {
      /* noop */
    }
  });

  // Unlike renderLogsRoutes above, this mounts the subtree UNDER RequireAdmin — the
  // same nesting App.tsx uses — so it locks the auth property for the new routes.
  // Flow mirrors admin-guard.test.tsx: the guard bounces the visitor to /login,
  // the stub logs in as a FARMER and returns to the intended route (state.from).
  function FarmerLoginStub() {
    const { login } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return (
      <button
        onClick={async () => {
          await login('farmer1', 'secret12');
          navigate(from ?? '/', { replace: true });
        }}
      >
        login-farmer
      </button>
    );
  }

  function renderGated(start: string) {
    return render(
      <MemoryRouter initialEntries={[start]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<FarmerLoginStub />} />
            <Route path="/admin" element={<RequireAdmin />}>
              <Route path="logs" element={<LogsPage />}>
                <Route index element={<Navigate to="/admin/logs/ingestion" replace />} />
                <Route path="ingestion" element={<div>INGESTION TAB CONTENT</div>} />
              </Route>
              <Route path="ingestion" element={<Navigate to="/admin/logs/ingestion" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  async function expectFarmerBlocked(start: string) {
    renderGated(start);
    fireEvent.click(await screen.findByText('login-farmer'));
    await waitFor(() =>
      expect(screen.getByText("You don't have access to this area")).toBeInTheDocument(),
    );
    expect(screen.queryByText('INGESTION TAB CONTENT')).toBeNull();
  }

  it('blocks a logged-in FARMER from /admin/logs/ingestion (no tab content rendered)', async () => {
    await expectFarmerBlocked('/admin/logs/ingestion');
  });

  it('blocks a logged-in FARMER on the legacy /admin/ingestion alias too', async () => {
    await expectFarmerBlocked('/admin/ingestion');
  });
});

describe('Logs nav entry (Phase 1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    try {
      sessionStorage.clear();
    } catch {
      /* noop */
    }
  });

  it('shows the Logs nav entry for an Admin and drops the old standalone Ingestion runs entry', async () => {
    function AutoAdminShell() {
      const { login } = useAuth();
      useEffect(() => {
        void login('admin', 'secret12');
      }, [login]);
      return <AppShell />;
    }
    render(
      <MemoryRouter initialEntries={['/admin/logs/ingestion']}>
        <AuthProvider>
          <AutoAdminShell />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText('Logs').length).toBeGreaterThan(0));
    // The former standalone nav item is gone — Ingestion runs now lives inside Logs.
    expect(screen.queryByText('Ingestion runs')).toBeNull();
  });

  it('does NOT show the Logs nav entry for a non-admin session', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <AppShell />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Logs')).toBeNull();
  });
});
