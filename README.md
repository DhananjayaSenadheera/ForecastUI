# ForecastUI — AgriForecast Farmer App

The trilingual, offline-capable web app that puts
[AgriForecast](https://github.com/DhananjayaSenadheera/Agri_Forecast) in a Sri Lankan
smallholder farmer's hands.

It answers two questions: **"what should I plant now?"** and **"what will my crop be worth when
I harvest it?"** — in Sinhala, Tamil or English, on a low-end phone, on an unreliable connection.

The hard part isn't rendering a number. It's rendering an *honest* one: showing uncertainty
without hiding the answer, never dressing a fallback prediction up as a precise forecast, and
never letting a farmer mistake yesterday's cached price for today's live one.

---

## Contents

- [What it does](#what-it-does)
- [Design principles](#design-principles)
- [Architecture](#architecture)
- [Offline behaviour](#offline-behaviour)
- [Internationalisation](#internationalisation)
- [Accessibility](#accessibility)
- [Security](#security)
- [Admin console](#admin-console)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Repository layout](#repository-layout)

---

## What it does

Four destinations, by deliberate design — the information architecture is capped at four tabs and
two levels of depth.

| Tab | Purpose |
|---|---|
| **Overview** | Market snapshot: what's moving, what's worth attention right now |
| **My Harvest** | Pick a crop and a planting date, get the forecast price at harvest with an uncertainty band and a plain-language explanation of the drivers |
| **Best Crops** | Ranked recommendations for the coming season, with side-by-side crop comparison |
| **Prices** | Current and historical wholesale prices by market |

A forecast result carries: the point estimate, a P10–P90 confidence band, a confidence label, a
12-month price story chart, a "why this forecast?" factor breakdown, and a share action that
composes a plain-text summary for WhatsApp or SMS.

---

## Design principles

These are enforced in code and in tests, not just documented:

**Colour never encodes meaning alone.** Every semantic colour ships paired with an icon and a text
label. Chart markers use shape (▲, dashed lines) rather than hue.

**Amber is caution, red is danger.** Low-confidence forecasts, thin data and stale caches are
amber. Red is reserved strictly for a "not recommended" verdict. A low-trust forecast should read
as *proceed carefully*, not *error*.

**Teal is the brand hue** — the one colour with agricultural affinity and no Sri Lankan political
party association (green, blue, red and maroon are all claimed). Leaf-green appears only as a
semantic "good" signal, never as brand surface.

**Light theme only.** Maximum-luminance surfaces and AAA body contrast, because the primary
reading environment is direct sunlight. No gradients — they band on cheap panels and wash out
outdoors.

**Honest degradation over invented content.** When the model has no factor breakdown for a crop,
the panel says so and shows the free-text explanation. It never fabricates factors and never
renders empty. When only a few months of history exist, the chart says "only N months of data"
rather than drawing a confident line.

---

## Architecture

```
   ┌──────────────────────────────────────────────────────────┐
   │  React 18 + TypeScript · Vite 5                          │
   │                                                          │
   │  pages/     4 farmer destinations                        │
   │  admin/     lazy-loaded console (never in farmer bundle)  │
   │  components/ shell, chart, forecast panels, a11y controls│
   │  lib/       pure logic — geometry, formatting, composing  │
   │  api/       single fetch wrapper + fixtures mode          │
   │  i18n/      si · ta · en                                 │
   └───────────────────────────┬──────────────────────────────┘
                               │  fetch (no axios)
                               ▼
                    ┌──────────────────────┐
                    │  AgriForecast API    │
                    └──────────────────────┘
```

**Business logic lives in `lib/`, not in components.** Chart geometry, price formatting, share-text
composition, readiness rules and comparison logic are pure functions with their own unit tests;
components render their output. This is why the test suite can cover behaviour rather than DOM
shape.

**The admin console is route-level code-split.** Every admin page is a lazy chunk, and each Logs
tab is its own chunk on top of that, so none of it lands in the farmer's first-load bundle. The
farmer bundle holds to a 150 KB gzipped budget.

**Fixtures mode.** `VITE_API_MODE=fixtures` serves realistic fixture JSON for every endpoint,
including a simulated login session, so the entire app — guarded routes included — can be built,
demoed and tested with no backend running. The test suite runs in this mode.

---

## Offline behaviour

A hand-written service worker (no Workbox) with two caches and two different strategies:

**Shell cache — cache-first.** The built app shell is precached on install from a manifest injected
at build time by a custom Vite plugin, which rewrites a placeholder in `sw.js` with the real hashed
asset filenames. Assets are content-hashed and immutable, so cache-first is always correct. After
one visit the app opens fully offline.

**Data cache — network-first.** API `GET` responses fall back to the last known copy only when the
network is unreachable, so a reachable farmer always sees fresh data. Cached responses are stamped
with `X-SW-Cache` and `X-SW-Cached-At` headers, which the app reads to raise an honest amber banner:
*"showing saved prices from &lt;date&gt;"*.

Hiding staleness is treated as a bug. A farmer must never mistake yesterday's saved price for
today's live one.

Installable as a PWA — standalone display, portrait orientation, maskable icons, `/overview` as
the start URL.

---

## Internationalisation

Sinhala and Tamil are first-class, not afterthoughts — English is the fallback. The language gate
runs once on first launch, before anything else renders.

Fonts are **self-hosted variable Noto** (Latin, Sinhala, Tamil) — one `woff2` per script covering
the whole 100–900 weight axis, so three files instead of nine. `unicode-range` means a user
downloads only the script they actually render, and `font-display: swap` keeps first paint fast.
The builds are post-2020 v42, which fixes the old Noto Sans Sinhala ascender-clipping defect.

**Text expansion is a layout constraint, not a detail.** Sinhala and Tamil labels run 20–40% longer
than English, so components must let labels wrap and grow in height. Fixed-height
`overflow: hidden` boxes clip Sinhala ascenders and Tamil vowel marks — this is enforced in the
base stylesheet and documented at the i18n entry point so it doesn't get "tidied away" later.

Sinhala and Tamil strings are currently marked as drafts pending native-speaker review.

---

## Accessibility

- **Large-text toggle** scales the entire type ramp by ~18% via a root class that redeclares the
  size tokens. Applied before first paint so there's no flash, and persisted across sessions.
- **44px minimum touch targets** throughout.
- **Audio-help affordance** on every page — a real, labelled, keyboard-reachable control, wired for
  pre-recorded per-page clips (evidence-backed for low-literacy autonomous use).
- **Charts have a mandatory table alternative** behind a `<details>` disclosure, plus a
  sentence-long `aria-label` summarising the trend. The number is the product, so it must be
  reachable without seeing the picture.
- **WAI-ARIA disclosure patterns** (`aria-expanded` / `aria-controls`) rather than native
  `<details>` where the default-open state needs to be responsive.
- **Error boundaries** so a single failing panel never blanks the app.

---

## Security

- **The access token lives in module memory only** — never `localStorage`, `sessionStorage` or a
  JS-readable cookie.
- **Silent renew via an httpOnly refresh cookie** the JavaScript can never read. A page reload
  exchanges it for a fresh access token, so a reload doesn't sign the farmer out, while the
  long-lived credential stays server-side.
- **A single global 401 interceptor** clears the session and redirects to login with an honest
  "your session expired" notice, rather than failing silently mid-flow.
- **`console` and `debugger` are stripped from production bundles only**, so response bodies can't
  leak through the console while dev and test debugging stay intact.
- **Route guards are layered** — `RequireAuth` for any data route, `RequireAdmin` on top for the
  console. A farmer who reaches an admin URL gets an honest "no access" state inside the shell,
  never a redirect loop.

---

## Admin console

Role-gated internal tooling, invisible to farmers:

| Area | Purpose |
|---|---|
| Policy flags | Policy interventions affecting prices |
| Markets | Market registry and per-market monitoring |
| Users | User administration and account creation |
| Festivals | National festival calendar (feeds the model's demand features) |
| Indicators | Macroeconomic indicator series |
| News | Feed of ingested news articles from the pipeline |
| Logs | Tabbed hub — ingestion runs, model training runs, user activity, system errors |

The Logs hub surfaces the backend's ingestion audit trail and model-promotion decisions, with
gate outcomes relabelled into plain language.

---

## Getting started

### Prerequisites

Node.js 20+

### Run against fixtures (no backend needed)

```bash
npm install
VITE_API_MODE=fixtures npm run dev
```

Open http://localhost:4173. The login form mints a simulated session, so every guarded route is
reachable.

### Run against a live API

```bash
VITE_API_BASE_URL=http://localhost:5282 npm run dev
```

Requires the [AgriForecast API](https://github.com/DhananjayaSenadheera/Agri_Forecast) running.

### Build

```bash
npm run build      # type-checks with tsc --noEmit, then builds and injects the SW precache manifest
npm run preview
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5282` | AgriForecast API origin |
| `VITE_API_MODE` | *(unset)* | Set to `fixtures` to run without a backend |

---

## Testing

```bash
npm test           # vitest, 52 suites
npm run test:watch
```

Vitest with Testing Library and jsdom, running in fixtures mode. Coverage spans auth context,
guards, token refresh and the 401 interceptor; every admin page; chart and timeline geometry;
share-text composition; i18n; the service worker; the staleness banner; readiness badges; and a
fixtures-realism check so the demo data can't drift into fantasy.

---

## Repository layout

```
src/
├── pages/         4 farmer destinations + auth pages
├── admin/         lazy-loaded admin console (incl. logs/ tabbed hub)
├── components/    shell, chart, forecast panels, a11y controls
├── lib/           pure logic — chart geometry, formatting, share text, rules
├── api/           fetch client, auth, types, fixtures, cache signal
├── auth/          AuthContext + RequireAuth
├── i18n/          bootstrap + si / ta / en locale files
├── styles/        design tokens and per-area stylesheets
└── test/          52 vitest suites
public/
├── sw.js          hand-written service worker
├── fonts/         self-hosted variable Noto (Latin, Sinhala, Tamil)
└── manifest.webmanifest
docs/
└── AgriForecast-Farmer-App-PRD.md
```

Development happens on feature branches merged into `main` by pull request. Design tokens and the
product requirements document are the signed-off source of truth for anything visual.

---

## Related repositories

- [Agri_Forecast](https://github.com/DhananjayaSenadheera/Agri_Forecast) — .NET API, ingestion
  worker and the Python ML forecasting service this app consumes

---

## Author

**Dhananjaya Senadheera** — Software Engineer (Cloud & .NET)
[LinkedIn](https://www.linkedin.com/in/dhananjaya-senadheera/) · [GitHub](https://github.com/DhananjayaSenadheera)
