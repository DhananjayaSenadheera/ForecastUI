// =============================================================================
// Auth API surface (FE-17). login/register against the LIVE .NET AuthController
// with the WRAPPED body shapes ({ loginDto } / { registerDto }); reuses the
// client.request() pipeline (error-message parsing, network shaping, the 401
// exemption for /api/auth/*). See the AUTH contract block in types.ts.
//
// FIXTURE MODE (VITE_API_MODE=fixtures): auth is SIMULATED — any non-empty input
// mints a fake in-memory session so the whole flow is demoable offline. The fake
// session is clearly marked (simulated:true) and a subtle dev-only badge is shown
// in the shell. The guards/pages behave IDENTICALLY to live mode.
// =============================================================================
import { request, USE_FIXTURES } from './client';
import type { AuthResponseDto } from './types';

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

/** A clearly-fenced fake session for fixtures/offline demo. NEVER used in live mode. */
function fakeSession(username: string, email = ''): AuthSession {
  const in12h = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  return {
    // Not a real JWT — a marker string. authHeaders() will send it, but fixtures
    // mode never calls request(), so it is never put on the wire.
    token: 'fixtures.simulated.session',
    expiresAtUtc: in12h,
    username: username.trim(),
    email: email.trim(),
    role: 'Farmer',
    simulated: true,
  };
}

/** Log in by USERNAME + password. Throws ApiError (401 = "Invalid username or password."). */
export async function login(username: string, password: string): Promise<AuthSession> {
  if (USE_FIXTURES) return fakeSession(username);
  const dto = await request<AuthResponseDto>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginDto: { username, password } }),
  });
  return toSession(dto, false);
}

/** Register a new farmer account. Throws ApiError (400 = taken/validation message). */
export async function register(
  username: string,
  email: string,
  password: string,
): Promise<AuthSession> {
  if (USE_FIXTURES) return fakeSession(username, email);
  const dto = await request<AuthResponseDto>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ registerDto: { username, email, password } }),
  });
  return toSession(dto, false);
}
