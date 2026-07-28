import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * The one sign-out flow in the app. Clears the in-memory session (which also drops the
 * service-worker data cache and fires the best-effort /api/auth/logout), then replaces the
 * history entry with /login so Back cannot return to a signed-in screen.
 *
 * Every surface that offers "Sign out" MUST call this hook instead of re-implementing the
 * two steps, so the order (clear first, navigate second) can never drift apart.
 */
export function useSignOut(): () => void {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);
}
