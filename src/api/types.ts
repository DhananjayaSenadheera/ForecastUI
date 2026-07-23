// =============================================================================
// AgriForecast typed API contract (FE-2). Audited against the LIVE .NET API on
// 2026-07-10 (ForecastController, CropController + Application DTOs/enums).
//
// SERIALIZATION NOTE (load-bearing): the API registers NO JsonStringEnumConverter,
// so C# enums serialize as INTEGERS, while string properties pass through as-is.
//   - HarvestForecast.confidence  -> STRING "Low" | "Medium" | "High"  (frozen)
//   - HarvestForecast.recommendationLevel -> NUMBER 0..3 (RecommendationLevel enum)
//   - BestCrop.confidence -> NUMBER 0..2 (ForecastConfidence enum)  <-- NOT a string
//   - BestCrop.trend      -> NUMBER 0..2 (PriceTrend enum)
//   - BestCrop.recommendationLevel -> NUMBER 0..3
// The "Low"/"Medium"/"High" STRINGS are frozen in the contract — only the display
// label is translated (Low->"Low"/අඩුයි/குறைவு, Medium->"Fair", High->"Good").
// =============================================================================

/** Frozen confidence contract strings (harvest forecast passes these through). */
export type ConfidenceString = 'Low' | 'Medium' | 'High';

/** RecommendationLevel enum (Domain.Enums.RecommendationLevel) — integer wire value. */
export enum RecommendationLevel {
  NotRecommended = 0,
  RecommendedWithRisk = 1,
  Recommended = 2,
  StronglyRecommended = 3,
}

/** PriceTrend enum (Domain.Enums.PriceTrend) — integer wire value. */
export enum PriceTrend {
  Down = 0,
  Stable = 1,
  Up = 2,
}

/** ForecastConfidence enum (Domain.Enums.ForecastConfidence) — integer wire value. */
export enum ForecastConfidenceCode {
  Low = 0,
  Medium = 1,
  High = 2,
}

// ---------------------------------------------------------------------------
// Crops — GET /api/crops/get/all , GET /api/crops/get/{id}
// (Crop_GetDto is thin TODAY; CropCode / category / agronomy / localized names
// are API gap #3 — not yet on the live route.) FE-3 consumes them as OPTIONAL so
// the crop picker degrades gracefully: no category -> a single "All crops" group;
// no localized name -> the English `name` is shown/searched. Fixtures fill these
// in for realistic dev; live payloads may omit them and the UI must not break.
// ---------------------------------------------------------------------------

/** Crop category ref (CropCategories table). code = VEG | FRT | VEG-UP | VEG-LOW. */
export interface CropCategoryRef {
  code: string;
  name: string; // English name from the API; UI localizes by code where possible
}

export interface Crop {
  id: string; // Guid
  name: string;
  externalProductId: number | null;
  source: string | null;
  createdAt: string; // ISO datetime
  updatedAt: string;
  // ---- API gap #3 (optional; present in fixtures, may be absent live) ----
  cropCode?: string | null; // VEG######/FRT###### — display only
  category?: CropCategoryRef | null; // grouping; absent -> single group
  growthDays?: number | null; // typical growth period (agronomy profile)
  nameSi?: string | null; // localized display name (Sinhala)
  nameTa?: string | null; // localized display name (Tamil)
}

// POST /api/crops/create — body is the CropCreateCommand (createDto wrapper).
// The Feb scaffold sent { createDto: { name } } which is now WRONG: category is
// mandatory (CropCategories table) and codes are VEG######/FRT######.
export interface CropCreateDto {
  name: string;
  externalProductId?: number | null;
  source?: string | null;
  cropCategoryId: string; // Guid — REQUIRED, must exist in CropCategories
}
export interface CropCreateCommand {
  createDto: CropCreateDto;
}

// ---------------------------------------------------------------------------
// Structured "why this forecast?" factor (FE-6) — PROVISIONAL, gated on API-5.
//
// CONTRACT PROPOSAL for agri-dotnet (API-5, blocked until after 2026-07-16):
// the LIVE HarvestForecast today carries ONLY free-text `explanation`/`reason`,
// which are NOT translatable. API-5 should add an OPTIONAL `topFactors` array of
// STABLE REASON CODES so the UI can map each to farmer-language i18n strings
// (that is the entire point: codes translate, English prose does not).
//
//   {
//     "code": "recent_price_trend",   // stable snake_case id -> i18n key
//                                      //   `factor.codes.<code>`; unknown codes
//                                      //   degrade (UI shows the raw code muted).
//     "direction": "up",              // "up" | "down" | "neutral" — glyph+word,
//                                      //   NEVER color-only, NEVER a verdict.
//     "weight": 0.9                    // OPTIONAL relative magnitude, positive;
//                                      //   compared on a SHARED scale within the
//                                      //   panel (max -> full bar). Unit-agnostic.
//   }
//
// Codes SHOULD map to real model features (price lags / rolling means, festival
// calendar, monsoon/season, planting extent). When `topFactors` is absent/empty
// (fallback predictor, or pre-API-5), the panel degrades to the free-text
// `explanation` + an honest "no detailed breakdown yet" note — never fabricated.
// ---------------------------------------------------------------------------
export type FactorDirection = 'up' | 'down' | 'neutral';

export interface ForecastFactor {
  /** Stable reason code; UI maps to `factor.codes.<code>` i18n label. */
  code: string;
  /** Which way this factor pushes the price. Rendered as glyph + word. */
  direction: FactorDirection;
  /** Optional relative magnitude (positive); shared-scale bar within the panel. */
  weight?: number;
}

