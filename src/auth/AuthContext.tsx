// Holds the in-memory session (access token + the minimal identity the API returns),
// exposes login/register/logout + isAuthenticated, and wires the global 401 interceptor.
// The access token lives ONLY in this module's React state — never localStorage,
// sessionStorage or cookies. On boot (live mode) we exchange the httpOnly
// `agriforecast_refresh` cookie for a fresh access token, so a reload no longer signs the
// farmer out. Fixtures mode simulates that with a non-secret reload marker, never a token.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setAuthToken, setUnauthorizedHandler, setRefreshHandler, USE_FIXTURES } from '../api/client';
import {
  login as apiLogin,
  register as apiRegister,
  refresh as apiRefresh,
  logout as apiLogout,
  fxRestoreSession,
  fxClearMarker,
  type AuthSession,
} from '../api/auth';

interface AuthContextValue {
  session: AuthSession | null;
  isAuthenticated: boolean;
  /** true right after the token was rejected mid-session (drives the /login notice). */
  sessionExpired: boolean;
  /** true while the boot-time silent refresh is in flight (guard shows a shell, not /login). */
  booting: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearExpired: () => void;
}

// The default value keeps components that read auth from crashing when rendered outside a
// provider (unit tests): they see an unauthenticated, no-op session.
const noop = () => undefined;
const AuthContext = createContext<AuthContextValue>({
  session: null,
  isAuthenticated: false,
  sessionExpired: false,
  booting: false,
  login: async () => undefined,
  register: async () => undefined,
  logout: noop,
  clearExpired: noop,
});

/** Best-effort: tell the SW to drop cached authenticated /api responses on logout,
 *  so one farmer's saved prices/harvest can't leak to the next login. No-op when
 *  there is no controlling SW (dev, jsdom). */
function clearAuthedDataCache(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_DATA_CACHE' });
  } catch {
    /* SW unavailable — nothing was cached to leak */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Fixtures mode restores synchronously from the reload marker, so it is never "booting"
  // and the guard never flashes /login on reload. Live mode must await the refresh call.
  const [session, setSession] = useState<AuthSession | null>(() =>
    USE_FIXTURES ? fxRestoreSession() : null,
  );
  const [sessionExpired, setSessionExpired] = useState(false);
  const [booting, setBooting] = useState(!USE_FIXTURES);

  const applySession = useCallback((next: AuthSession) => {
    setAuthToken(next.token); // in-memory only
    setSession(next);
    setSessionExpired(false);
  }, []);

  // Boot-time silent renew (live only): try once to exchange the refresh cookie. On 401 or
  // a network error stay unauthenticated. Either way clear the boot state so the guard can
  // render without a login flash.
  useEffect(() => {
    if (USE_FIXTURES) return; // already restored synchronously above
    let cancelled = false;
    (async () => {
      try {
        const restored = await apiRefresh();
        if (!cancelled) applySession(restored);
      } catch {
        /* not signed in / offline — unauthenticated is the correct resting state */
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const next = await apiLogin(username, password);
      applySession(next);
    },
    [applySession],
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const next = await apiRegister(username, email, password);
      applySession(next);
    },
    [applySession],
  );

  const logout = useCallback(() => {
    // Local clears run FIRST and synchronously, so logout always succeeds even offline.
    // apiLogout is fire-and-forget and never throws.
    setAuthToken(null);
    setSession(null);
    setSessionExpired(false);
    clearAuthedDataCache();
    void apiLogout();
  }, []);

  const clearExpired = useCallback(() => setSessionExpired(false), []);

  // Register the 401 interceptor + the silent-renew callback: onRefresh renews the token
  // once on a data-route 401 and the failed request is retried; onUnauthorized only fires
  // when that renew ALSO fails, clearing the session with sessionExpired so the login page
  // can explain why. Auth routes are exempt from both inside request().
  useEffect(() => {
    setRefreshHandler(async () => {
      try {
        const restored = await apiRefresh();
        applySession(restored);
        return true;
      } catch {
        return false;
      }
    });
    setUnauthorizedHandler(() => {
      setAuthToken(null);
      setSession(null);
      setSessionExpired(true);
      clearAuthedDataCache();
      fxClearMarker(); // fixtures: drop the reload marker so a dead session isn't restored
    });
    return () => {
      setRefreshHandler(null);
      setUnauthorizedHandler(null);
    };
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      sessionExpired,
      booting,
      login,
      register,
      logout,
      clearExpired,
    }),
    [session, sessionExpired, booting, login, register, logout, clearExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
