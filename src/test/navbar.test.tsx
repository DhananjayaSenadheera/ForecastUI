import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import i18n, { hasOwnTranslation } from '../i18n';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import AppShell from '../components/AppShell';

// Signs a (fixtures-mode) session in on mount, so the shell renders exactly as it does for
// a real signed-in farmer — the navbar identity and sign-out come from the real
// AuthContext, never a stub.
function AutoLogin({ username }: { username: string }) {
  const { login, isAuthenticated } = useAuth();
  useEffect(() => {
    if (!isAuthenticated) void login(username, 'secret12');
  }, [login, isAuthenticated, username]);
  return null;
}

function renderShell(username = 'sunil', path = '/overview') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AutoLogin username={username} />
        <Routes>
          <Route path="/login" element={<p>LOGIN PAGE</p>} />
          <Route element={<AppShell />}>
            <Route path="/overview" element={<p>OVERVIEW</p>} />
            <Route path="/prices" element={<p>PRICES</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('TopNavbar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders a labelled banner landmark on farmer pages, distinct from the tab nav', async () => {
    renderShell();
    const banner = await screen.findByRole('banner', { name: 'App header' });
    expect(banner).toBeInTheDocument();
    expect(within(banner).getByText('AgriForecast')).toBeInTheDocument();
    // The tab navigation is untouched, including its landmark name: it stays on the
    // si/ta-translated nav.overview until nav.mainLabel is translated too (see the nav._note
    // in en.json). The banner's name must still be distinct from it.
    const navs = screen.getAllByRole('navigation', { name: 'Overview' });
    expect(navs.length).toBeGreaterThan(0);
    expect(within(navs[0]).getAllByRole('link').length).toBe(4);
    expect(banner).not.toHaveAccessibleName('Overview');
  });

  it('every string the navbar renders in Sinhala is really Sinhala, not an English fallback', async () => {
    // Guards the S1 regression class: a landmark/label that exists only in en makes a
    // Sinhala farmer hear English. The three new nav.* keys are screen-reader labels the
    // owner still owes; the VISIBLE identity strings must already be translated.
    for (const key of ['auth.loggedInAs', 'auth.logout', 'auth.demoMode', 'nav.overview']) {
      expect(hasOwnTranslation(key, 'si')).toBe(true);
      expect(hasOwnTranslation(key, 'ta')).toBe(true);
    }
  });

  it('shows the signed-in username in the navbar', async () => {
    renderShell('sunil');
    const banner = await screen.findByRole('banner');
    await waitFor(() => expect(within(banner).getByText('sunil')).toBeInTheDocument());
    expect(within(banner).getByText('Signed in')).toBeInTheDocument();
  });

  it('exposes exactly one control named "Sign out", inside the navbar', async () => {
    renderShell();
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Sign out' })).toHaveLength(1));
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('sign-out runs the existing flow: clears the session and replaces the route with /login', async () => {
    renderShell();
    const signOut = await screen.findByRole('button', { name: 'Sign out' });
    fireEvent.click(signOut);

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    // Session gone -> the shell (and its navbar identity) is no longer rendered.
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('sign-out is keyboard reachable and fires on Enter', async () => {
    renderShell();
    const signOut = await screen.findByRole('button', { name: 'Sign out' });
    signOut.focus();
    expect(signOut).toHaveFocus();
    fireEvent.keyDown(signOut, { key: 'Enter' });
    fireEvent.click(signOut); // jsdom does not synthesise the click a real Enter would
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('the mobile account trigger names the account and toggles aria-expanded', async () => {
    renderShell('sunil');
    const trigger = await screen.findByRole('button', { name: 'Account: sunil' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'acct-panel');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).toHaveFocus();
  });

  it('closes the account popover when the route changes', async () => {
    renderShell('sunil');
    const trigger = await screen.findByRole('button', { name: 'Account: sunil' });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getAllByRole('link', { name: /Prices/ })[0]);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  });

  it('renders no identity or sign-out when there is no session', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <AppShell />
      </MemoryRouter>,
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Account:/ })).not.toBeInTheDocument();
  });

  it('keeps the four tab destinations and the "My crops" entry point', async () => {
    renderShell();
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /My crops/ }).length).toBeGreaterThan(0),
    );
    for (const label of ['Overview', 'My harvest', 'Best crops', 'Prices']) {
      expect(screen.getAllByRole('link', { name: new RegExp(label) }).length).toBeGreaterThan(0);
    }
  });
});