// ---------------------------------------------------------------------------
// Harvest forecast — GET /api/forecast/crop/{cropId}/harvest?plantDate=YYYY-MM-DD
// (HarvestForecast_GetDto). The honest-uncertainty payload.
// ---------------------------------------------------------------------------
export interface HarvestForecast {
  cropId: string;
  cropName: string | null;
  plantDate: string; // "YYYY-MM-DD"
  harvestDate: string | null; // "YYYY-MM-DD"
  growthPeriodDays: number | null;
  currentPrice: number;
  predictedPrice: number; // central estimate (hero numeral)
  lowerBound: number; // P10 band floor
  upperBound: number; // P90 band ceiling
  confidence: ConfidenceString; // FROZEN string — translate label only
  activePredictor: string; // "residual" | "crop_mean_fallback" | ...
  modelVersion: string | null;
  explanation: string; // English prose today (reason codes = API gap #5)
  recommendationLevel: RecommendationLevel; // integer 0..3
  reason: string;
  upsidePct: number;
  intervalWidthPct: number;
  lowTrust: boolean; // true -> show "old data" notice with data age
  // ---- API-5 (optional; absent on the live route today, present in fixtures) ----
  topFactors?: ForecastFactor[] | null; // structured "why this forecast?" breakdown
}

// ---------------------------------------------------------------------------
// Timeline — GET /api/forecast/crop/{cropId}/timeline?months=12&asOf=YYYY-MM-DD
// (CropTimelineDto). Feeds FE-5 chart; a table alternative is mandatory.
// ---------------------------------------------------------------------------
export interface TimelineHistoryPoint {
  month: string; // "YYYY-MM"
  avgPrice: number;
}
export interface TimelineForecastPoint {
  horizonMonths: number;
  date: string; // "YYYY-MM-DD"
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
}
export interface CropTimeline {
  cropName: string | null;
  activePredictor: string; // "residual" | "crop_mean_fallback" | "unavailable"
  confidence: ConfidenceString;
  modelVersion: string | null;
  explanation: string;
  history: TimelineHistoryPoint[];
  forecast: TimelineForecastPoint[];
}

// ---------------------------------------------------------------------------
// Crop readiness — GET /api/forecast/crop-readiness (CropReadiness_GetDto).
// Feeds the crop-status colouring (owner request 2026-07-22): green "good
// forecast" for model-served crops, amber "collecting data" for fallback-served
// ones. `ready` MIRRORS the promoted model payload's real serving decision and
// is recomputed by every train run, so a crop that crosses the data gate flips
// automatically. HONESTY RULES (load-bearing):
//   - modelActive=false (no promoted model / ML degraded) => the per-crop split
//     is meaningless; the UI shows NO tint at all rather than painting every
//     crop amber (that would claim a data problem the payload can't support).
//   - A crop ABSENT from `crops` while modelActive => brand-new crop with no
//     payload entry at all — treated exactly like ready=false ("collecting").
//   - The endpoint failing entirely => fail-soft to no tint (never block the
//     page; readiness is decoration, not data).
// ---------------------------------------------------------------------------
export interface CropReadinessItem {
  cropId: string; // Guid
  ready: boolean;
  nObs: number | null; // labelled-row count; null = unknown (old payloads)
}
export interface CropReadiness {
  modelVersion: string | null;
  minHistoryObs: number | null;
  modelActive: boolean;
  crops: CropReadinessItem[];
}

// ---------------------------------------------------------------------------
// Best crops — GET /api/forecast/best-crops?lookbackMonths=3 (BestCrop_GetDto[]).
// NOTE the enum confidence here (integer), unlike the harvest string.
//
// CONTRACT GAP (FE-7): this row carries only `averagePrice` — NO P10–P90 band /
// lower–upper bounds (those live on the per-crop harvest/timeline routes). So the
// FE-7 comparison renders a SHARED-SCALE expected-price bar (all rows on one
// Rs. 0–max axis, lengths comparable, the expected price marked), NOT a fabricated
// range band. We never invent an interval this endpoint does not return.
// ---------------------------------------------------------------------------

/**
 * Season-fit (Yala/Maha) — PROVISIONAL shape, gated on API-3 / owner decision #5.
 * The LIVE best-crops route does NOT expose this yet; fixtures include it on a
 * couple of crops so the badge slot is demo-able. When absent the UI degrades
 * SILENTLY (no badge) — a live omission must never break the row.
 */
export interface SeasonFit {
  inSeason: boolean;
  season: string; // e.g. "Yala" | "Maha"
}

export interface BestCrop {
  cropId: string;
  cropName: string;
  cropCode: string; // VEG######/FRT######
  averagePrice: number;
  trend: PriceTrend; // integer 0..2
  confidence: ForecastConfidenceCode; // integer 0..2
  recommendationLevel: RecommendationLevel; // integer 0..3
  seasonFit?: SeasonFit | null; // API-3 (provisional) — absent on the live route today
}

