// API client: one fetch wrapper, no axios. Set VITE_API_MODE=fixtures to serve fixture
// JSON for every endpoint so the UI runs without a backend.
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
  HarvestWindow,
  IngestionRunPage,
  IngestionServiceStartResult,
  IngestionServiceStopResult,
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

/** Thrown for non-2xx responses / network failures; carries a human message and, when
 *  the server sent one, the machine-readable `error` code from the body (e.g. the
 *  ingestion-service 409s). `code` is null whenever the body had no such string — a
 *  caller must never branch on a code it did not actually receive. */
export class ApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// The access token lives in MODULE MEMORY ONLY — never localStorage, sessionStorage or
// cookies. A reload restores the session by exchanging the httpOnly refresh cookie
// (`agriforecast_refresh`, sent on /api/auth/* only) for a fresh access token.
let authToken: string | null = null;

/** Set (or clear, with null) the in-memory bearer token. Called by AuthContext. */
export function setAuthToken(t: string | null): void {
  authToken = t;
}

function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

// A single global 401 handler (registered by AuthContext) clears the session and
// bounces to /login. Auth routes are EXEMPT: a 401 from /api/auth/login means wrong
// credentials, not an expired session, and must not start a redirect loop.
let onUnauthorized: (() => void) | null = null;

