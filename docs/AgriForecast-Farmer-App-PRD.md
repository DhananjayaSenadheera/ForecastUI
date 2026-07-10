# AgriForecast Farmer App — Project Requirements Document

**Version 1.1 · 2026-07-10 · Status: SIGNED OFF by owner 2026-07-10 (see §12 Amendments)**
Owner: Dhananjaya Senadheera · Prepared from: field research synthesis (24 sources), .NET API audit (2026-07-09), ForecastUI repo audit.

---

## 1. Vision

A free, trilingual (Sinhala / Tamil / English), mobile-first web app that helps Sri Lankan smallholder farmers make two decisions with confidence:

1. **"What should I plant now?"** — ranked crop recommendations for the coming season.
2. **"If I plant X today, what will it be worth at harvest?"** — an honest price forecast with plain-language confidence.

The app is designed **for humans first**: voice-assisted, numbers-first, shallow navigation, readable in direct sunlight, and honest about uncertainty. It is *not* a dashboard for agronomists.

---

## 2. Who we are building for (research findings)

Evidence level: ✅ = verified against primary source (Dept. of Census & Statistics 2024 bulletin), ◐ = single credible source, not independently verified.

### 2.1 The Sri Lankan farmer as a digital user
- ✅ The smartphone is the internet device in rural Sri Lanka: **81.7% of rural internet device use is a smartphone** (92.6% in the estate sector); desktop/laptop is 15.9%. Mobile-first is not a preference, it is the platform. *(DCS Computer Literacy Bulletin 2024)*
- ✅ **Digital literacy is 63.7% rural / 44.6% estate** — roughly **1 in 3 rural users cannot independently operate a smart device**. *(DCS 2024)*
- ◐ Digital literacy collapses with age: 87% at 30–34 → 44% at 50–59 → 25% at 60–69. Most smallholders sit in the low bands. *(DCS 2024)*
- ◐ Computer literacy among Sinhala-literate (41.9%) and Tamil-literate (42.5%) people is far below English-literate (74%) — **the app must default to Sinhala/Tamil, English is the fallback**. *(DCS 2024)*
- ◐ Dialog assesses farmer smartphone penetration at only ~35%; **90% of Govi Mithuru's 1.1M users choose the IVR voice channel over the app**. Voice/audio is not an accessibility extra here — it is the mainstream channel. *(Market Development Facility briefing 2025)*
- ◐ Data affordability is real and gendered: women recharge mainly for voice, data packs skew male. Keep the app's data footprint minimal. *(GSMA Sri Lanka fieldwork)*
- ◐ Farmers already get prices from HARTI's **6666 IVR line** (Sinhala/Tamil, 8 markets) and from middlemen; trust in digital services has historically come from **government (DOA/HARTI) data provenance**. *(MDF 2025, GSMA)*

### 2.2 Lessons from existing Sri Lankan agri apps
- ◐ **Govi Mithuru** (Dialog, 2014→): 1.1M users, 36 crops. What worked: DOA-sourced content (trust), voice-first delivery, human village agents (churn 40%→10%). Barriers: awareness, older farmers preferring in-person advice. *(MDF 2025)*
- ◐ **Helaviru** (2020): B2B produce marketplace; deliberately added SMS/IVR/call-centre fallbacks — its builders judged app-only unviable for this audience.
- ◐ A 2025 systematic review (KDU): **no integrated national platform exists**; the landscape is fragmented and government agency apps go largely unused (documented in Bulathsinhala 2018 study). Existence ≠ adoption; **the failure mode of our predecessors is building for engineers, not farmers.**

### 2.3 Evidence-based UI patterns for low-literacy users (Medhi & Thies corpus, ICT4D)
- ◐ In a mobile-banking task, **0% of low-literacy users completed the task with a text UI, 72% with spoken dialog, 100% with a graphical UI** — icon/graphic-first design with audio support is evidence-backed, not aesthetic preference.
- ◐ **Semi-abstract hand-drawn illustrations beat both photographs and abstract icons** for comprehension (photos carry confusing detail; icons are too abstract). Pair every icon with a text label.
- ◐ **Non-literate users are numerate.** Show prices as big clear numerals — never hide the number behind prose.
- ◐ **Flat, linear navigation beats deep hierarchies** (7-page linear list outperformed a 4-level menu). Max navigation depth: 2.
- ◐ A **persistent audio-help affordance on every screen** measurably increases autonomous use and confidence.