// ---------------------------------------------------------------------------
// Market overview — GET /api/forecast/market-overview?days=30 (MarketOverview_GetDto).
//
// CONTRACT (API-7 — LOCKED 2026-07-11; the .NET route is being built against this
// EXACT camelCase shape in parallel, so it must be consumed verbatim, NOT invented).
// Feeds the landing dashboard (FE-1 OverviewPage): KPI tiles + risers/fallers movers
// + a "latest prices" strip with per-crop sparklines. All fields are honest counts /
// observed prices the endpoint actually computes — the UI never fabricates a mover,
// a spark point, or a KPI the payload does not carry.
//
//   asOf            "YYYY-MM-DD" of the newest data in the window, or NULL when the
//                   window has NO data at all (null + empty arrays => honest
//                   "no market data yet" state; never a fake skeleton/number).
//   windowDays      the price window this snapshot summarises (echoes the `days` arg).
//   marketsWithData count of markets that reported at least one price in the window.
//   cropsWithData   count of crops that had at least one price in the window.
//   movers          up to 5 RISERS then up to 5 FALLERS (server order preserved as-is
//                   — never re-sorted client-side). `direction` is a STRING "up"|"down"
//                   rendered as glyph + word; movers are NEVER colour-coded (RED is
//                   reserved app-wide for the "Not recommended" verdict).
//   latestPrices    up to 8 crops' most-recent observed price + a short sparkline.
//   spark           up to 14 chronological daily points; MAY be sparse/short — the
//                   sparkline degrades honestly (dot-only for 1 point, none for 0).
// ---------------------------------------------------------------------------

/** One riser/faller row. `direction` is the frozen wire string, not a colour. */
export interface MarketMover {
  cropId: string; // Guid — deep-links to /my-harvest?crop=<cropId>
  cropName: string;
  marketName: string;
  latestPrice: number;
  previousPrice: number;
  changePct: number; // signed percent change over the window
  direction: 'up' | 'down';
}

/** A single point in a latest-prices sparkline (observed daily price). */
export interface MarketSparkPoint {
  date: string; // "YYYY-MM-DD"
  price: number;
}

/** Latest observed price for one crop, with a short sparkline of recent days. */
export interface MarketLatestPrice {
  cropId: string; // Guid — deep-links to /my-harvest?crop=<cropId>
  cropName: string;
  marketName: string;
  date: string; // "YYYY-MM-DD" of the latest price
  price: number; // latest observed price (whole rupees)
  minPrice: number; // that day's observed low
  maxPrice: number; // that day's observed high
  spark: MarketSparkPoint[]; // up to 14 chronological points; may be sparse/short
}

export interface MarketOverview {
  asOf: string | null; // newest data date, or null when the window has no data
  windowDays: number;
  marketsWithData: number;
  cropsWithData: number;
  movers: MarketMover[]; // risers then fallers, server order preserved
  latestPrices: MarketLatestPrice[];
}

// ===========================================================================
// AUTH — FE-17. Contract AUDITED read-only against the live .NET backend on
// 2026-07-12 (AuthController + Application/Requests/Auth DTOs, commands,
// validators, handlers, JwtTokenGenerator, Program.cs CORS).
//
// ROUTES (AuthController, [ApiController] Route "api/auth", [AllowAnonymous],
//         [EnableRateLimiting("auth")] — stricter anti-brute-force limit):
//   POST /api/auth/register  body: { "registerDto": { username, email, password } }
//   POST /api/auth/login     body: { "loginDto":    { username, password } }
//   ^ BODIES ARE WRAPPED. The controller binds [FromBody] Register/LoginCommand,
//     and each command has a single property (RegisterDto / LoginDto). Sending the
//     bare DTO binds to nothing -> validation fails. This mirrors the crops
//     createDto wrapper already handled in client.ts.
//   ^ LOGIN IS BY USERNAME, not email. LoginDto has NO email field. The login
//     form's identity input must be labelled "username" and map to loginDto.username.
//
// SUCCESS 200 -> AuthResponseDto (below). ExpiresAtUtc is the JWT expiry (no
//   refresh token is issued — Generate() returns only (token, expiresAt)).
// REGISTER FAILURE -> 400 { errors: [ { property: "Auth", message } ] }
//   messages: "Username is already taken." / "Email is already registered." /
//   FluentValidation messages (username req/<=50, email req+valid+<=256,
//   password req + 8..128 chars).
// LOGIN FAILURE -> 401 { errors: [ { property: "Auth", message } ] }
//   message: "Invalid username or password." (same for unknown-user OR bad
//   password — deliberately non-enumerable; the UI shows it verbatim).
// Both error shapes match request()'s existing errors[0].message extraction.
//
// AUTHORIZATION MAP (all data routes require a Bearer token):
//   ForecastController  [Authorize]  (monthly, harvest, timeline, best-crops,
//                                     market-overview)
//   CropController      [Authorize]  (get/all, get/{id}, create)
//   MarketController    [Authorize]
//   AuthController      [AllowAnonymous]  (register + login only)
//
// NO refresh-token / silent-renew mechanism exists on the backend. In-memory
// token + page-refresh-loses-session is the deliberate R2 posture; the renew
// flow is flagged as a backend backlog item (see AuthContext).
//
// ⚠️ LIVE-LOGIN BLOCKER (FLAGGED to the hub, backend is read-only + on hold):
//   CORS is fail-closed. Program.cs reads Cors:AllowedOrigins and NEVER falls
//   back to AllowAnyOrigin (security fix F-07). The real appsettings.Development
//   .json carries NO Cors section, and the example lists only http://localhost
//   :5173 — but this app runs on :4173. Until the backend adds
//   "http://localhost:4173" to Cors:AllowedOrigins, the browser blocks every
//   cross-origin call (auth included) and LIVE mode cannot authenticate. FIXTURES
//   mode (VITE_API_MODE=fixtures, simulated auth) is unaffected and demoable now.
// ===========================================================================

/** POST /api/auth/{login,register} success body (Application AuthResponseDto). */
export interface AuthResponseDto {
  accessToken: string;
  expiresAtUtc: string; // ISO datetime — JWT expiry (no refresh token issued)
  username: string;
  email: string;
  role: string; // "Farmer" for self-registration
}

