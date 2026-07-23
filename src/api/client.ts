// =============================================================================
// AgriForecast API client (FE-2). Single fetch wrapper — NO axios (platform fetch).
// Anonymous read in R1 (owner decision #2): no auth headers are sent. An auth
// hook point is left commented for R2 (JWT in memory, never localStorage).
//
// FIXTURE MODE: set VITE_API_MODE=fixtures to serve realistic fixture JSON for
// every endpoint, so the UI can be built and demoed without a live backend. The
// markets + price-history routes (formerly API gaps #1/#2) are now LIVE — backend
// PR #24 (API-1/2), wired below and consumed verbatim.
// =============================================================================
import * as fx from './fixtures';
import { reportFromHeaders } from './cacheSignal';
import { ymdLocal } from '../lib/format';
import type {
  AdminUser,
  BestCrop,
  Crop,
  CropReadiness,
  CropCreateCommand,
  CropTimeline,
  CreateUserInput,
  DailyIndicatorPoint,
  FestivalCreateDto,
  FestivalEntry,
  FestivalMutationResult,
  FestivalUpdateDto,
  HarvestForecast,
  IngestionRunPage,
  IngestionStatus,
  MacroSeriesPoint,
  Market,
  MarketOverview,
  NewsArticle,
  NewsEvent,
  NewsEventCreateDto,
  NewsEventUpdateDto,
  PolicyFlag,
  PolicyFlagMutationResult,
  PolicyFlagUpdateDto,
  PriceHistoryPoint,
  SeriesCatalogEntry,
  SystemErrorPage,
  TrainingRunPage,
  UserActivityPage,
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

// Fixtures-mode working copy for the ADM-4 users demo CRUD (API-9 has no fixture
// server): cloned lazily from the seed on first read so role edits + deletes
// persist within a session with no backend. The exported seed (fx.fxAdminUsers)
// is never mutated. Live mode never touches this.
let fxUsersWorking: AdminUser[] | null = null;
function fxUsers(): AdminUser[] {
  if (!fxUsersWorking) fxUsersWorking = fx.fxAdminUsers.map((u) => ({ ...u }));
  return fxUsersWorking;
}

// Fixtures-mode working copy for the ADM-2 policy-flag demo CRUD (API-13 has no
// fixture server): cloned lazily from the seed so edits/deletes persist within a
// session with no backend. The exported seed (fx.fxPolicyFlags) is never mutated.
let fxPolicyWorking: PolicyFlag[] | null = null;
function fxPolicy(): PolicyFlag[] {
  if (!fxPolicyWorking) fxPolicyWorking = fx.fxPolicyFlags.map((f) => ({ ...f }));
  return fxPolicyWorking;
}

// Demo mirror of PolicyFlagTrainingDataWarning.For (backend): a flag whose window
// STARTS strictly before today (UTC calendar date) has already fed training, so the
// mutation warns. Compares the max of the incoming + previous effectiveFrom. Returns
// the same sentence the server sends so the amber banner is demo-able; null otherwise.
const FX_TRAINING_WARNING =
  "This policy flag's effective window falls (partly) in the past. Policy flags are as-of-joined " +
  "into the forecasting model's training data, so editing or removing a past-dated flag changes " +
  'history the model has already learned from — a retrain may be required.';
function fxTrainingWarning(...effectiveFroms: (string | null | undefined)[]): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const touchesPast = effectiveFroms.some((d) => !!d && d.slice(0, 10) < today);
  return touchesPast ? FX_TRAINING_WARNING : null;
}

// Fixtures-mode working copy for the ADM-5 festival-calendar demo CRUD (API-10, no fixture
// server): cloned lazily from the seed so demo add/edit/delete persist through the
// post-mutation refetch. The exported seed (fx.fxFestivals) is never mutated.
let fxFestivalsWorking: FestivalEntry[] | null = null;
function fxFestivals(): FestivalEntry[] {
  if (!fxFestivalsWorking) fxFestivalsWorking = fx.fxFestivals.map((f) => ({ ...f }));
  return fxFestivalsWorking;
}

// Demo mirror of FestivalCalendarTrainingDataWarning.For (backend): a festival whose Date
// (incoming OR stored) is strictly before today (UTC calendar date) has already fed the
// model's lead-up-window training features, so the mutation warns. Returns the same sentence
// the server sends so the amber banner is demo-able; null for purely future-dated festivals.
const FX_FESTIVAL_WARNING =
  "This festival's date falls in the past. Festival dates are as-of-joined into the " +
  "forecasting model's training data (lead-up demand windows), so editing or removing a " +
  'past-dated festival changes history the model has already learned from — a retrain may be required.';
