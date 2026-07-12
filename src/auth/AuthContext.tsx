// =============================================================================
// AuthContext (FE-17). Holds the in-memory session (token + minimal identity the
// API returns), exposes login/register/logout + isAuthenticated, and wires the
// global 401 interceptor to clear the session on token expiry.
//
// SECURITY: the token lives ONLY in this module's React state — never
// localStorage/sessionStorage/cookies. A page refresh drops it BY DESIGN and the
// farmer re-logs-in.
//   BACKEND BACKLOG ITEM: refresh-token / silent-renew. The .NET backend issues
//   no refresh token today (JwtTokenGenerator returns only (token, expiresAt)),
//   so there is nothing to renew against — remove this in-memory-only posture
//   only once that endpoint exists.
// =============================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import { login as apiLogin, register as apiRegister, type AuthSession } from '../api/auth';

interface AuthContextValue {
  session: AuthSession | null;
  isAuthenticated: boolean;
  /** true right after the token was rejected mid-session (drives the /login notice). */
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearExpired: () => void;
}

// Default value keeps components that read auth (e.g. AppShell footer) from
// crashing when rendered outside a provider (unit tests, storybook): they simply
// see an unauthenticated, no-op session.
const noop = () => undefined;
const AuthContext = createContext<AuthContextValue>({
  session: null,
  isAuthenticated: false,
  sessionExpired: false,
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
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const applySession = useCallback((next: AuthSession) => {
    setAuthToken(next.token); // in-memory only
    setSession(next);
    setSessionExpired(false);
  }, []);

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
    setAuthToken(null);
    setSession(null);
    setSessionExpired(false);
    clearAuthedDataCache();
  }, []);

  const clearExpired = useCallback(() => setSessionExpired(false), []);

  // Register the 401 interceptor: a token rejection on any data route clears the
  // session (the route guard then bounces to /login) and flags "session expired"
  // so the login page can explain why. Auth routes are exempt inside request().
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthToken(null);
      setSession(null);
      setSessionExpired(true);
      clearAuthedDataCache();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      sessionExpired,
      login,
      register,
      logout,
      clearExpired,
    }),
    [session, sessionExpired, login, register, logout, clearExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