// ---------------------------------------------------------------------------
// Markets + price history — LIVE (API-1 / API-2, backend PR #24). The wire shapes
// below match the .NET DTOs EXACTLY (camelCase), so both routes are consumed
// verbatim with no mapping layer:
//   GET /api/markets/get/all?hasPrices={bool}         -> Market[]  (client.getMarkets / getAdminMarkets)
//   GET /api/prices/crop/{cropId}/history?marketId=&days=  -> PriceHistoryPoint[]  (client.getPriceHistory)
// (These were formerly the FE-proposed "API gaps #1/#2"; the backend adopted the
// proposed shapes, so the interfaces are unchanged.)
// ---------------------------------------------------------------------------
export interface Market {
  id: string;
  name: string;
  district: string | null;
  marketType: number; // MarketType enum (integer wire value) — see MarketType below
  isEconomicCenter: boolean;
}
export interface PriceHistoryPoint {
  date: string; // "YYYY-MM-DD"
  minPrice: number;
  maxPrice: number;
}

/** MarketType enum (Domain.Enums.MarketType) — integer wire value, verified against
 *  the .NET seeds 2026-07-12. NO JsonStringEnumConverter, so this arrives as an int. */
export enum MarketType {
  Wholesale = 0,
  Retail = 1,
  DEC = 2, // Dedicated Economic Centre
  NationalAggregate = 3,
}

// ===========================================================================
// ADMIN CONSOLE — Policy flags (ADM-2). GET /api/policy-flag/get/all is LIVE
// ([Authorize] bearer, base :5282, camelCase JSON). Audited read-only against the
// .NET PolicyFlagController + PolicyFlag_GetDto + PolicyType/PolicyDirection enums
// on 2026-07-12.
//
// SERIALIZATION: same as the forecast surface — NO JsonStringEnumConverter, so the
// enums serialize as INTEGERS. `direction` is NOT 0-based: Bearish = -1.
//
// EMPTY-RESULT QUIRK (load-bearing): the GetAll handler returns a FAILURE result
// ("No policy flags found.") when the list is empty — the controller maps that to
// HTTP 400, NOT a 200 with []. Likewise an ?asOfDate= with no active flags. The
// admin page treats a 400 on this route as the honest EMPTY state, not a hard error.
// ===========================================================================

/** PolicyType enum (Domain.Enums.PolicyType) — integer wire value. */
export enum PolicyType {
  Subsidy = 0,
  ImportBan = 1,
  ExportBan = 2,
  PriceCeiling = 3,
  PriceFloor = 4,
  FertiliserSubsidy = 5,
  FuelPriceChange = 6,
  Other = 7,
  Budget = 8,
}

/** PolicyDirection enum (Domain.Enums.PolicyDirection) — integer wire value.
 *  NOTE the -1: this is NOT a 0-based enum. */
export enum PolicyDirection {
  Bearish = -1, // expected to push prices down
  Neutral = 0,
  Bullish = 1, // expected to push prices up
}

/** GET /api/policy-flag/get/all -> PolicyFlag_GetDto[] (camelCase over the wire). */
export interface PolicyFlag {
  id: string; // Guid
  policyType: number; // PolicyType enum (integer)
  title: string;
  description: string | null;
  effectiveFrom: string; // ISO datetime
  effectiveTo: string | null; // ISO datetime | null (open-ended => still in effect)
  direction: number; // PolicyDirection enum (integer; Bearish = -1)
  source: string | null;
  referenceUrl: string | null;
  createdAtUtc: string; // ISO datetime
}

/** Derived client-side lifecycle status (NOT on the wire) — from effective dates. */
export type PolicyStatus = 'active' | 'scheduled' | 'expired';

// ---------------------------------------------------------------------------
// Policy-flag MUTATIONS (API-13 — LIVE, backend merged). Admin-only.
//   PUT    /api/policy-flag/update      body { policyFlagUpdateDto: PolicyFlagUpdateDto }
//   DELETE /api/policy-flag/delete/{id}
// Both return 200 PolicyFlagMutationResult. Full-object update (mirrors
// PolicyFlag_UpdateDto): every field is replaced, not patched. Source is REQUIRED
// on mutation (validator) — every edit carries a citation because policy flags are
// as-of-joined into the ML model's training features. Enums stay INTEGERS on the
// wire (policyType 0..8, direction -1/0/1); dates are date-only "YYYY-MM-DD".
// The update body wraps the DTO under `policyFlagUpdateDto` (mirrors the crops
// createDto wrapper) — the .NET command binds [FromBody] with a single property.
// ---------------------------------------------------------------------------
export interface PolicyFlagUpdateDto {
  id: string; // Guid of the row being edited
  policyType: number; // PolicyType enum (integer)
  title: string;
  description?: string | null;
  effectiveFrom: string; // "YYYY-MM-DD"
  effectiveTo?: string | null; // "YYYY-MM-DD" | null (open-ended)
  direction: number; // PolicyDirection enum (integer; Bearish = -1)
  source?: string | null; // REQUIRED on mutation (validator): ML-training provenance
  referenceUrl?: string | null;
}

/** Update/delete response (PolicyFlag_MutationResultDto). trainingDataWarning is
 *  non-null when the flag's effective window — the incoming OR the previous one —
 *  starts in the PAST: policy flags are as-of-joined into the model's training data,
 *  so editing/removing a past-dated flag rewrites history the model already learned
 *  from. The mutation still SUCCEEDED; the warning is informational (a retrain may be
 *  needed), NEVER an error. Future-only windows => trainingDataWarning is null. */
export interface PolicyFlagMutationResult {
  id: string; // Guid of the affected row
  trainingDataWarning: string | null;
}