function fxFestivalWarning(...dates: (string | null | undefined)[]): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const touchesPast = dates.some((d) => !!d && d.slice(0, 10) < today);
  return touchesPast ? FX_FESTIVAL_WARNING : null;
}

// Fixtures-mode working copy for the ADM-7 news-events demo CRUD (API-12, no fixture server):
// cloned lazily from the seed so demo add/edit/delete persist through the post-mutation refetch.
// The exported seed (fx.fxNewsEvents) is never mutated. Live mode never touches this.
let fxNewsWorking: NewsEvent[] | null = null;
function fxNews(): NewsEvent[] {
  if (!fxNewsWorking) fxNewsWorking = fx.fxNewsEvents.map((e) => ({ ...e }));
  return fxNewsWorking;
}

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

  // Crop-status colouring (2026-07-22). Callers treat a failure as "readiness
  // unknown" (no tint) — this is decoration, never a page-blocking dependency.
  async getCropReadiness(): Promise<CropReadiness> {
    if (USE_FIXTURES) return fx.fxCropReadiness;
    return request<CropReadiness>('/api/forecast/crop-readiness');
  },

  // Landing-dashboard snapshot (FE-1). LIVE route being built against the API-7
  // contract in parallel; consumed verbatim (camelCase). days defaults to 30.
  async getMarketOverview(days = 30): Promise<MarketOverview> {
    if (USE_FIXTURES) return fx.fxMarketOverviewFor(days);
    return request<MarketOverview>(`/api/forecast/market-overview?days=${days}`);
  },

  // ---- Markets + price history (API-1 / API-2 — LIVE, backend PR #24) ------
  // GET /api/markets/get/all?hasPrices={bool} [Authorize] -> Market[] (camelCase,
  // matches the Market interface exactly), ordered by name. The farmer Prices page
  // charts prices, so it asks for the price-carrying SUBSET (hasPrices=true = the 10
  // markets that actually have price rows; the full registry has 12 — see
  // getAdminMarkets). Empty -> 200 [] (no 400-on-empty quirk here).
  async getMarkets(): Promise<Market[]> {
    if (USE_FIXTURES) return fx.fxMarkets;
    return request<Market[]>('/api/markets/get/all?hasPrices=true');
  },

  // GET /api/prices/crop/{cropId}/history?marketId={guid?}&days={int} [Authorize]
  // -> PriceHistoryPoint[]: one row per calendar date, chronological (oldest first),
  // consumed verbatim (no mapping layer). We pass an explicit days=90 so the FE owns
  // its window rather than trusting the server default silently (server clamps days
  // to [7,365]). Empty -> 200 [] (NOT the policy-flag 400-on-empty quirk).
  // ⚠️ QUIRK: OMITTING marketId returns a CROSS-MARKET daily envelope (excluding the
  // NationalAggregate pseudo-market), NOT a single default-market series. PricesPage
  // always passes a marketId today, so the omitted-marketId envelope is unused.
  async getPriceHistory(cropId: string, marketId?: string): Promise<PriceHistoryPoint[]> {
    if (USE_FIXTURES) return fx.fxPriceHistoryFor(cropId, marketId);
    const q = new URLSearchParams();
    if (marketId) q.set('marketId', marketId);
    q.set('days', '90');
    return request<PriceHistoryPoint[]>(`/api/prices/crop/${cropId}/history?${q.toString()}`);
  },

  // ---- ADMIN CONSOLE ------------------------------------------------------
  // Policy flags (ADM-2). LIVE route exists: GET /api/policy-flag/get/all
  // [Authorize]; optional ?asOfDate=YYYY-MM-DD returns only flags active that day.
  // CONTRACT QUIRK: an EMPTY result comes back as HTTP 400 ("No policy flags
  // found."), not 200 []. Callers treat a 400 on this route as the empty state.
  async getPolicyFlags(asOfDate?: string): Promise<PolicyFlag[]> {
    if (USE_FIXTURES) {
      // Read the working copy (not the static seed) so demo edits/deletes survive
      // the post-mutation refetch. as-of filtering mirrors the backend GetActiveAsOf.
      const all = fxPolicy();
      if (!asOfDate) return all.map((f) => ({ ...f }));
      const d = asOfDate.slice(0, 10);
      return all
        .filter((f) => {
          const from = f.effectiveFrom.slice(0, 10);
          const to = f.effectiveTo ? f.effectiveTo.slice(0, 10) : null;
          return from <= d && (to === null || d <= to);
        })
        .map((f) => ({ ...f }));
    }
    const q = asOfDate ? `?asOfDate=${asOfDate}` : '';
    return request<PolicyFlag[]>(`/api/policy-flag/get/all${q}`);
  },

  // PUT /api/policy-flag/update [Admin-only, API-13]. Full-object update: the body
  // WRAPS the dto under `policyFlagUpdateDto` (mirrors the crops createDto wrapper).
  // -> 200 { id, trainingDataWarning }. Validation/guard failures arrive as the house
  // error shape (HTTP 400) and are surfaced verbatim by the page. In FIXTURES mode the
  // working copy is mutated in place and a demo warning is derived from the (old + new)
  // effectiveFrom so the amber banner is demo-able with no backend.
  async updatePolicyFlag(dto: PolicyFlagUpdateDto): Promise<PolicyFlagMutationResult> {
    if (USE_FIXTURES) {
      const list = fxPolicy();
      const existing = list.find((f) => f.id === dto.id);
      if (!existing) throw new ApiError('Policy flag does not exist.', 400);
      const prevFrom = existing.effectiveFrom;
      existing.policyType = dto.policyType;
      existing.title = dto.title;
      existing.description = dto.description ?? null;
      existing.effectiveFrom = dto.effectiveFrom;
      existing.effectiveTo = dto.effectiveTo ?? null;
      existing.direction = dto.direction;
      existing.source = dto.source ?? null;
      existing.referenceUrl = dto.referenceUrl ?? null;
      return { id: dto.id, trainingDataWarning: fxTrainingWarning(dto.effectiveFrom, prevFrom) };
    }
    return request<PolicyFlagMutationResult>('/api/policy-flag/update', {
      method: 'PUT',
      body: JSON.stringify({ policyFlagUpdateDto: dto }),
    });
  },

  // DELETE /api/policy-flag/delete/{id} [Admin-only, API-13] -> 200 { id,
  // trainingDataWarning } (same past-window warning semantics as update). Fixtures:
  // remove from the working copy; warn when the removed flag's window started in the past.
  async deletePolicyFlag(id: string): Promise<PolicyFlagMutationResult> {
    if (USE_FIXTURES) {
      const list = fxPolicy();
      const existing = list.find((f) => f.id === id);
      if (!existing) throw new ApiError('Policy flag does not exist.', 400);
      const warning = fxTrainingWarning(existing.effectiveFrom);
      fxPolicyWorking = list.filter((f) => f.id !== id);
      return { id, trainingDataWarning: warning };
    }
    return request<PolicyFlagMutationResult>(`/api/policy-flag/delete/${id}`, { method: 'DELETE' });
  },

  // Markets registry (ADM-3, API-1 — LIVE, backend PR #24). GET /api/markets/get/all
  // [Authorize] with NO hasPrices flag = the full registry (all 12 markets, ordered
  // by name). Distinct from getMarkets() (which passes hasPrices=true for the 10
  // price-carrying markets the farmer Prices page can chart). Empty -> 200 [].
  async getAdminMarkets(): Promise<Market[]> {
    if (USE_FIXTURES) return fx.fxAdminMarkets;
    return request<Market[]>('/api/markets/get/all');
  },

  // ---- ADMIN CONSOLE — USERS (ADM-4 / API-9 — LIVE, backend PR #26) --------
  // Role is a plain STRING on the wire ('Admin' | 'Farmer'), camelCase throughout.
  // TWO account-creation paths exist, and they are NOT interchangeable: /register
  // (anonymous, always role Farmer, issues a refresh cookie to the caller) and
  // POST /api/users/create (Admin-only, role chosen, issues NOTHING). The admin
  // console must only ever use the latter — see createUser below.
  //
  // GET /api/users/get/all?page=&pageSize= [Admin-only] -> flat AdminUser[],
  // newest-first. Paging is OPTIONAL: the server clamps page>=1, pageSize in
  // [1,500], default 500. The page paginates CLIENT-SIDE today, so we fetch with
  // NO params — the default 500 covers current scale. ⚠️ CAP: past 500 accounts
  // this silently truncates; wire server paging through before the user base grows.
  async getAdminUsers(): Promise<AdminUser[]> {
    if (USE_FIXTURES) return fxUsers().map((u) => ({ ...u }));
    return request<AdminUser[]>('/api/users/get/all');
  },

  // POST /api/users/create  body {username, email, password, role} [Admin-only]
  // -> the created AdminUser. NEVER call auth register (src/api/auth.ts) from the
  // admin console for this: that endpoint sets the httpOnly refresh cookie for the
  // CALLER, so provisioning an account would swap the acting admin's refresh cookie
  // for the new user's and hand their next silent renew the wrong identity. This
  // route returns the row only — no token, no cookie, admin session untouched.
  // Server guards arrive as the house error shape (400): "Username is already
  // taken." / "Email is already registered." / "Invalid role." — surfaced verbatim.
  async createUser(input: CreateUserInput): Promise<AdminUser> {
    if (USE_FIXTURES) {
      const users = fxUsers();
      // Mirror the server's uniqueness guards so the demo flow hits the same walls.
      if (users.some((u) => u.username.toLowerCase() === input.username.toLowerCase()))
        throw new ApiError('Username is already taken.', 400);
      if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase()))
        throw new ApiError('Email is already registered.', 400);
      const now = new Date().toISOString();
      const created: AdminUser = {
        id: `u-new-${Date.now()}`,
        username: input.username,
        email: input.email,
        role: input.role,
        createdAt: now,
        updatedAt: now,
      };
      users.push(created);
      return { ...created };
    }
    return request<AdminUser>('/api/users/create', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // PUT /api/users/update-role  body {userId, role:'Admin'|'Farmer'} [Admin-only]
  // -> the updated AdminUser. Any other role string -> 400. Load-bearing server
  // guards arrive as the house error shape {errors:[{property:'User',message}]}
  // (HTTP 400): "cannot demote the last remaining admin". request() extracts that
  // message; the page surfaces it verbatim. STALE-SESSION NOTE: with stateless
  // refresh tokens a demoted user's existing session survives up to ~60 min
  // (access-token expiry); their next silent renew re-reads reality.
  async updateUserRole(userId: string, role: 'Admin' | 'Farmer'): Promise<AdminUser> {
    if (USE_FIXTURES) {
      const u = fxUsers().find((x) => x.id === userId);
      if (!u) throw new ApiError('User not found.', 400);
      u.role = role;
      u.updatedAt = new Date().toISOString();
      return { ...u };
    }
    return request<AdminUser>('/api/users/update-role', {
      method: 'PUT',
      body: JSON.stringify({ userId, role }),
    });
  },

  // DELETE /api/users/delete/{id} [Admin-only] -> 200 true. Server guards (400,
  // house error shape): "cannot delete yourself" + "cannot delete the last
  // remaining admin" — surfaced verbatim in the page. STALE-SESSION NOTE: a
  // deleted user's in-flight session lingers up to ~60 min until access-token
  // expiry, then their next refresh is rejected.
  async deleteUser(userId: string): Promise<boolean> {
    if (USE_FIXTURES) {
      const before = fxUsers().length;
      fxUsersWorking = fxUsers().filter((x) => x.id !== userId);
      return fxUsersWorking.length < before;
    }
    return request<boolean>(`/api/users/delete/${userId}`, { method: 'DELETE' });
  },

  // ---- ADMIN CONSOLE — INDICATORS (ADM-6 / API-11 — LIVE, backend merged) --
  // Three read-only routes over macro reference data, audited against
  // IndicatorsController on 2026-07-16. All camelCase, consumed verbatim. Empty is a
  // 200 [] (NOT a 404, NOT the policy-flag 400-on-empty quirk) -> pages render an
  // honest empty state. Param names are LITERAL: daily uses `code`, macro uses `key`.
  //
  // GET /api/indicators/catalog -> SeriesCatalogEntry[] (kind: 'indicator'|'macro').
  // The Indicators page discovers series from here instead of hardcoding keys.
  async getIndicatorCatalog(): Promise<SeriesCatalogEntry[]> {
    if (USE_FIXTURES) return fx.fxIndicatorCatalog();
    return request<SeriesCatalogEntry[]>('/api/indicators/catalog');
  },

  // GET /api/indicators?code={code} -> DailyIndicatorPoint[] (daily EconomicIndicators,
  // e.g. USD_LKR). from/to optional (server default: last 365 days). We rely on the
  // default window today; the code is the required selector.
  async getIndicatorDaily(code: string): Promise<DailyIndicatorPoint[]> {
    if (USE_FIXTURES) return fx.fxIndicatorDaily(code);
    return request<DailyIndicatorPoint[]>(`/api/indicators?code=${encodeURIComponent(code)}`);
  },

  // GET /api/macro-series?key={seriesKey} -> MacroSeriesPoint[] (vintage-aware
  // MacroSeriesPoints, e.g. CCPI). BOTH referenceDate + publishedAt arrive verbatim;
  // multiple vintages of one referenceDate may appear (the page collapses to the latest
  // publishedAt for display while surfacing that a revision exists). Default window is
  // the server's last-365-days on referenceDate.
  async getIndicatorMacro(seriesKey: string): Promise<MacroSeriesPoint[]> {
    if (USE_FIXTURES) return fx.fxIndicatorMacro(seriesKey);
    return request<MacroSeriesPoint[]>(`/api/macro-series?key=${encodeURIComponent(seriesKey)}`);
  },

  // ---- ADMIN CONSOLE — FESTIVAL CALENDAR (ADM-5 / API-10 — LIVE, backend merged) ----
  // Audited read-only against FestivalCalendarController on 2026-07-16. All camelCase,
  // consumed verbatim. Empty -> 200 [] (NOT the policy-flag 400-on-empty quirk). Mutation
  // bodies WRAP the dto (mirrors the crops createDto / policyFlagUpdateDto wrappers). Update
  // + delete return { id, trainingDataWarning } (non-null when the festival Date — incoming or
  // stored — is in the past; the mutation still SUCCEEDED, the warning is informational).
  //
  // GET /api/festival-calendar/get/all [Authorize] -> FestivalEntry[] ordered by date.
  async getFestivals(): Promise<FestivalEntry[]> {
    // Read the working copy (not the static seed) so demo add/edit/delete survive the
    // post-mutation refetch. Live mode never touches this.
    if (USE_FIXTURES) return fxFestivals().map((f) => ({ ...f }));
    return request<FestivalEntry[]>('/api/festival-calendar/get/all');
  },

  // POST /api/festival-calendar/create [Admin] body { festivalCalendarCreateDto } -> 200 true.
  // Fixtures: append to the working copy (synthesise id + createdAtUtc) so the demo row
  // survives the refetch; leadUpDays is stored VERBATIM (0 stays 0 — never coerced).
  async createFestival(dto: FestivalCreateDto): Promise<boolean> {
    if (USE_FIXTURES) {
      fxFestivals().push({
        id: `f-new-${Date.now()}`,
        festivalKey: dto.festivalKey,
        date: dto.date,
        leadUpDays: dto.leadUpDays,
        isProvisional: dto.isProvisional,
        source: dto.source,
        createdAtUtc: new Date().toISOString(),
      });
      return true;
    }
    return request<boolean>('/api/festival-calendar/create', {
      method: 'POST',
      body: JSON.stringify({ festivalCalendarCreateDto: dto }),
    });
  },

  // PUT /api/festival-calendar/update [Admin] body { festivalCalendarUpdateDto } -> 200
  // { id, trainingDataWarning }. Full-object update. Fixtures: mutate the working copy in
  // place and derive the demo warning from the (old + new) Date so the amber banner is demo-able.
  async updateFestival(dto: FestivalUpdateDto): Promise<FestivalMutationResult> {
    if (USE_FIXTURES) {
      const list = fxFestivals();
      const existing = list.find((f) => f.id === dto.id);
      if (!existing) throw new ApiError('Festival does not exist.', 400);
      const prevDate = existing.date;
      existing.festivalKey = dto.festivalKey;
      existing.date = dto.date;
      existing.leadUpDays = dto.leadUpDays;
      existing.isProvisional = dto.isProvisional;
      existing.source = dto.source;
      return { id: dto.id, trainingDataWarning: fxFestivalWarning(dto.date, prevDate) };
    }
    return request<FestivalMutationResult>('/api/festival-calendar/update', {
      method: 'PUT',
      body: JSON.stringify({ festivalCalendarUpdateDto: dto }),
    });
  },

  // DELETE /api/festival-calendar/delete/{id} [Admin] -> 200 { id, trainingDataWarning }
  // (same past-date warning semantics as update). Fixtures: warn when the removed festival's
  // Date is in the past, then drop it from the working copy.
  async deleteFestival(id: string): Promise<FestivalMutationResult> {
    if (USE_FIXTURES) {
      const list = fxFestivals();
      const existing = list.find((f) => f.id === id);
      if (!existing) throw new ApiError('Festival does not exist.', 400);
      const warning = fxFestivalWarning(existing.date);
      fxFestivalsWorking = list.filter((f) => f.id !== id);
      return { id, trainingDataWarning: warning };
    }
    return request<FestivalMutationResult>(`/api/festival-calendar/delete/${id}`, { method: 'DELETE' });
  },

  // ---- ADMIN CONSOLE — NEWS EVENTS (ADM-7 / API-12 — LIVE, backend merged) ----
  // Audited read-only against NewsEventController on 2026-07-16. All camelCase, enums as
  // integers, consumed verbatim. Empty -> 200 [] (NOT the policy-flag 400-on-empty quirk).
  // Mutation bodies WRAP the dto (mirrors the crops createDto / policyFlagUpdateDto wrappers).
  //
  // CAPTURE-ONLY divergence from API-10/13: news events are NOT yet ML feature inputs, so there
  // is deliberately NO trainingDataWarning. Mutation returns are BARE — create -> boolean,
  // update/delete -> the affected Guid (string), NOT the { id, trainingDataWarning } shape.
  //
  // GET /api/news-events/get/all [Authorize] -> NewsEvent[], newest publishedAt first.
  async getNewsEvents(): Promise<NewsEvent[]> {
    // Read the working copy (not the static seed) so demo add/edit/delete survive the
    // post-mutation refetch. Live mode never touches this.
    if (USE_FIXTURES) return fxNews().map((e) => ({ ...e }));
    return request<NewsEvent[]>('/api/news-events/get/all');
  },

  // POST /api/news-events/create [Admin] body { newsEventCreateDto } -> 200 true (boolean).
  // Fixtures: append to the working copy (synthesise id + createdAtUtc; affectedMarketIds
  // defaults to [] since the FE has no market picker) so the demo row survives the refetch.
  async createNewsEvent(dto: NewsEventCreateDto): Promise<boolean> {
    if (USE_FIXTURES) {
      fxNews().push({
        id: `e-new-${Date.now()}`,
        eventType: dto.eventType,
        direction: dto.direction,
        title: dto.title,
        description: dto.description ?? null,
        publishedAt: dto.publishedAt,
        sourceUrl: dto.sourceUrl ?? null,
        affectedCropIds: dto.affectedCropIds ?? [],
        affectedMarketIds: dto.affectedMarketIds ?? [],
        createdAtUtc: new Date().toISOString(),
      });
      return true;
    }
    return request<boolean>('/api/news-events/create', {
      method: 'POST',
      body: JSON.stringify({ newsEventCreateDto: dto }),
    });
  },

  // PUT /api/news-events/update [Admin] body { newsEventUpdateDto } -> 200 Guid (string).
  // Full-object update MINUS publishedAt (the vintage date is immutable by construction — the
  // dto does not carry it). Fixtures: mutate the working copy in place, preserving the stored
  // publishedAt untouched; return the affected id.
  async updateNewsEvent(dto: NewsEventUpdateDto): Promise<string> {
    if (USE_FIXTURES) {
      const list = fxNews();
      const existing = list.find((e) => e.id === dto.id);
      if (!existing) throw new ApiError('News event does not exist.', 400);
      existing.eventType = dto.eventType;
      existing.direction = dto.direction;
      existing.title = dto.title;
      existing.description = dto.description ?? null;
      existing.sourceUrl = dto.sourceUrl ?? null;
      existing.affectedCropIds = dto.affectedCropIds ?? [];
      existing.affectedMarketIds = dto.affectedMarketIds ?? [];
      // publishedAt deliberately NOT touched — immutable vintage date.
      return dto.id;
    }
    return request<string>('/api/news-events/update', {
      method: 'PUT',
      body: JSON.stringify({ newsEventUpdateDto: dto }),
    });
  },

  // DELETE /api/news-events/delete/{id} [Admin] -> 200 Guid (string). Fixtures: drop it from
  // the working copy and return the id.
  async deleteNewsEvent(id: string): Promise<string> {
    if (USE_FIXTURES) {
      const list = fxNews();
      const existing = list.find((e) => e.id === id);
      if (!existing) throw new ApiError('News event does not exist.', 400);
      fxNewsWorking = list.filter((e) => e.id !== id);
      return id;
    }
    return request<string>(`/api/news-events/delete/${id}`, { method: 'DELETE' });
  },

  // GET /api/news-articles/get/latest?take=50 [Authorize] -> NewsArticle[], newest first.
  // Read-only feed of what the news INGESTION pipeline captured (Python-owned table) —
  // distinct from the curated news-events CRUD above. Server clamps take (default 50,
  // max 200) and returns 200 [] when ingestion has never run.
  async getNewsArticles(take = 50): Promise<NewsArticle[]> {
    if (USE_FIXTURES) return fx.fxNewsArticles.slice(0, take);
    return request<NewsArticle[]>(`/api/news-articles/get/latest?take=${take}`);
  },

  // ---- ADMIN CONSOLE — INGESTION RUNS (admin ingestion API — LIVE-verified) ----
  // Two read-only routes behind an Admin JWT; a 401/403 flows through the existing
  // global interceptor (silent renew then /login), so there is ZERO new auth code here.
  //
  // GET /api/admin/ingestion/status -> IngestionStatus: a pipeline snapshot (service
  // state, last run + verification rollup, per-source health). Consumed verbatim.
  async getIngestionStatus(): Promise<IngestionStatus> {
    if (USE_FIXTURES) return fx.fxIngestionStatus();
    return request<IngestionStatus>('/api/admin/ingestion/status');
  },

  // GET /api/admin/ingestion/runs?page=&pageSize=&source= -> IngestionRunPage. The
  // API is SERVER-PAGED ({items,page,pageSize,total}) — the page passes page/pageSize
  // straight through and NEVER client-slices. `source` is optional; an INVALID source
  // key answers 400 (surfaced as the error state). run.verification.checksJson is a
  // JSON STRING parsed defensively in the page (parseVerificationChecks).
  async getIngestionRuns(page = 1, pageSize = 20, source?: string): Promise<IngestionRunPage> {
    if (USE_FIXTURES) return fx.fxIngestionRuns(page, pageSize, source);
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (source) q.set('source', source);
    return request<IngestionRunPage>(`/api/admin/ingestion/runs?${q.toString()}`);
  },

  // ---- ADMIN CONSOLE — LOGS HUB Phase 2 (training + user activity — LIVE) ----
  // Both routes behind an Admin JWT (401/403 through the existing interceptor); both
  // return the server-paged {items,page,pageSize,total} envelope, consumed verbatim.
  //
  // GET /api/admin/logs/training?page=&pageSize= -> TrainingRunPage (ordered
  // TrainedAtUtc DESC). No filter param — always the full history, server-paged.
  async getTrainingRuns(page = 1, pageSize = 25): Promise<TrainingRunPage> {
    if (USE_FIXTURES) return fx.fxTrainingRuns(page, pageSize);
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return request<TrainingRunPage>(`/api/admin/logs/training?${q.toString()}`);
  },

  // GET /api/admin/logs/user-activity?page=&pageSize=&type= -> UserActivityPage
  // (ordered OccurredUtc DESC). `type` is OPTIONAL and must be one of the five frozen
  // wire strings (USER_ACTIVITY_EVENT_TYPES) — the server 400s any other value, so the
  // client only ever OMITS it (all) or sends an exact enum string, never free text.
  async getUserActivity(page = 1, pageSize = 25, type?: string): Promise<UserActivityPage> {
    if (USE_FIXTURES) return fx.fxUserActivity(page, pageSize, type);
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (type) q.set('type', type);
    return request<UserActivityPage>(`/api/admin/logs/user-activity?${q.toString()}`);
  },

  // ---- ADMIN CONSOLE — LOGS HUB Phase 3 (system errors — LIVE) -------------
  // GET /api/admin/logs/errors?page=&pageSize= -> SystemErrorPage (ordered
  // OccurredUtc DESC). Same Admin-JWT + server-paged {items,page,pageSize,total}
  // envelope as the sibling tabs; no filter param — always the full history,
  // server-paged. Each row is one unhandled server exception (a 500).
  async getSystemErrors(page = 1, pageSize = 25): Promise<SystemErrorPage> {
    if (USE_FIXTURES) return fx.fxSystemErrors(page, pageSize);
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return request<SystemErrorPage>(`/api/admin/logs/errors?${q.toString()}`);
  },
};

export const apiMode = USE_FIXTURES ? 'fixtures' : 'live';
