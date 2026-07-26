// Auth API calls (login / register / refresh / logout) against the .NET AuthController.
// Bodies are WRAPPED ({ loginDto } / { registerDto }) and go through client.request(),
// so they reuse its error parsing and the 401 exemption for /api/auth/*.
// In fixtures mode auth is simulated: any non-empty input mints a fake in-memory
// session (marked simulated:true), and the username `admin` simulates an Admin role so
// the admin console is demoable offline. Live mode ignores that marker.
import { request, USE_FIXTURES, ApiError } from './client';
import type { AuthResponseDto } from './types';

// FIXTURES ONLY. Live mode restores a session from the httpOnly refresh cookie;
// fixtures mode has no server, so the username (NOT a token) is kept in sessionStorage
// so a reload can re-mint the simulated session.
const FX_MARKER = 'fx-session';

function fxSetMarker(username: string): void {
  try {
    sessionStorage.setItem(FX_MARKER, username || 'demo');
  } catch {
    /* storage unavailable — reload simply won't restore, login still works */
  }
}

function fxReadMarker(): string | null {
  try {
    return sessionStorage.getItem(FX_MARKER);
  } catch {
    return null;
  }
}

export function fxClearMarker(): void {
  try {
    sessionStorage.removeItem(FX_MARKER);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** FIXTURES-ONLY: rebuild the simulated session from the reload marker, or null. */
export function fxRestoreSession(): AuthSession | null {
  const username = fxReadMarker();
  return username ? fakeSession(username) : null;
}

/** In-app session identity (minimal — only what the API returns; no token here). */
export interface AuthSession {
  token: string;
  expiresAtUtc: string;
  username: string;
  email: string;
  role: string;
  /** true only in fixtures mode (simulated login) — drives a dev-only badge. */
  simulated: boolean;
}

function toSession(dto: AuthResponseDto, simulated: boolean): AuthSession {
  return {
    token: dto.accessToken,
    expiresAtUtc: dto.expiresAtUtc,
    username: dto.username,
    email: dto.email,
    role: dto.role,
    simulated,
  };
}

/** Fake session for fixtures / offline demo, never used in live mode. The username
 *  `admin` simulates an Admin; every other username is a Farmer. */
function fakeSession(username: string, email = ''): AuthSession {
  const in12h = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const uname = username.trim();
  return {
    // Not a real JWT, just a marker. Fixtures mode never calls request(), so it never
    // goes on the wire.
    token: 'fixtures.simulated.session',
    expiresAtUtc: in12h,
    username: uname,
    email: email.trim(),
    role: uname.toLowerCase() === 'admin' ? 'Admin' : 'Farmer',
    simulated: true,
  };
}

/** Log in by USERNAME + password. Throws ApiError (401 = "Invalid username or password.").
 *  Live: sets the httpOnly refresh cookie (credentials handled in client.ts). */
export async function login(username: string, password: string): Promise<AuthSession> {
  if (USE_FIXTURES) {
    const s = fakeSession(username);
    fxSetMarker(s.username);
    return s;
  }
  const dto = await request<AuthResponseDto>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginDto: { username, password } }),
  });
  return toSession(dto, false);
}

/** Register a new farmer account. Throws ApiError (400 = taken/validation message).
 *  Live: sets the httpOnly refresh cookie. */
export async function register(
  username: string,
  email: string,
  password: string,
): Promise<AuthSession> {
  if (USE_FIXTURES) {
    const s = fakeSession(username, email);
    fxSetMarker(s.username);
    return s;
  }
  const dto = await request<AuthResponseDto>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ registerDto: { username, email, password } }),
  });
  return toSession(dto, false);
}

/** Silent renew: exchange the httpOnly refresh cookie for a fresh access token. No
 *  request body. Throws ApiError when the cookie is missing or expired. Fixtures:
 *  re-mints the simulated session from the reload marker. */
export async function refresh(): Promise<AuthSession> {
  if (USE_FIXTURES) {
    const restored = fxRestoreSession();
    if (!restored) throw new ApiError('not signed in', 401);
    return restored;
  }
  const dto = await request<AuthResponseDto>('/api/auth/refresh', { method: 'POST' });
  return toSession(dto, false);
}

/** Clear the server-side refresh cookie (FE-21). Fire-and-forget: NEVER throws, so
 *  local logout proceeds even when offline. Fixtures: drops the reload marker. */
export async function logout(): Promise<void> {
  if (USE_FIXTURES) {
    fxClearMarker();
    return;
  }
  try {
    await request<void>('/api/auth/logout', { method: 'POST' });
  } catch {
    /* network/500 — the local session is cleared regardless; nothing to surface */
  }
}