// ===========================================================================
// ADMIN CONSOLE — PROVISIONAL wire shapes (ADM-4..7). These endpoints do NOT exist
// on the .NET API yet (owner scope-extension 2026-07-12: build the UI on fixtures now,
// connect real data after the backend hold lifts ~2026-07-16). Shapes are FE PROPOSALS
// — same convention as Market/PriceHistoryPoint above — to be confirmed with agri-dotnet.
// Every admin page that consumes these renders an honest "demo data" note in fixtures
// mode. Enums (eventType/direction) DELIBERATELY reuse PolicyType/PolicyDirection so the
// same tested mappers apply.
//
// STATUS UPDATE (ADM-6 indicators — LIVE, API-11 merged, audited read-only against
// IndicatorsController + Application/Requests/Indicators DTOs on 2026-07-16). The three
// read routes below now exist and are consumed verbatim (the DailyIndicatorPoint /
// MacroSeriesPoint / SeriesCatalogEntry shapes match the .NET DTOs 1:1, camelCase):
//   GET /api/indicators?code=&from=&to=          -> DailyIndicatorPoint[]  (client.getIndicatorDaily)
//   GET /api/macro-series?key=&from=&to=         -> MacroSeriesPoint[]      (client.getIndicatorMacro)
//   GET /api/indicators/catalog                  -> SeriesCatalogEntry[]    (client.getIndicatorCatalog)
// Params are literal: daily uses `code`, macro uses `key`. Empty -> 200 [] (never 404).
// Festivals (ADM-5, API-10) and News (ADM-7, API-12) are now LIVE — see FestivalEntry and
// NewsEvent + their mutation DTOs below. The entire admin console is live-wired.
// ===========================================================================

/** ADM-4 users. PROPOSAL. NOTE: User.Role is a STRING column on the backend (not an
 *  enum), so role is the literal 'Farmer' | 'Admin' string, not an int. */
export interface AdminUser {
  id: string; // Guid
  username: string;
  email: string;
  role: 'Farmer' | 'Admin';
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/** Body of POST /api/users/create (Admin-only account provisioning). Mirrors the public
 *  register fields and adds `role`, which self-registration does not have (a self-registered
 *  account is always a Farmer). The password is the initial one the admin hands to the user
 *  out-of-band; the response is a plain AdminUser — deliberately NO token, so creating an
 *  account never touches the acting admin's own session. */
export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role: 'Farmer' | 'Admin';
}

// ---------------------------------------------------------------------------
// ADM-5 festival calendar — LIVE (API-10, backend merged). Audited read-only against
// FestivalCalendarController + Application/Requests/FestivalCalendar (DTOs, validators)
// on 2026-07-16. All camelCase, consumed verbatim:
//   GET    /api/festival-calendar/get/all           -> FestivalEntry[]  (200 [] on empty
//                                                       — NO policy-flag 400-on-empty quirk)
//   POST   /api/festival-calendar/create  [Admin]    body { festivalCalendarCreateDto } -> 200 true
//   PUT    /api/festival-calendar/update  [Admin]    body { festivalCalendarUpdateDto } -> 200 FestivalMutationResult
//   DELETE /api/festival-calendar/delete/{id} [Admin]                                    -> 200 FestivalMutationResult
// Validators (mirror client-side): festivalKey required ^[A-Z0-9_]+$ <=50 (OPEN set); date
// required (date-only); leadUpDays 0..90 — 0 is a FIRST-CLASS value (paired-day continuation
// convention); source REQUIRED on create AND update; isProvisional passthrough.
// WIRE NOTE: `date` arrives as "YYYY-MM-DDT00:00:00" (like PolicyFlag.effectiveFrom) — slice to
// 10 before formatDate()/date-input prefill (formatDate re-appends T00:00:00). One row PER
// occurrence-year (movable festivals repeat each year). This table feeds the forecasting model,
// so mutations carry a trainingDataWarning + Source is required on save.
// ---------------------------------------------------------------------------
export interface FestivalEntry {
  id: string; // Guid
  festivalKey: string; // e.g. 'AVURUDU' | 'THAI_PONGAL' | 'CHRISTMAS' | 'VESAK' | 'DEEPAVALI'
  date: string; // occurrence date — live sends "YYYY-MM-DDT00:00:00"; slice(0,10) for display
  leadUpDays: number; // demand build-up window (default 14); 0 is a valid paired-day value
  isProvisional: boolean; // date not yet officially confirmed
  source: string | null;
  createdAtUtc: string; // ISO datetime
}

/** POST /api/festival-calendar/create body wraps this under `festivalCalendarCreateDto` (mirrors
 *  the crops createDto / policyFlagUpdateDto wrappers). source REQUIRED (validator). */
export interface FestivalCreateDto {
  festivalKey: string; // uppercase ^[A-Z0-9_]+$ (open set)
  date: string; // "YYYY-MM-DD" (date-only)
  leadUpDays: number; // 0..90; 0 allowed (paired-day convention)
  isProvisional: boolean;
  source: string; // required on mutation
}

/** PUT /api/festival-calendar/update body wraps this under `festivalCalendarUpdateDto`.
 *  Full-object update = create fields + the id of the row being edited. */
export interface FestivalUpdateDto extends FestivalCreateDto {
  id: string; // Guid of the row being edited
}

/** Update/delete response (FestivalCalendar_MutationResultDto). IDENTICAL shape to
 *  PolicyFlagMutationResult — festival dates are as-of-joined into the model's training data
 *  (lead-up demand windows), so mutating a PAST-dated festival returns a non-null
 *  trainingDataWarning. The mutation still SUCCEEDED; the warning is informational, NEVER an
 *  error. Future-dated => null. Reuses PolicyFlagMutationResult's shape (shared contract). */
