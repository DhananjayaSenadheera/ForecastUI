// Route guard for /admin: hold while the session is still loading, redirect to /login
// when signed out, and show a plain "no access" page (never a redirect) when a
// signed-in non-Admin lands here.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

export default function RequireAdmin() {
  const { session, isAuthenticated, sessionExpired, booting } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

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

  if (session?.role !== 'Admin') {
    return (
      <section className="panel adm-noaccess" role="alert">
        <p className="adm-noaccess__glyph" aria-hidden="true">
          🔒
        </p>
        <h1 className="adm-noaccess__title">{t('admin.noAccess.title')}</h1>
        <p className="adm-noaccess__body">{t('admin.noAccess.body')}</p>
        <Link className="btn-ghost adm-noaccess__back" to="/overview">
          ← {t('common.backHome')}
        </Link>
      </section>
    );
  }

  return <Outlet />;
}