/** Register the session-expiry handler (AuthContext). Pass null to unregister. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// AuthContext registers a refresh callback. On the first 401 from a data route we call
// it once and retry the request once; only if the renew also fails do we fall through
// to onUnauthorized.
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
      // Auth routes are the only calls that carry the httpOnly refresh cookie, and they
      // are cross-origin, so credentials:'include' is required. Data routes stay
      // Bearer-only — no ambient cookies app-wide.
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

  // The service worker stamps X-SW-Cache on offline-served responses; a fresh network
  // response clears the flag.
  reportFromHeaders(res.headers);

  if (!res.ok) {
    // A 401 on a non-auth route means our access token is no longer accepted. Auth
    // routes are exempt (there a 401 is a credentials error the login form shows).
    if (res.status === 401 && !isAuthPath) {
      // Try ONE refresh + retry before giving up.
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
    let code: string | null = null;
    try {
      const body = await res.json();
      message = body?.errors?.[0]?.message ?? message;
      // Some routes answer a machine-readable code instead of the errors[] envelope
      // (e.g. the ingestion-service 409s: { "error": "already_running" }). Keep it so
      // the caller can tell "already running" apart from "the server broke".
      if (typeof body?.error === 'string' && body.error) code = body.error;
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Exported for src/api/auth.ts so login/register reuse the same fetch pipeline.
export { request };

const iso = (d: string | Date): string => (typeof d === 'string' ? d : ymdLocal(d));

// Fixtures-mode working copy of the users list, cloned lazily from the seed so demo
// edits and deletes survive the post-mutation refetch. The seed is never mutated.
let fxUsersWorking: AdminUser[] | null = null;
function fxUsers(): AdminUser[] {
  if (!fxUsersWorking) fxUsersWorking = fx.fxAdminUsers.map((u) => ({ ...u }));
  return fxUsersWorking;
}

// Fixtures-mode working copy of the policy flags (same reason as the users copy).
let fxPolicyWorking: PolicyFlag[] | null = null;
function fxPolicy(): PolicyFlag[] {
  if (!fxPolicyWorking) fxPolicyWorking = fx.fxPolicyFlags.map((f) => ({ ...f }));
  return fxPolicyWorking;
}

// Demo mirror of the backend's policy-flag rule: a flag whose window starts before
// today has already fed training, so the mutation warns. Returns the same sentence the
// server sends so the amber banner is demoable.
const FX_TRAINING_WARNING =
  "This policy flag's effective window falls (partly) in the past. Policy flags are as-of-joined " +
  "into the forecasting model's training data, so editing or removing a past-dated flag changes " +
  'history the model has already learned from — a retrain may be required.';
function fxTrainingWarning(...effectiveFroms: (string | null | undefined)[]): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const touchesPast = effectiveFroms.some((d) => !!d && d.slice(0, 10) < today);
  return touchesPast ? FX_TRAINING_WARNING : null;
}

// Fixtures-mode working copy of the festival calendar (same reason as above).
let fxFestivalsWorking: FestivalEntry[] | null = null;
function fxFestivals(): FestivalEntry[] {
  if (!fxFestivalsWorking) fxFestivalsWorking = fx.fxFestivals.map((f) => ({ ...f }));
  return fxFestivalsWorking;
}

// Demo mirror of the backend's festival rule: a festival dated before today has
// already fed the model's lead-up training features, so the mutation warns.
const FX_FESTIVAL_WARNING =
  "This festival's date falls in the past. Festival dates are as-of-joined into the " +
  "forecasting model's training data (lead-up demand windows), so editing or removing a " +
  'past-dated festival changes history the model has already learned from — a retrain may be required.';
function fxFestivalWarning(...dates: (string | null | undefined)[]): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const touchesPast = dates.some((d) => !!d && d.slice(0, 10) < today);
  return touchesPast ? FX_FESTIVAL_WARNING : null;
}

// Fixtures-mode working copy of the news events (same reason as above).
let fxNewsWorking: NewsEvent[] | null = null;
function fxNews(): NewsEvent[] {
  if (!fxNewsWorking) fxNewsWorking = fx.fxNewsEvents.map((e) => ({ ...e }));
  return fxNewsWorking;
}

// Public API surface. Each method has a fixture branch (VITE_API_MODE=fixtures).
export const api = {
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

  // A rankable=false response is a normal 200, not an error — the panel renders an
  // honest "we cannot rank dates for this crop yet" state from reasonCode.
  async getHarvestWindow(cropId: string, horizonDays = 90, asOf?: string | Date): Promise<HarvestWindow> {
    if (USE_FIXTURES) return fx.fxHarvestWindowFor(cropId, horizonDays, asOf ? iso(asOf) : undefined);
    const q = new URLSearchParams({ horizonDays: String(horizonDays) });
    if (asOf) q.set('asOf', iso(asOf));
    return request<HarvestWindow>(`/api/forecast/crop/${cropId}/harvest-window?${q.toString()}`);
  },

  async getBestCrops(lookbackMonths = 3): Promise<BestCrop[]> {
    if (USE_FIXTURES) return fx.fxBestCrops;
    return request<BestCrop[]>(`/api/forecast/best-crops?lookbackMonths=${lookbackMonths}`);
  },

  // A failure here just means "readiness unknown" (no tint); never page-blocking.
  async getCropReadiness(): Promise<CropReadiness> {
    if (USE_FIXTURES) return fx.fxCropReadiness;
    return request<CropReadiness>('/api/forecast/crop-readiness');
  },

  // Landing-dashboard snapshot; days defaults to 30.
  async getMarketOverview(days = 30): Promise<MarketOverview> {
    if (USE_FIXTURES) return fx.fxMarketOverviewFor(days);
    return request<MarketOverview>(`/api/forecast/market-overview?days=${days}`);
  },

  // getMarkets asks for the price-carrying subset (hasPrices=true, 10 of the 12
  // markets); getAdminMarkets below fetches the full registry. Empty is 200 [].
  async getMarkets(): Promise<Market[]> {
    if (USE_FIXTURES) return fx.fxMarkets;
    return request<Market[]>('/api/markets/get/all?hasPrices=true');
  },

  // Price history: one row per calendar date, oldest first. We pass days=90 explicitly
  // rather than trusting the server default (the server clamps days to 7..365).
  // QUIRK: omitting marketId returns a CROSS-MARKET daily envelope, not one market's
  // series. PricesPage always passes a marketId.
  async getPriceHistory(cropId: string, marketId?: string): Promise<PriceHistoryPoint[]> {
    if (USE_FIXTURES) return fx.fxPriceHistoryFor(cropId, marketId);
    const q = new URLSearchParams();
    if (marketId) q.set('marketId', marketId);
    q.set('days', '90');
    return request<PriceHistoryPoint[]>(`/api/prices/crop/${cropId}/history?${q.toString()}`);
  },

  // Policy flags: optional ?asOfDate=YYYY-MM-DD returns only flags active that day.
  // CONTRACT QUIRK: an EMPTY result comes back as HTTP 400, not 200 [], so callers
  // treat a 400 on this route as the empty state.
  async getPolicyFlags(asOfDate?: string): Promise<PolicyFlag[]> {
    if (USE_FIXTURES) {
      // Read the working copy, not the seed, so demo edits survive the refetch.
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

  // PUT /api/policy-flag/update: the body WRAPS the dto under `policyFlagUpdateDto`
  // (same wrapper style as the crops createDto) and returns { id, trainingDataWarning }.
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

  // Delete returns { id, trainingDataWarning } with the same past-window semantics.
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

  // The full markets registry (all 12), unlike getMarkets() which asks for the 10
  // price-carrying ones.
  async getAdminMarkets(): Promise<Market[]> {
    if (USE_FIXTURES) return fx.fxAdminMarkets;
    return request<Market[]>('/api/markets/get/all');
  },

  // Users admin API. Role is a plain string on the wire ('Admin' | 'Farmer').
  // GET /api/users/get/all is server-paged but we fetch with no params (server default
  // 500) and paginate client-side. CAP: past 500 accounts this silently truncates —
  // wire server paging through before the user base grows.
  async getAdminUsers(): Promise<AdminUser[]> {
    if (USE_FIXTURES) return fxUsers().map((u) => ({ ...u }));
    return request<AdminUser[]>('/api/users/get/all');
  },

  // POST /api/users/create (Admin-only) returns the created row and nothing else.
  // NEVER use auth register() for this: that endpoint sets the httpOnly refresh cookie
  // for the CALLER, so provisioning an account would swap the acting admin's session.
  // Server guards ("Username is already taken.") arrive as 400 and are shown verbatim.
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

  // PUT /api/users/update-role. The server's "cannot demote the last remaining admin"
  // guard arrives as a 400 the page shows verbatim. A demoted user's existing access
  // token still works until it expires (~60 min); their next renew re-reads reality.
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

  // DELETE /api/users/delete/{id}. Server guards ("cannot delete yourself", "cannot
  // delete the last remaining admin") arrive as 400 and are shown verbatim. A deleted
  // user's session also lingers until their access token expires (~60 min).
  async deleteUser(userId: string): Promise<boolean> {
    if (USE_FIXTURES) {
      const before = fxUsers().length;
      fxUsersWorking = fxUsers().filter((x) => x.id !== userId);
      return fxUsersWorking.length < before;
    }
    return request<boolean>(`/api/users/delete/${userId}`, { method: 'DELETE' });
  },

  // Indicators: three read-only routes. Empty is 200 [] (not the policy-flag 400 quirk).
  // Param names are literal: the daily route takes `code`, the macro route takes `key`.
  // GET /api/indicators/catalog lists the available series, so the Indicators page
  // discovers keys instead of hardcoding them.
  async getIndicatorCatalog(): Promise<SeriesCatalogEntry[]> {
    if (USE_FIXTURES) return fx.fxIndicatorCatalog();
    return request<SeriesCatalogEntry[]>('/api/indicators/catalog');
  },

  // GET /api/indicators?code= -> daily points (e.g. USD_LKR). from/to are optional; the
  // server defaults to the last 365 days.
  async getIndicatorDaily(code: string): Promise<DailyIndicatorPoint[]> {
    if (USE_FIXTURES) return fx.fxIndicatorDaily(code);
    return request<DailyIndicatorPoint[]>(`/api/indicators?code=${encodeURIComponent(code)}`);
  },

  // GET /api/macro-series?key= -> vintage-aware points. Both referenceDate and
  // publishedAt arrive verbatim, and one referenceDate can have several vintages.
  async getIndicatorMacro(seriesKey: string): Promise<MacroSeriesPoint[]> {
    if (USE_FIXTURES) return fx.fxIndicatorMacro(seriesKey);
    return request<MacroSeriesPoint[]>(`/api/macro-series?key=${encodeURIComponent(seriesKey)}`);
  },

  // Festival calendar. Empty is 200 []. Mutation bodies WRAP the dto, and update +
  // delete return { id, trainingDataWarning } (non-null when the date is in the past —
  // the mutation still succeeded).
  async getFestivals(): Promise<FestivalEntry[]> {
    // Read the working copy, not the seed, so demo edits survive the refetch.
    if (USE_FIXTURES) return fxFestivals().map((f) => ({ ...f }));
    return request<FestivalEntry[]>('/api/festival-calendar/get/all');
  },

  // Fixtures: append to the working copy; leadUpDays is stored verbatim (0 stays 0).
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

  // Full-object update -> { id, trainingDataWarning }.
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

  // Delete -> { id, trainingDataWarning } (same past-date semantics as update).
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

  // News events (the curated CRUD). Enums are integers on the wire and mutation bodies
  // wrap the dto. Unlike the festival and policy routes these returns are BARE —
  // create -> boolean, update/delete -> the affected id — because news events are not
  // model inputs yet, so there is no trainingDataWarning.
  async getNewsEvents(): Promise<NewsEvent[]> {
    // Read the working copy, not the seed, so demo edits survive the refetch.
    if (USE_FIXTURES) return fxNews().map((e) => ({ ...e }));
    return request<NewsEvent[]>('/api/news-events/get/all');
  },

  // Fixtures: append to the working copy so the demo row survives the refetch.
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

  // Full-object update MINUS publishedAt — the vintage date is immutable, so the dto
  // does not carry it.
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

  // Delete -> the affected id (a string, not the { id, trainingDataWarning } shape).
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

  // GET /api/news-articles/get/latest: read-only feed of what the news INGESTION
  // pipeline captured, distinct from the curated news-events CRUD above. The server
  // clamps take (default 50, max 200).
  async getNewsArticles(take = 50): Promise<NewsArticle[]> {
    if (USE_FIXTURES) return fx.fxNewsArticles.slice(0, take);
    return request<NewsArticle[]>(`/api/news-articles/get/latest?take=${take}`);
  },

  // Ingestion runs: two read-only routes behind an Admin JWT.
  // GET /api/admin/ingestion/status -> a pipeline snapshot, consumed verbatim.
  async getIngestionStatus(): Promise<IngestionStatus> {
    if (USE_FIXTURES) return fx.fxIngestionStatus();
    return request<IngestionStatus>('/api/admin/ingestion/status');
  },

  // GET /api/admin/ingestion/runs is SERVER-PAGED ({items,page,pageSize,total}) — pass
  // page/pageSize straight through, never client-slice. An invalid `source` answers 400.
  // run.verification.checksJson is a JSON STRING, parsed defensively in the page.
  async getIngestionRuns(page = 1, pageSize = 20, source?: string): Promise<IngestionRunPage> {
    if (USE_FIXTURES) return fx.fxIngestionRuns(page, pageSize, source);
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (source) q.set('source', source);
    return request<IngestionRunPage>(`/api/admin/ingestion/runs?${q.toString()}`);
  },

  // Ingestion service control (Admin JWT). Both are POSTs with NO body — the action is
  // the route, there is nothing to wrap. Accepted answers are 202, not 200:
  //   start -> 202 { batchId }        · 409 { error: "already_running" }
  //   stop  -> 202 {}                 · 409 { error: "not_running" | "not_stoppable" }
  // The 409s arrive as ApiError with `.code` set; a 409 always means the caller's
  // status snapshot was wrong, so the caller must refetch the status either way.
  // Start runs ONE INGESTION PASS only — verification, feature building and training
  // stay with the nightly pipeline and are not triggered from here.
  async startIngestionService(): Promise<IngestionServiceStartResult> {
    if (USE_FIXTURES) {
      // The fixture returns the refusal instead of throwing (fixtures.ts must not import
      // this module), so the 409 is shaped HERE — identically to the live path, where
      // the body carries no errors[] envelope and the message stays "HTTP 409".
      const r = fx.fxStartIngestionService();
      if (!r.ok) throw new ApiError('HTTP 409', 409, r.code);
      return { batchId: r.batchId };
    }
    return request<IngestionServiceStartResult>('/api/admin/ingestion/service/start', {
      method: 'POST',
    });
  },

  // Stop can only cancel a pass this API hosts. A pass started by the scheduled worker
  // answers 409 not_stoppable — the UI must say that, never silently no-op.
  async stopIngestionService(): Promise<IngestionServiceStopResult> {
    if (USE_FIXTURES) {
      const r = fx.fxStopIngestionService();
      if (!r.ok) throw new ApiError('HTTP 409', 409, r.code);
      return {};
    }
    return request<IngestionServiceStopResult>('/api/admin/ingestion/service/stop', {
      method: 'POST',
    });
  },

  // Logs hub: both routes are Admin-only and return the server-paged
  // {items,page,pageSize,total} envelope.
  // GET /api/admin/logs/training -> training runs, newest first. No filter param.
  async getTrainingRuns(page = 1, pageSize = 25): Promise<TrainingRunPage> {
    if (USE_FIXTURES) return fx.fxTrainingRuns(page, pageSize);
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return request<TrainingRunPage>(`/api/admin/logs/training?${q.toString()}`);
  },

  // GET /api/admin/logs/user-activity. Two mutually exclusive OPTIONAL filters, both
  // built from known wire strings only (the server 400s anything else): `type` is one
  // event type, `types` is a comma-separated OR-set. Send one or the other, NEVER both
  // — `type` wins because it is the narrower request.
  async getUserActivity(
    page = 1,
    pageSize = 25,
    filter: { type?: string; types?: readonly string[] } = {},
  ): Promise<UserActivityPage> {
    if (USE_FIXTURES) return fx.fxUserActivity(page, pageSize, filter);
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filter.type) q.set('type', filter.type);
    else if (filter.types?.length) q.set('types', filter.types.join(','));
    return request<UserActivityPage>(`/api/admin/logs/user-activity?${q.toString()}`);
  },

  // GET /api/admin/logs/errors -> unhandled server exceptions, newest first and
  // server-paged. No filter param.
  async getSystemErrors(page = 1, pageSize = 25): Promise<SystemErrorPage> {
    if (USE_FIXTURES) return fx.fxSystemErrors(page, pageSize);
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return request<SystemErrorPage>(`/api/admin/logs/errors?${q.toString()}`);
  },
};

export const apiMode = USE_FIXTURES ? 'fixtures' : 'live';
