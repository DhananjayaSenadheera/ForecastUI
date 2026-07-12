// =============================================================================
// AgriForecast API client (FE-2). Single fetch wrapper — NO axios (platform fetch).
// Anonymous read in R1 (owner decision #2): no auth headers are sent. An auth
// hook point is left commented for R2 (JWT in memory, never localStorage).
//
// FIXTURE MODE: set VITE_API_MODE=fixtures to serve realistic fixture JSON for
// every endpoint (incl. not-yet-built markets/prices = API gaps #1/#2), so the UI
// can be built and tested before the backend hold lifts (~2026-07-16).
// =============================================================================
import * as fx from './fixtures';
import { reportFromHeaders } from './cacheSignal';
import { ymdLocal } from '../lib/format';
import type {
  AdminUser,
  BestCrop,
  Crop,
  CropCreateCommand,
  CropTimeline,
  DailyIndicatorPoint,
  FestivalEntry,
  HarvestForecast,
  MacroSeriesPoint,
  Market,
  MarketOverview,
  NewsEvent,
  PolicyFlag,
  PriceHistoryPoint,
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5282';
export const USE_FIXTURES = import.meta.env.VITE_API_MODE === 'fixtures';

/** Thrown for non-2xx responses / network failures; carries a human message. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// --- auth (FE-17 / FE-21) -----------------------------------------------------
// SECURITY: the JWT lives in MODULE MEMORY ONLY — never localStorage /
// sessionStorage / cookies. FE-21 adds SILENT RENEW: the backend now issues an
// httpOnly refresh cookie (`agriforecast_refresh`, sent on /api/auth/* only) the
// JS can never read; a page reload restores the session by exchanging that cookie
// for a fresh access token via POST /api/auth/refresh. The access token still
// lives only here in memory.
let authToken: string | null = null;

/** Set (or clear, with null) the in-memory bearer token. Called by AuthContext. */
export function setAuthToken(t: string | null): void {
  authToken = t;
}

function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

// --- 401 interceptor ----------------------------------------------------------
// A single global handler the AuthContext registers to clear the session and
// bounce to /login when the API rejects our token (expired / revoked). Auth
// routes are EXEMPT: a 401 from /api/auth/login means "wrong credentials", not
// "session expired", and must not trigger a logout/redirect loop.
let onUnauthorized: (() => void) | null = null;

/** Register the session-expiry handler (AuthContext). Pass null to unregister. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// --- silent renew (FE-21) -----------------------------------------------------
// AuthContext registers a refresh callback here. On the FIRST 401 from a data
// route we call it once: if it renews the access token we retry the failed
// request exactly once; only if renew ALSO fails do we fall to onUnauthorized
// (the signed-out path). Returns true when a fresh token is in memory.
let onRefresh: (() => Promise<boolean>) | null = null;

/** Register the silent-renew callback (AuthContext). Pass null to unregister. */
export function setRefreshHandler(handler: (() => Promise<boolean>) | null): void {
  onRefresh = handler;
}

const AUTH_PATH_PREFIX = '/api/auth/';

// `allowRefresh` is an internal flag: false on the single retry after a renew, so
// a request can never trigger more than one refresh (no refresh/retry loop).
async function request<T>(path: string, init?: RequestInit, allowRefresh = true): Promise<T> {
  const isAuthPath = path.startsWith(AUTH_PATH_PREFIX);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      // Auth routes are the ONLY calls that carry the httpOnly refresh cookie
      // (login/register set it; refresh reads+rotates it; logout clears it). It
      // is cross-origin (:4173 -> :5282), so credentials:'include' is required.
      // Data routes stay Bearer-only — no ambient cookies app-wide.
      ...(isAuthPath ? { credentials: 'include' as const } : {}),
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    // Network / CORS / server-down — surface a retryable human error, no leak.
    throw new ApiError('network', 0);
  }

  // Cache-provenance signal (FE-9): the SW stamps X-SW-Cache on offline-served
  // responses. Fresh network responses clear the flag. No-op when no SW (headers
  // absent -> treated as fresh) and in fixture mode (request() is never reached).
  reportFromHeaders(res.headers);

  if (!res.ok) {
    // Session-expiry interceptor: a 401 on any NON-auth route means our access
    // token is no longer accepted. Auth routes are exempt (there a 401 is a
    // credentials error the login form surfaces itself).
    if (res.status === 401 && !isAuthPath) {
      // Silent renew (FE-21): try ONE refresh + retry before giving up. Only if
      // renew fails (or is unavailable) do we clear the session / redirect.
      if (allowRefresh && onRefresh) {
        let renewed = false;
        try {
          renewed = await onRefresh();
        } catch {
          renewed = false;
        }
        if (renewed) return request<T>(path, init, false); // one retry, no re-refresh
      }
      onUnauthorized?.();
    }
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.errors?.[0]?.message ?? message;
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Exported for the auth module (src/api/auth.ts) so login/register reuse the same
// fetch pipeline: error-message parsing, network-error shaping, the 401 exemption.
export { request };

const iso = (d: string | Date): string => (typeof d === 'string' ? d : ymdLocal(d));

// =============================================================================
// Public API surface. Each method has a fixture branch (VITE_API_MODE=fixtures).
// =============================================================================
export const api = {
  // ---- LIVE endpoints (audited 2026-07-10) --------------------------------
  async getCrops(): Promise<Crop[]> {
    if (USE_FIXTURES) return fx.fxCrops;
    return request<Crop[]>('/api/crops/get/all');
  },

  async createCrop(command: CropCreateCommand): Promise<boolean> {
    if (USE_FIXTURES) return true;
    // Controller takes [FromBody] CropCreateCommand => body is { createDto: {...} }.
    return request<boolean>('/api/crops/create', {
      method: 'POST',
      body: JSON.stringify(command),
    });
  },

  async getHarvestForecast(cropId: string, plantDate: string | Date): Promise<HarvestForecast> {
    if (USE_FIXTURES) return fx.fxForecastFor(cropId, iso(plantDate));
    return request<HarvestForecast>(
      `/api/forecast/crop/${cropId}/harvest?plantDate=${iso(plantDate)}`,
    );
  },

  async getCropTimeline(cropId: string, months = 12, asOf?: string | Date): Promise<CropTimeline> {
    if (USE_FIXTURES) return fx.fxTimelineFor(cropId);
    const q = new URLSearchParams({ months: String(months) });
    if (asOf) q.set('asOf', iso(asOf));
    return request<CropTimeline>(`/api/forecast/crop/${cropId}/timeline?${q.toString()}`);
  },

  async getBestCrops(lookbackMonths = 3): Promise<BestCrop[]> {
    if (USE_FIXTURES) return fx.fxBestCrops;
    return request<BestCrop[]>(`/api/forecast/best-crops?lookbackMonths=${lookbackMonths}`);
  },

  // Landing-dashboard snapshot (FE-1). LIVE route being built against the API-7
  // contract in parallel; consumed verbatim (camelCase). days defaults to 30.
  async getMarketOverview(days = 30): Promise<MarketOverview> {
    if (USE_FIXTURES) return fx.fxMarketOverviewFor(days);
    return request<MarketOverview>(`/api/forecast/market-overview?days=${days}`);
  },

  // ---- FIXTURE-ONLY endpoints (API gaps #1/#2 — no live route yet) ---------
  async getMarkets(): Promise<Market[]> {
    if (USE_FIXTURES) return fx.fxMarkets;
    throw new ApiError('markets endpoint not built yet (API gap #1)', 501);
  },

  async getPriceHistory(cropId: string, marketId?: string): Promise<PriceHistoryPoint[]> {
    if (USE_FIXTURES) return fx.fxPriceHistoryFor(cropId, marketId);
    throw new ApiError('price-history endpoint not built yet (API gap #2)', 501);
  },

  // ---- ADMIN CONSOLE ------------------------------------------------------
  // Policy flags (ADM-2). LIVE route exists: GET /api/policy-flag/get/all
  // [Authorize]; optional ?asOfDate=YYYY-MM-DD returns only flags active that day.
  // CONTRACT QUIRK: an EMPTY result comes back as HTTP 400 ("No policy flags
  // found."), not 200 []. Callers treat a 400 on this route as the empty state.
  async getPolicyFlags(asOfDate?: string): Promise<PolicyFlag[]> {
    if (USE_FIXTURES) return fx.fxPolicyFlagsFor(asOfDate);
    const q = asOfDate ? `?asOfDate=${asOfDate}` : '';
    return request<PolicyFlag[]>(`/api/policy-flag/get/all${q}`);
  },

  // Markets registry (ADM-3). FIXTURE-ONLY today — no live GET route yet (API gap
  // #1, backlogged as API-1). Stubbed like getMarkets so live mode flips on later
  // with no page change. Distinct from getMarkets() (which the farmer Prices page
  // uses with a small price-carrying subset): this returns the FULL 12-market registry.
  async getAdminMarkets(): Promise<Market[]> {
    if (USE_FIXTURES) return fx.fxAdminMarkets;
    throw new ApiError('markets registry endpoint not built yet (API gap #1)', 501);
  },

  // ---- ADMIN CONSOLE — PROVISIONAL (no live endpoint yet; scope-extension 2026-07-12)
  // Read-only fixture reads. Live routes are FE proposals to be built after the backend
  // hold lifts (~2026-07-16); until then live mode throws 501 and pages surface a
  // retryable state. Demo CRUD in these pages mutates COMPONENT state, not the server.
  async getAdminUsers(): Promise<AdminUser[]> {
    if (USE_FIXTURES) return fx.fxAdminUsers;
    throw new ApiError('users endpoint not built yet (provisional)', 501);
  },

  async getFestivals(): Promise<FestivalEntry[]> {
    if (USE_FIXTURES) return fx.fxFestivals;
    throw new ApiError('festivals endpoint not built yet (provisional)', 501);
  },

  async getIndicatorDaily(code: string): Promise<DailyIndicatorPoint[]> {
    if (USE_FIXTURES) return fx.fxIndicatorDaily(code);
    throw new ApiError('indicators endpoint not built yet (provisional)', 501);
  },

  async getIndicatorMacro(seriesKey: string): Promise<MacroSeriesPoint[]> {
    if (USE_FIXTURES) return fx.fxIndicatorMacro(seriesKey);
    throw new ApiError('macro indicators endpoint not built yet (provisional)', 501);
  },

  async getNewsEvents(): Promise<NewsEvent[]> {
    if (USE_FIXTURES) return fx.fxNewsEvents;
    throw new ApiError('news-events endpoint not built yet (provisional)', 501);
  },
};

export const apiMode = USE_FIXTURES ? 'fixtures' : 'live';
