// Route guard. Data routes need a session in both live and fixtures mode; in fixtures mode
// login always succeeds. When unauthenticated, redirect to /login remembering where the
// farmer was headed (location.state.from), with reason:"expired" when a mid-session token
// rejection caused it.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';

export default function RequireAuth() {
  const { isAuthenticated, sessionExpired, booting } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  // While the boot-time silent refresh is in flight, hold a subtle shell instead of
  // bouncing — otherwise reloading a valid session flashes the login page.
  if (booting) {
    return (
      <div className="boot" role="status" aria-live="polite">
        <span className="boot__spinner" aria-hidden="true" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location, reason: sessionExpired ? 'expired' : undefined }}
      />
    );
  }
  return <Outlet />;
}
