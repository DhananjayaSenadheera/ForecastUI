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
  BestCrop,
  Crop,
  CropCreateCommand,
  CropTimeline,
  HarvestForecast,
  Market,
  MarketOverview,
  PriceHistoryPoint,
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5282';
const USE_FIXTURES = import.meta.env.VITE_API_MODE === 'fixtures';

/** Thrown for non-2xx responses / network failures; carries a human message. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// --- auth hook point (R2) -----------------------------------------------------
// R1 is anonymous read. When JWT auth lands, resolve the in-memory token here and
// merge Authorization into the request headers. Kept commented so R1 ships no auth.
//   let authToken: string | null = null;
//   export function setAuthToken(t: string | null) { authToken = t; }
function authHeaders(): Record<string, string> {
  // return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  return {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
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
};

export const apiMode = USE_FIXTURES ? 'fixtures' : 'live';