### 2.4 Communicating forecast uncertainty (weather-forecast communication research)
- ◐ Numeric uncertainty **improves decisions for nearly everyone and harms no group** (Joslyn & LeClerc; Science 2010 corpus). Do not hide the range.
- ◐ BUT a bare min–max range misleads: users treat all values as equally likely and fixate on extremes. **Always show a highlighted central estimate inside the range.**
- ◐ **Natural frequencies beat percentages**: "in 7 of 10 similar seasons the price stayed above Rs. 180" is understood; "70% probability" is not.
- ◐ **Icon arrays (pictograph grids) are the best visual encoding of chance for low-numeracy audiences**; explanatory labels and numbers on the graphic are essential.
- ◐ **Vague verbal hedges ("it is possible…") and blanket disclaimers destroy trust.** Kenya RCT + Zimbabwe studies: farmers *can* use probabilistic forecasts after light onboarding, and value the service more when uncertainty is communicated well.
- Product mapping: our API's `Low / Medium / High` confidence + `LowTrust` flag + `Reason` string are the raw material. UI renders confidence as **icon + label + plain-language reason**, range as **band with bold central price**, and never shows a bare interval.

---

## 3. Personas

| | P1 · Sunil (58, Dambulla) | P2 · Tharindu (29, Kurunegala) | P3 · Meena (41, Nuwara Eliya) |
|---|---|---|---|
| Language | Sinhala only | Sinhala + English | Tamil first |
| Device | Shared family Android, small data packs | Own mid-range Android, comfortable with apps | Own budget Android |
| Digital literacy | Low — taps what he recognises, avoids typing | High — expects app-store polish | Medium — WhatsApp/YouTube user |
| Price info today | Middleman + 6666 IVR + radio | Facebook groups, HARTI site | Estate community, middleman |
| Needs from us | Big numbers, audio help, 2 taps to answer | Depth: charts, history, factors | Tamil UI that isn't an afterthought |
| Design guardrail | If Sunil can't use it, the design fails | Don't bore him, but never at Sunil's expense | Tamil strings/typography first-class |

---

## 4. Information architecture

Four top-level destinations (bottom tab bar, icon + label, no deeper than 2 levels):