export type FestivalMutationResult = PolicyFlagMutationResult;

/** ADM-6 daily indicator point (e.g. USD_LKR). PROPOSAL. */
export interface DailyIndicatorPoint {
  date: string; // "YYYY-MM-DD"
  indicatorCode: string; // 'USD_LKR'
  value: number;
  source: string | null;
}

/** ADM-6 vintage-aware macro point (e.g. CCPI). LIVE (API-11, matches
 *  MacroSeriesPoint_GetDto). BOTH dates are load-bearing and MUST always be shown
 *  together — never collapse them:
 *   referenceDate = the period the figure describes (e.g. month end);
 *   publishedAt   = when the figure became knowable (release date, weeks later).
 *  MULTIPLE vintages of the SAME referenceDate can appear (a later publishedAt revises
 *  an earlier estimate). For a single-value display the latest publishedAt wins, but the
 *  UI must NOT silently discard the superseded rows — it surfaces that a revision exists. */
export interface MacroSeriesPoint {
  seriesKey: string; // e.g. 'CCPI_BASE2021' | 'CCPI_HEADLINE_YOY_BASE2021'
  referenceDate: string; // "YYYY-MM-DD" — period described
  publishedAt: string; // "YYYY-MM-DD" — when knowable
  value: number;
  source: string | null;
}

/** ADM-6 series-catalog entry — GET /api/indicators/catalog (SeriesCatalog_GetDto).
 *  One unified directory across BOTH data sources with a `kind` discriminator telling the
 *  picker which route/method to call: 'indicator' -> getIndicatorDaily (GET /api/indicators
 *  ?code=key); 'macro' -> getIndicatorMacro (GET /api/macro-series?key=key). Rows are
 *  server-ordered indicator-before-macro, then by key. Empty DB -> 200 []. */
export interface SeriesCatalogEntry {
  key: string; // IndicatorCode (daily) or SeriesCode (macro)
  kind: 'indicator' | 'macro';
  latestDate: string; // "YYYY-MM-DD" — max Date / max ReferenceDate in the series
  count: number; // number of rows in the series
}

/** Known macro series keys the Indicators page reads (both live in the catalog). The
 *  page discovers series via the catalog but pins these two for its two visualisations:
 *  the INDEX level (line chart) and the ready-made headline YoY inflation (gauge). */
export const CCPI_INDEX_KEY = 'CCPI_BASE2021';
export const CCPI_YOY_KEY = 'CCPI_HEADLINE_YOY_BASE2021';

// ---------------------------------------------------------------------------
// ADM-7 structured news event — LIVE (API-12, backend merged). Audited read-only against
// NewsEventController + Application/Requests/NewsEvents (DTOs, validators) on 2026-07-16.
// All camelCase, enums as INTEGERS on the wire (no JsonStringEnumConverter). Owner decision:
// capture STRUCTURED events (facts + publish date), NOT manual point weights — the model
// learns weights later. eventType (NewsEventType 0..8) mirrors PolicyType member-for-member
// so the page reuses the PolicyType label mapper; direction reuses PolicyDirection (Bearish = -1).
//   GET    /api/news-events/get/all           [Authorize] -> NewsEvent[]  (newest publishedAt
//                                                             first; 200 [] on empty)
//   POST   /api/news-events/create   [Admin]  body { newsEventCreateDto } -> 200 true (boolean)
//   PUT    /api/news-events/update   [Admin]  body { newsEventUpdateDto } -> 200 Guid (string)
//   DELETE /api/news-events/delete/{id} [Admin]                            -> 200 Guid (string)
// CAPTURE-ONLY divergence from API-10/13: news events are NOT yet ML feature inputs, so there is
// deliberately NO trainingDataWarning and NO amber banner here. Mutation returns are BARE:
// create -> boolean, update/delete -> the affected Guid (NOT the {id, trainingDataWarning}
// MutationResult shape of PolicyFlags/Festivals). Validators (mirror client-side): title required
// <=300; description <=4000; eventType/direction defined-enum; publishedAt REQUIRED on create;
// sourceUrl optional but absolute http(s) if present; crop/market link ids must exist.
// WIRE NOTE: `publishedAt` (DateTime) may arrive as "YYYY-MM-DDT00:00:00" (like PolicyFlag/
// Festival dates) — slice(0,10) before formatDate() (formatDate re-appends T00:00:00).
// ---------------------------------------------------------------------------
export interface NewsEvent {
  id: string; // Guid
  eventType: number; // NewsEventType enum (integer; mirrors PolicyType 0..8)
  direction: number; // PolicyDirection enum (integer; Bearish = -1)
  title: string;
  description: string | null;
  publishedAt: string; // knowledge/vintage date — live may send "YYYY-MM-DDT00:00:00"; slice(0,10)
  sourceUrl: string | null;
  affectedCropIds: string[]; // optional multi-pick from the crops list
  affectedMarketIds: string[]; // ADDITIVE (API-12): storage-ahead-of-UI; no market picker yet — preserved verbatim on edit
  createdAtUtc: string; // ISO datetime
}

/** POST /api/news-events/create body wraps this under `newsEventCreateDto` (mirrors the crops
 *  createDto / policyFlagUpdateDto wrappers). publishedAt REQUIRED (the immutable vintage date).
 *  affectedMarketIds is optional passthrough — the FE has no market picker, so it is omitted on
 *  create today (backend is storage-ahead-of-UI). */
