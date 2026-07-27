import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

// Logged-in identity + logout, in the sidebar footer on desktop and the mobile top bar.
// Logout clears the in-memory session and the service-worker data cache, then routes to
// /login. Renders nothing when unauthenticated, so it is inert on the auth pages.
// It also carries the "My crops" entry point: the portfolio is a personal, signed-in
// surface and has no nav tab (the 4-tab IA is locked), so it belongs next to the identity
// rather than beside the four public destinations.
export default function SessionMenu({ variant }: { variant: 'sidebar' | 'mobile' }) {
  const { t } = useTranslation();
  const { session, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated || !session) return null;

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`session session--${variant}`}>
      <span className="session__who">
        <span className="session__label">{t('auth.loggedInAs')}</span>
        <span className="session__name wrap-label" title={session.username}>
          {session.username}
          {session.simulated && <span className="session__demo">{t('auth.demoMode')}</span>}
        </span>
      </span>
      <Link className="session__mycrops" to="/portfolio">
        <span aria-hidden="true">🧺</span>
        <span className="wrap-label">{t('nav.portfolio')}</span>
      </Link>
      <button
        type="button"
        className="session__logout"
        onClick={onLogout}
        aria-label={t('auth.logout')}
      >
        <span aria-hidden="true">⏻</span>
        <span className="session__logouttext wrap-label">{t('auth.logout')}</span>
      </button>
    </div>
  );
}