1. **Home / Today** — greeting in chosen language; today's headline prices for *my crops*; primary CTA: "Check a crop price at harvest".
2. **Plant** (What should I plant?) — Best-crops ranked list → crop detail with recommendation level, planting-season fit (Yala/Maha), forecast summary.
3. **My crop** (Harvest forecast) — crop picker (illustrated grid, searchable) → plant-date selector (calendar defaulted to today) → **Result screen**: predicted price at harvest with confidence band, recommendation, reason, factor breakdown, 12-month timeline chart.
4. **Prices** — recent market prices & short history per crop/market *(requires API gap #2)*.

Cross-cutting: language switcher on first launch + always in header · persistent audio-help button (speaker icon) on every screen · offline banner with last-updated timestamp.

**Onboarding**: 3 screens max — language → district/market (optional) → pick your usual crops (optional, skippable). No registration wall for browsing; JWT login required only where the API demands it (see gap #6).

---

## 5. Design system

### 5.1 Color — recommended palette (post-research)

Political constraint (◐, counterpoint.lk + party research): in Sri Lanka **green = UNP, blue = SLFP, red = JVP/NPP (currently governing), maroon = SLPP**, and even white carries campaign symbolism. Saffron/orange is monastic. A farmer-trust app must not wear any party's jersey — so the brand color is **teal**, the one hue with agricultural affinity and no Sri Lankan party ownership. Leaf-green appears only as a *semantic* signal (good/recommended) inside components, never as brand surface.

| Role | Hex | Notes |
|---|---|---|
| Brand / primary actions | `#0F766E` teal-700 | Politically neutral, passes 4.5:1 on white |
| Brand dark (text on tint) | `#134E4A` teal-900 | |
| Surface | `#FFFFFF` / `#F8FAF9` | Max luminance for sunlight readability |
| Text primary | `#111827` (near-black) | ≥7:1 body contrast (sunlight target AAA) |
| Text secondary | `#4B5563` | Never lighter than this for meaningful text |
| Positive / Recommended | `#15803D` green-700 | Semantic only, always icon+label paired |
| Caution / Medium confidence | `#B45309` amber-700 | Not saffron-bright; dark enough for text |
| Risk / Low confidence | `#B91C1C` red-700 | Semantic only, small doses, never brand |
| Price emphasis | `#111827` on `#ECFDF5` tint | The number is the hero, in near-black |

Rules: color never encodes meaning alone (icon + label always); all text ≥4.5:1, body text target 7:1; no light-gray-on-white; big solid fills, no gradients (banding + sunlight washout).

### 5.2 Typography (trilingual)
- Stack: `'Noto Sans Sinhala', 'Noto Sans Tamil', 'Noto Sans', system-ui, sans-serif` — self-hosted subsets, current builds only (◐ the Noto Sinhala wrong-ascender defect was only fixed in 2020 builds — never use old cached/CDN binaries).
- ◐ **Sinhala & Tamil need more vertical room than Latin**: line-height ≥1.7 body / 1.8 for Tamil; **never use fixed-height containers with `overflow:hidden` on text** (clips Sinhala ascenders & Tamil vowel marks).
- ◐ Body minimum **16px** (never below 14px for any Tamil/Sinhala string); price numerals 28–40px bold.
- No `text-transform: uppercase` anywhere (meaningless/harmful for both scripts).
- Budget layouts for **string expansion**: Sinhala/Tamil labels run ~20–40% longer than English; buttons wrap, never truncate.

### 5.3 Components (build in this order)
Tokens → Button (48px min height) → Card → Badge (confidence) → PriceDisplay (numeral-first) → ConfidenceBand (range + bold central estimate) → IconArray (chance pictograph) → CropTile (illustrated) → Field/Select/DatePicker → Skeleton → AudioHelpButton → OfflineBanner → TimelineChart.

### 5.4 Uncertainty display pattern (the signature component)
```
┌─────────────────────────────────────┐
│  Capsicum · harvest ~15 Oct         │
│                                     │
│        Rs. 552 /kg                  │  ← central estimate, hero numeral
│   Rs. 233 ────────●──── Rs. 694     │  ← band with marked centre
│                                     │
│  ●●●○ Confidence: Good              │  ← icon + label, translated
│  "Based on 9 years of Dambulla      │
│   prices for this crop"             │  ← Reason, farmer language
│  🔊 (audio explanation)             │
└─────────────────────────────────────┘
```
Low-confidence/fallback responses show the same layout with the honest reason ("this crop does not yet have enough price history for the ML model") — **never dressed up as precise**. `LowTrust=true` adds a visible "old data" notice with the data age.

---

## 6. Feature scope

### MVP (Release 1)
1. Onboarding (language, optional district/crops) — no login for browsing.
2. Home with my-crops headline prices + primary CTA.
3. Crop picker (illustrated, searchable) + plant-date selector.
4. Harvest forecast result screen (uncertainty pattern above, factor breakdown collapsible).
5. Best-crops ranked list with recommendation levels.
6. 12-month timeline chart (history + forecast band, harvest marker).
7. Sinhala/Tamil/English i18n complete; audio-help on core screens (pre-recorded clips).
8. PWA baseline: installable, app-shell cached, last-fetched data readable offline with timestamp.

### Release 2
9. Market prices browser + short history (needs API #2).
10. Saved crops synced to account; login/registration screens (API #4).
11. Price alerts ("tell me when Beans passes Rs. 200") — needs API #7.
12. Yala/Maha planting-window hints on crop detail (API #3).

### Explicitly out of scope (this project)
Native app stores, payments/marketplace, chat/community, weather advisory (Govi Mithuru's territory), SMS/IVR channels (partner later — but keep all copy voice-scriptable).

---

## 7. Missing features — API gap list (owner-approved items go to .NET backlog, execute AFTER 2026-07-16 hold)

From the 2026-07-09 API audit; the UI cannot be built honestly without #1–#3.

| # | Gap | Needed by | Proposal |
|---|---|---|---|
| 1 | **No `GET /markets`** (create-only controller) | Prices, market context | `GET /api/markets` list: id, name, district, type, isEconomicCenter |
| 2 | **No price-history endpoint** | Prices screen, chart context | `GET /api/prices?cropId&marketId&from&to` (paginated) over MarketPrices |
| 3 | **Crop DTO too thin** — no CropCode, no category, no agronomy | Picker grouping, season hints, code display | Extend `Crop_GetDto`: cropCode, categoryCode/name, isForecastable, growthPeriodDays, yala/maha months (from verified profile) |
| 4 | **No `GET /auth/me`, no saved crops** | Personalisation, R2 | `/api/auth/me` + `/api/me/crops` (GET/PUT) |
| 5 | **No server strategy for translatable strings** — `Reason`/`Explanation` are hardcoded English prose | i18n integrity | Return stable reason **codes** + params alongside prose; client owns translations |
| 6 | **Everything except auth requires JWT** | Friction vs. research (registration walls kill adoption) | Owner decision: allow anonymous read for forecast/best-crops (rate-limited), or auto-guest account |
| 7 | No alerts/notification surface | R2 alerts | Deferred; design only |
| 8 | No pagination/filtering on list endpoints | Perf at 96+ crops | `page`,`search`,`categoryId` params on crops list |

UI-side missing pieces already incorporated in scope: audio-help layer, offline/PWA, confidence/uncertainty pattern, trilingual design system, illustrated crop imagery (commission ~30 semi-abstract SVG illustrations), sunlight-contrast QA.

---

## 8. Non-functional requirements
- **Performance**: ≤150KB JS gz on first load; TTI <3s on throttled 3G mid-tier Android; Lighthouse ≥90 perf/a11y/BP on mobile profile.
- **Accessibility**: WCAG 2.2 AA minimum (AAA contrast for body text); full keyboard paths; every chart has a text/table alternative; touch targets ≥44px.
- **Offline**: app shell + last data cached (service worker); explicit staleness banner; graceful API-down state.
- **Security**: no secrets in bundle; JWT in memory (not localStorage if feasible → owner decision); no PII logging; CSP.
- **Privacy/trust**: data provenance line on every price ("Source: HARTI / Dambulla DEC via Dept. of Agriculture data") — research shows government provenance is the #1 trust builder.
- **Testing**: unit tests for date/price/confidence formatting + i18n plumbing; Playwright happy-path per journey; manual sunlight + 360px + keyboard pass per release.

## 9. Validation plan
Design reviews at wireframe and hi-fi stages (owner sign-off gates). Before Release 1: hallway usability test with ≥5 real users spanning the three personas (task: "find what cabbage will sell for in October") — success = unaided completion by P1-type user. HCI review task (ClickUp 86cacw5yf) executes against this protocol.

## 10. Risks
| Risk | Mitigation |
|---|---|
| API gaps not built (backend hold until Jul 16) | UI built against typed client + fixtures; gaps are additive endpoints |
| Sinhala/Tamil translation quality | Native-speaker review before release; codes-not-prose from API (#5) |
| Audio content cost | MVP: core screens only, pre-recorded; TTS later |
| Farmers distrust a new app (documented pattern) | DOA/HARTI provenance surfaced; honest uncertainty; no registration wall |
| Political color misreading | Teal brand, semantic-only green/red, reviewed by owner |

## 11. Delivery plan (maps 1:1 to ClickUp)
FE-0 UX flows & wireframes (sign-off) → FE-1 design system & trilingual typography → FE-2 app scaffold (routing, i18n, API client, auth-ready) → FE-3 crop picker + date → FE-4 forecast result (uncertainty pattern) → FE-5 timeline chart → FE-6 factor panel → FE-7 best-crops → FE-8 i18n completion + audio help → FE-9 PWA/offline + hardening → FE-10 farmer usability test + HCI review. API-1…API-8 tracked separately, unblocked 2026-07-16.

## 12. Amendments (owner decisions, 2026-07-10 — supersede conflicting text above)

1. **PRD signed off** by owner 2026-07-10 ("i am agree with prd").
2. **API gap #6 decided: anonymous read** — forecast/best-crops open without login, rate-limited. No auth screens in R1; auth/saved-crops = R2. Backend change to API backlog (after 2026-07-16 hold).
3. **Web application first** — the desktop web experience is the primary design target; §2's "mobile-first" now means the mobile layout is the responsive adaptation, built second. Mobile NFRs (§8: 360px support, ≤150KB JS, 3G TTI) still apply unchanged.
4. **Rich data-representation layer** — charts, graphs, tables and comparisons wherever they aid understanding (timeline + confidence band with table alternative, price-history chart + sortable table, crop-vs-crop shared-scale comparison, market-vs-market comparison, 12-month seasonality strip), governed by standard HCI/data-viz principles (one message per chart, direct labels, table alternative per graphic, no dual axes/3D, color-blind-safe palettes) and this PRD's honest-uncertainty rules.
5. **FE-0 wireframe decisions:** confidence wording stays "Low / Fair / Good" (may revise later); Prices nav item = visible "coming soon" stub in R1; horizon control = **exact harvest-date picker** (fixed 1/3/6-month chips dropped; date pre-suggested from plant date + growth period once API #3 exists); natural-frequency phrasing only if the API exposes it (never fabricated); Yala/Maha season fit designed now, gated behind API #3.
6. **Desktop shell = DASHBOARD style** — dark sidebar navigation, top filter bar (market/date), KPI tile row, panel composition (related data on one screen; workspace screens pin crop/plant-date/harvest-date controls left). Normative reference: `docs/dashboard-style-samples-v1.html`. §4's 4-tab IA maps to the sidebar on desktop and remains bottom tabs on mobile. FE-1 amber-for-low-confidence mapping (red reserved for "Not recommended") also supersedes §5.1's Low→red.

---
*Sources: Dept. of Census & Statistics LK 2024 Computer Literacy Bulletin (verified); Market Development Facility Sri Lanka briefing 2025; GSMA mAgri Sri Lanka HCD case study; KDU 2025 systematic review (ir.kdu.ac.lk/345/9082); Medhi, Thies et al. text-free UI corpus (2006–2015); Joslyn & LeClerc uncertainty-communication studies; NOAA weather-communication review; Zimbabwe/Kenya probabilistic-forecast field studies (Cambridge, Frontiers); Noto fonts issue #660; tamilui.com typography guide; counterpoint.lk color-politics essay. Claims marked ◐ are single-source; the two DCS statistics marked ✅ were adversarially verified.*
