// Admin route guard (ADM-1). Wraps RequireAuth semantics AND a role check:
//   - booting (live silent-renew in flight) -> hold a subtle shell, don't bounce.
//   - not authenticated                     -> redirect to /login (existing flow),
//                                               remembering where they were headed.
//   - authenticated but role !== 'Admin'    -> honest "no access" state, NO redirect
//                                               (a farmer who lands on /admin gets a
//                                               plain explanation + a way back, never
//                                               a redirect loop).
//   - authenticated Admin                   -> render the admin section (<Outlet/>).
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
