// Route guard (FE-17). Data routes require a session in BOTH live and fixtures
// mode — the difference is only that fixtures-mode login always succeeds. When
// unauthenticated, redirect to /login and remember where the farmer was headed
// (location.state.from) so login can return them there. If the redirect was
// caused by a token rejection mid-session, pass reason:"expired" for a friendlier
// message.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';

export default function RequireAuth() {
  const { isAuthenticated, sessionExpired, booting } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  // FE-21: while the boot-time silent refresh is in flight, hold a subtle shell
  // instead of bouncing to /login — otherwise a reload of a valid session would
  // flash the login page before refresh resolves.
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