export interface NewsEventCreateDto {
  eventType: number; // 0..8 (defined-enum)
  direction: number; // -1 | 0 | 1
  title: string;
  description?: string | null;
  publishedAt: string; // "YYYY-MM-DD" — required on create, immutable afterwards
  sourceUrl?: string | null;
  affectedCropIds?: string[];
  affectedMarketIds?: string[];
}

/** PUT /api/news-events/update body wraps this under `newsEventUpdateDto`. Full-object update =
 *  create fields + the id, MINUS publishedAt: the vintage date is immutable BY CONSTRUCTION (the
 *  wire contract does not carry it, so it can never be rewritten). The edit UI shows publishedAt
 *  read-only and never sends it. affectedMarketIds is preserved verbatim from the stored row. */
export interface NewsEventUpdateDto {
  id: string; // Guid of the row being edited
  eventType: number;
  direction: number;
  title: string;
  description?: string | null;
  // NOTE: no publishedAt — immutable by construction (see NewsEvent block).
  sourceUrl?: string | null;
  affectedCropIds?: string[];
  affectedMarketIds?: string[];
}

/** One article the news INGESTION pipeline captured (the Python-owned NewsArticles table — the
 *  raw material behind the ML sentiment features). Read-only display feed on the admin News
 *  page; DISTINCT from the curated NewsEvent CRUD above — the two "news" stores never mix.
 *  GET /api/news-articles/get/latest?take=50 [Authorize] -> NewsArticle[], newest first (server
 *  clamps take: default 50, max 200; 200 [] when ingestion has never run).
 *  url is the row identity (the capture table's PK / dedupe key). Timestamps are naive UTC
 *  ("YYYY-MM-DDTHH:mm:ss", NO Z suffix — the Python loader's convention); publishedDateUtc is
 *  null when the source feed omitted a publish date — fall back to retrievedAtUtc for display.
 *  title/summary may contain HTML entities (&#8217; etc.) — decode before rendering. */
export interface NewsArticle {
  url: string;
  source: string; // short feed key, e.g. "lbo"
  title: string;
  summary: string;
  publishedDateUtc: string | null;
  retrievedAtUtc: string;
  language: string; // e.g. "en"
  /** Per-article agri topic flags from the Python scorer, as a stable-order CSV
   *  ("flood,drought"). '' = scored, no topic fired (general news); null = not yet
   *  scored. The FE derives the category badge + direction from this (src/lib/news.ts). */
  topics: string | null;
  /** VADER compound sentiment in [-1, 1]; null = not yet scored. */
  sentimentScore: number | null;
}

// =============================================================================
// ADMIN CONSOLE — INGESTION RUNS (admin ingestion API — contract LIVE-verified
// against the dev DB). Two read-only routes behind an Admin JWT (401/403 handled by
// the existing client interceptor): GET /api/admin/ingestion/status (a snapshot) and
// GET /api/admin/ingestion/runs (server-paged history). All camelCase, consumed
// verbatim. Timestamps are Z-suffixed UTC. run.verification.checksJson is a JSON
// STRING — parse defensively (parseVerificationChecks) and NEVER crash on bad JSON.
// =============================================================================

/** Ingestion-service lifecycle state (top of the status snapshot). */
export type IngestionState = 'running' | 'stopped' | 'unknown';

/** Per-run status (each row). "skipped" = a scheduled run that found nothing new. */
export type IngestionRunStatus = 'running' | 'succeeded' | 'failed' | 'skipped';

/** Last-run rollup on the status snapshot ("partial" = some sources failed). */
export type IngestionLastRunStatus = 'succeeded' | 'partial' | 'failed';

/** Verification verdict (frozen spelling — only the display LABEL is translated). */
export type VerificationVerdict = 'Pass' | 'Warn' | 'Fail';

/** Per-source health status in the status snapshot. */
export type IngestionSourceStatus = 'ok' | 'disabled' | 'failed';

/** The 7 valid `source` filter keys. An unknown key -> the API answers 400. */
export const INGESTION_SOURCES = [
  'DAMBULLA_DEC',
  'WEATHER',
  'ECONOMIC',
  'NEWS',
  'HARTI',
  'CBSL',
  'CBSL_MACRO',
] as const;
export type IngestionSourceKey = (typeof INGESTION_SOURCES)[number];

/** One source's health row on the status snapshot. */
export interface IngestionSourceHealth {
  source: string; // one of INGESTION_SOURCES (kept as string — never crash on a new key)
  status: IngestionSourceStatus;
  lastSuccessUtc: string | null;
  lastObservedDate: string | null; // "YYYY-MM-DD" of the newest data row this source has
  lastMessage: string | null;
}

/** Verification rollup counts (shared by status.lastVerification + run.verification). */
export interface IngestionVerificationSummary {
  overallStatus: VerificationVerdict;
  ranAtUtc: string;
  pipelineDate?: string; // present on status.lastVerification; absent on a run's verification
  nChecksPass: number;
  nChecksWarn: number;
  nChecksFail: number;
}

/** GET /api/admin/ingestion/status — the pipeline snapshot (Admin JWT). */
export interface IngestionStatus {
  state: IngestionState;
  serviceAddress: string; // e.g. "unconfigured" — rendered verbatim from the payload
  lastRunAtUtc: string | null;
  lastRunStatus: IngestionLastRunStatus | null;
  lastVerification: IngestionVerificationSummary | null;
  sources: IngestionSourceHealth[];
}

/** A run's verification block. checksJson is a JSON STRING (parse defensively). */
export interface IngestionRunVerification extends IngestionVerificationSummary {
  /** JSON STRING encoding VerificationCheck[]. Parse with parseVerificationChecks. */
  checksJson: string;
}

