// Route guard (FE-17). Data routes require a session in BOTH live and fixtures
// mode — the difference is only that fixtures-mode login always succeeds. When
// unauthenticated, redirect to /login and remember where the farmer was headed
// (location.state.from) so login can return them there. If the redirect was
// caused by a token rejection mid-session, pass reason:"expired" for a friendlier
// message.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RequireAuth() {
  const { isAuthenticated, sessionExpired } = useAuth();
  const location = useLocation();

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
