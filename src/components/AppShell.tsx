import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ADMIN_NAV_DESTINATIONS, NAV_DESTINATIONS } from '../app/nav';
import { useAuth } from '../auth/AuthContext';
import TopNavbar from './TopNavbar';
import LanguageSwitcher from './LanguageSwitcher';
import TextSizeToggle from './TextSizeToggle';
import AudioHelpButton from './AudioHelpButton';
import StalenessBanner from './StalenessBanner';
import ErrorBoundary from './ErrorBoundary';
import MyCropsLink from './MyCropsLink';

// Dashboard shell: an app-wide top navbar (brand + identity + sign-out) over a dark teal
// sidebar on desktop and tablet; below 600px the sidebar is replaced by a bottom tab bar
// (CSS-driven) while the navbar stays. Routed pages render into <Outlet/>.
export default function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const { session } = useAuth();
  // Admin nav appears ONLY for role 'Admin' — zero visual change for farmers.
  const isAdmin = session?.role === 'Admin';
  const tabItems = isAdmin ? [...NAV_DESTINATIONS, ...ADMIN_NAV_DESTINATIONS] : NAV_DESTINATIONS;

  return (
    <div className="app">
      {/* Banner landmark — app-wide, on farmer and admin pages alike. */}
      <TopNavbar />

      <div className="shell">
        {/* Desktop / tablet sidebar */}
        <aside className="sidebar">
          {/* HOLD: this should be nav.mainLabel ("Main menu") — a landmark must not share
              its name with one of its own destinations. It stays on nav.overview until si+ta
              carry mainLabel, because that key is English-only and swapping now would make
              Sinhala/Tamil screen-reader users hear an English landmark. Flip both this and
              the tab bar below together. See the `_note` in nav.* (en.json). */}
          <nav className="sidebar__nav" aria-label={t('nav.overview')}>
            {NAV_DESTINATIONS.map((d) => (
              <NavLink
                key={d.to}
                to={d.to}
                className={({ isActive }) => `navitem${isActive ? ' is-active' : ''}`}
              >
                <span className="navitem__icon" aria-hidden="true">
                  {d.icon}
                </span>
                <span className="wrap-label">{t(d.labelKey)}</span>
                {d.soon && <span className="navitem__soon">{t('nav.soon')}</span>}
              </NavLink>
            ))}

            {isAdmin && (
              <>
                <p className="sidebar__group" aria-hidden="true">
                  {t('nav.admin.group')}
                </p>
                {ADMIN_NAV_DESTINATIONS.map((d) => (
                  <NavLink
                    key={d.to}
                    to={d.to}
                    className={({ isActive }) => `navitem${isActive ? ' is-active' : ''}`}
                  >
                    <span className="navitem__icon" aria-hidden="true">
                      {d.icon}
                    </span>
                    <span className="wrap-label">{t(d.labelKey)}</span>
                  </NavLink>
                ))}
              </>
            )}
          </nav>

          <div className="sidebar__foot">
            <MyCropsLink variant="sidebar" />
            <AudioHelpButton />
            <div className="sidebar__prefs">
              <LanguageSwitcher />
              <TextSizeToggle />
            </div>
          </div>
        </aside>

        {/* Main column: pages render here */}
        <main className="main">
          {/* Honest "showing saved data" notice when the SW served an offline cache. */}
          <StalenessBanner />
          {/* Route-level boundary: a crashed page shows a localized fallback while the
              shell/nav stay usable; the pathname resetKey clears it on navigation. */}
          <ErrorBoundary variant="panel" resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Mobile bottom tab bar — same landmark as the sidebar nav at another breakpoint,
            so it carries the same (held) label. */}
        <nav className="tabbar" aria-label={t('nav.overview')}>
          {tabItems.map((d) => (
            <NavLink
              key={d.to}
              to={d.to}
              className={({ isActive }) => `tabbar__item${isActive ? ' is-active' : ''}`}
            >
              <span className="tabbar__icon" aria-hidden="true">
                {d.icon}
              </span>
              <span className="wrap-label">{t(d.labelKey)}</span>
              {d.soon && <span className="tabbar__soon">{t('nav.soon')}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