/** One ingestion run (a row in the runs list). */
export interface IngestionRun {
  id: string;
  batchId: string;
  source: string;
  startedUtc: string;
  finishedUtc: string | null;
  status: IngestionRunStatus;
  coveredFromDate: string | null;
  coveredToDate: string | null;
  rowsFetched: number | null;
  rowsInserted: number | null;
  rowsSkipped: number | null;
  distinctCrops: number | null;
  errorSummary: string | null;
  verification: IngestionRunVerification | null;
}

/** GET /api/admin/ingestion/runs — server-paged envelope ({items,page,pageSize,total}). */
export interface IngestionRunPage {
  items: IngestionRun[];
  page: number;
  pageSize: number;
  total: number;
}

// =============================================================================
// ADMIN CONSOLE — LOGS HUB Phase 2 (Model training + User activity). Both routes
// sit behind an Admin JWT (401/403 flows through the existing client interceptor —
// ZERO new auth code) and return the SAME server-paged envelope as ingestion runs
// ({items,page,pageSize,total}). All camelCase, timestamps Z-suffixed UTC, consumed
// verbatim. Contracts FROZEN, live on the backend branch.
// =============================================================================

/** One model-training run — GET /api/admin/logs/training (ordered TrainedAtUtc DESC).
 *  HONESTY NOTE (load-bearing): `promoted` (currently LIVE — exactly one row true) and
 *  `decisionPromoted` (the promotion GATE's verdict at train time) are INDEPENDENT.
 *  promoted=true && decisionPromoted=false is a MANUAL OVERRIDE — both are surfaced,
 *  never collapsed, and promotionDecision explains why. MAE fields may be null when a
 *  kind produced no scorable model. */
export interface TrainingRun {
  version: string;
  trainedAtUtc: string; // ISO Z
  promoted: boolean; // currently the LIVE served model (exactly one row true)
  decisionPromoted: boolean; // the promotion gate's verdict at train time
  promotionDecision: string | null; // free-text decision detail (drill-down; verbatim)
  bestMlKind: string | null;
  bestMlMae: number | null;
  bestBaselineKind: string | null;
  bestBaselineMae: number | null;
  nTrainRows: number | null;
  nCrops: number | null;
}

/** GET /api/admin/logs/training — server-paged envelope. */
export interface TrainingRunPage {
  items: TrainingRun[];
  page: number;
  pageSize: number;
  total: number;
}

/** The five frozen user-activity event-type wire strings. The server 400s any other
 *  `type` filter value — the client sends OMIT (all) or one of these EXACT strings,
 *  never free text. */
export const USER_ACTIVITY_EVENT_TYPES = [
  'loginSucceeded',
  'loginFailed',
  'userRegistered',
  'roleChanged',
  'userDeleted',
] as const;
export type UserActivityEventType = (typeof USER_ACTIVITY_EVENT_TYPES)[number];

/** One user-activity event — GET /api/admin/logs/user-activity (ordered OccurredUtc
 *  DESC). actorUserId/targetUserId are GUIDs (rendered truncated, full value in title);
 *  usernameAttempted is populated on a loginFailed (an UNVERIFIED attempt, shown quoted). */
export interface UserActivityEvent {
  occurredUtc: string; // ISO Z
  eventType: UserActivityEventType;
  actorUserId: string | null; // Guid
  targetUserId: string | null; // Guid
  usernameAttempted: string | null; // present on loginFailed (unverified)
  details: string | null;
}

/** GET /api/admin/logs/user-activity — server-paged envelope. */
export interface UserActivityPage {
  items: UserActivityEvent[];
  page: number;
  pageSize: number;
  total: number;
}

// =============================================================================
// ADMIN CONSOLE — LOGS HUB Phase 3 (System errors). GET /api/admin/logs/errors
// sits behind an Admin JWT (401/403 flows through the existing client interceptor —
// ZERO new auth code) and returns the SAME server-paged envelope as the other tabs
// ({items,page,pageSize,total}), ordered OccurredUtc DESC server-side. No filter —
// page/pageSize only. All camelCase, timestamps Z-suffixed UTC, consumed verbatim.
// Contract FROZEN, live on the backend branch.
// =============================================================================

/** One unexpected server error (an unhandled 500) — GET /api/admin/logs/errors
 *  (ordered OccurredUtc DESC). Only unhandled exceptions land here; 400-type client
 *  mistakes are NOT logged. `traceId` matches the id shown to the user who hit the
 *  error, so an admin can tie a report back to a row. Every field after id/source is
 *  nullable; `stackTrace` can be up to 8000 chars (shown in a scrollable drill-down). */
export interface SystemError {
  id: number;
  occurredUtc: string; // ISO Z
  source: string; // e.g. "API" — rendered verbatim
  exceptionType: string; // e.g. "System.InvalidOperationException"
  message: string | null;
  path: string | null; // request path only (no query/host)
  method: string | null; // HTTP method of the failing request
  traceId: string | null; // matches the id shown to the user who hit the error
  stackTrace: string | null; // up to 8000 chars; drill-down only
}

/** GET /api/admin/logs/errors — server-paged envelope. */
export interface SystemErrorPage {
  items: SystemError[];
  page: number;
  pageSize: number;
  total: number;
}

/** One parsed element of run.verification.checksJson. `severity` is defensive (any
 *  string) so a new backend severity never crashes the parse; the UI tones only the
 *  known PASS/WARN/FAIL values and shows the rest neutrally. */
export interface VerificationCheck {
  name: string;
  severity: string; // "PASS" | "WARN" | "FAIL"
  message: string;
  counts?: Record<string, unknown>;
}
