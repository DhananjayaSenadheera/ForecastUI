import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV_DESTINATIONS } from '../app/nav';
import LanguageSwitcher from './LanguageSwitcher';
import TextSizeToggle from './TextSizeToggle';
import AudioHelpButton from './AudioHelpButton';
import StalenessBanner from './StalenessBanner';
import ErrorBoundary from './ErrorBoundary';

// Dashboard shell (normative ref: dashboard-style-samples-v1).
// Desktop/tablet: dark teal sidebar (nav + footer audio/lang). Mobile: sidebar is
// replaced by a top brand bar + a bottom tab bar (CSS-driven at <600px).
// The shell is a layout wrapper; routed pages render into <Outlet/>.
export default function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <div className="shell">
      {/* ---- desktop / tablet sidebar ---- */}
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__leaf" aria-hidden="true">
            🌱
          </span>
          {t('app.name')}
        </div>

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
        </nav>

        <div className="sidebar__foot">
          <AudioHelpButton />
          <div className="sidebar__prefs">
            <LanguageSwitcher />
            <TextSizeToggle />
          </div>
        </div>
      </aside>

      {/* ---- mobile top bar (brand + lang + audio; sidebar is hidden < 600px) ---- */}
      <div className="mobilebar">
        <span className="sidebar__leaf" aria-hidden="true">
          🌱
        </span>
        <strong style={{ fontSize: 16 }}>{t('app.name')}</strong>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <LanguageSwitcher />
          <TextSizeToggle />
        </div>
      </div>

      {/* ---- main column: pages render here ---- */}
      <main className="main">
        {/* Honest "showing saved data" notice when the SW served an offline cache. */}
        <StalenessBanner />
        {/* Route-level boundary: a crashed page shows a localized fallback while the
            shell/nav stay usable; the pathname resetKey clears it on navigation. */}
        <ErrorBoundary variant="panel" resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      {/* ---- mobile bottom tab bar ---- */}
      <nav className="tabbar" aria-label={t('nav.overview')}>
        {NAV_DESTINATIONS.map((d) => (
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
  );
}
