// WatchlistCard — one watched crop on "My crops": which market it is being read at, what
// that market pays today, which way it has moved, and the recent price history behind those
// numbers.
//
// SHAPE (the owner's hi-fi mockup, 2026-07-29 — a restyle of the sketch shipped that
// morning, with the same facts in the same order):
//   • HEADER: the crop's emoji in a round chip, "Beans → DEC" beside it — the name, an
//     arrow, and the short code(s) of the market(s) it is watched at — and a BOOKMARK at
//     the far edge. A crop watched at two or three markets turns those codes into TABS, and
//     selecting one switches everything market-scoped at once: the price, its observed
//     date, the trend and the chart. One market means one chip, no tablist;
//   • PRICE ROW: the number large on the left with the day it was observed under it, and
//     the movement as a tinted badge on the right;
//   • the CHART in its own inset panel, with a 1M/3M range chooser in its title row;
//   • the PLANTING section — the date, the forecast that follows from it, and the two
//     full-width buttons the card ends on.
// The BOOKMARK is the removal tick in different clothes and nothing else: a real, focusable
// <input type="checkbox"> with the same crop-specific accessible name, visually replaced by
// an outline/filled bookmark. The page's "remove selected" flow, its confirm and its focus
// routing are untouched — a farmer who has learned that ticking a card queues it for
// removal has learned this too.
// What the earlier simplification MOVED (nothing was deleted): the spelled-out market name,
// the readiness badge and the price-swing pill live in the "More details" popup, which is
// the surface for reading about a crop rather than scanning a list of them.
//
// The header is a two-or-three column grid rather than a flex row. The price cell sits
// OUTSIDE the market tabpanel in that grid, which is worth stating plainly because it looks
// wrong: the number a tab changes is not inside the panel that tab labels. The tablist
// cannot be nested inside the panel it controls, and a grid item is a rectangle — so the
// price is tab-governed state rendered beside the panel, and both it and the panel's
// contents are resolved from ONE selectedMarketFor() call. That single seam, not the
// nesting, is what makes it impossible for the price and the chart to disagree.
// At narrow widths (a 360px phone, one card per screen) the price drops to its own row under
// the name — a deliberate break, so a long crop name and three chips can never squeeze the
// number.
//
// STEP 7 added the two things that make the card a place to MANAGE a crop rather than only
// read one:
//   • the planting date and the forecast that follows from it (PlantedDateSection). The
//     card's old forecast block was a national snapshot for a crop the farmer might not have
//     in the ground; this one answers "what will the crop I planted on the 3rd be worth when
//     it is ready", from the same harvest route the My harvest page uses. Note where it
//     sits: OUTSIDE the market tabpanel, because there is one forecast per crop and putting
//     it inside would imply the number changes with the tab.
//   • "More details", which opens the whole crop in a popup over the list (the crop page
//     still exists and the popup links to it).
// The wire's `prediction` field — the nightly snapshot — is still not rendered here: the
// card's forecast is the farmer's own planting or nothing at all.
//
// The honesty rules that shape this markup (PRD §3.6, §5.2):
//  - The price fact itself is PriceBlock's, shared with the popup and the crop page so the
//    three surfaces cannot word it differently (see that file for its own rules).
//  - The chart is drawn for the SELECTED market and nothing else. A Kandy series under a
//    Dambulla price would quietly contradict the number; every market-scoped thing on the
//    card therefore resolves its market through one function, selectedMarketFor().
//  - The 1M/3M control is a ZOOM on data the card already has, never a different question:
//    no request, no reload, and the price above it does not move when the window changes.
//  - Nothing on the CARD SURFACE is red any more: the only destructive control it used to
//    carry, "Remove date", has moved into the "More details" popup — which this file still
//    renders, so the red control does exist in this component's subtree, one layer deeper and
//    behind a confirm that asks why. Red is otherwise reserved app-wide for the "Not
//    recommended" verdict — a falling price gets amber, which is caution, not failure.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type {
  Market,
  PlantedDateClearRequest,
  PortfolioDashboardItem,
  PriceHistoryPoint,
} from '../api/types';
import { cropIcon } from '../lib/cropIcons';
import { selectedMarketFor, sliceHistoryByRange, type ChartRange } from '../lib/portfolio';
import { classifyPriceSwing } from '../lib/priceSwing';
import type { CropReadinessStatus } from '../lib/readiness';
import CropDetailsDialog from './CropDetailsDialog';
import MarketTabs, { marketPanelId, marketTabId } from './MarketTabs';
import PlantedDateSection, {
  usePlantedForecast,
  type WriteMessage,
} from './PlantedDateSection';
import PriceBlock from './PriceBlock';
import PriceLineChart from './PriceLineChart';

export interface WatchlistCardProps {
  item: PortfolioDashboardItem;
  /** Forecast-readiness for this crop; null = unknown -> no badge, no claim. */
  readiness: CropReadinessStatus | null;
  lang: string;
  /** Today as "YYYY-MM-DD", passed in so the card's price ageing stays testable. */
  todayYmd: string;
  /** Ticked for removal. Selection lives on the page so one action can remove many. */
  selected: boolean;
  onToggleSelect: (cropId: string) => void;
  /** Saves this crop's planting date through the page's write machinery (the same error
   *  mapping every other watchlist write uses), and answers with what to show. */
  onSavePlantedDate: (cropId: string, plantedDate: string) => Promise<WriteMessage | null>;
  /** REMOVES this crop's planting date, with the reason the farmer gave. The card renders no
   *  Remove control itself — this is for the "More details" popup it owns, which is the one
   *  place the date can be removed (and the only place there is room to ask why). */
  onClearPlantedDate: (
    cropId: string,
    clear: PlantedDateClearRequest,
  ) => Promise<WriteMessage | null>;
  /** The full market registry the page already holds. The card itself does not use it — it is
   *  handed to the "More details" popup, whose sales form must be able to offer a market the
   *  farmer does not watch this crop at. Defaults to empty so a caller that has no registry
   *  loses one picker group rather than crashing. */
  allMarkets?: Market[];
  /** A write is in flight anywhere on the page. */
  busy: boolean;
}

/**
 * Observed price history for ONE crop, cached per market.
 *
 * One request per market per card, ever: switching to a tab that has already been fetched
 * repaints from the cache with no round trip, which is what makes the tabs usable on a rural
 * connection. `requested` is a ref so React 18's dev double-mount cannot fire the same call
 * twice, and it is keyed by crop AND market so a card that is reused for another crop cannot
 * inherit the previous crop's series.
 *
 * Returns null while a fetch is outstanding and an ARRAY once it resolves — including the
 * empty array on failure and on "no market at all". Leaving it null there would park the
 * chart on a skeleton with aria-busy="true" forever, announcing work that will never happen.
 * A failed history is fail-soft decoration: the empty chart says so and the price above it
 * is untouched.
 */
function useMarketHistory(cropId: string, marketId: string | null): PriceHistoryPoint[] | null {
  const [cache, setCache] = useState<Record<string, PriceHistoryPoint[]>>({});
  const requested = useRef<Set<string>>(new Set());
  const key = marketId ? `${cropId}:${marketId}` : null;

  useEffect(() => {
    if (!marketId || !key) return;
    if (requested.current.has(key)) return;
    requested.current.add(key);
    api
      .getPriceHistory(cropId, marketId)
      .then((h) => setCache((prev) => ({ ...prev, [key]: h })))
      .catch(() => setCache((prev) => ({ ...prev, [key]: [] })));
  }, [cropId, marketId, key]);

  if (!key) return [];
  return cache[key] ?? null;
}

export default function WatchlistCard({
  item,
  readiness,
  lang,
  todayYmd,
  selected,
  onToggleSelect,
  onSavePlantedDate,
  onClearPlantedDate,
  allMarkets = [],
  busy,
}: WatchlistCardProps) {
  const { t } = useTranslation();
  const titleId = `pf-crop-${item.cropId}`;
  const rangeId = `pf-range-${item.cropId}`;
  
  const [pickedMarketId, setPickedMarketId] = useState<string | null>(null);
  const market = selectedMarketFor(item, pickedMarketId);
  const marketId = market?.marketId ?? null;
  const hasTabs = item.markets.length > 1;
  const hasPrice = market?.price != null;
  const chartMarketId = hasPrice ? marketId : null;
  const history = useMarketHistory(item.cropId, chartMarketId);

  const swing = history ? classifyPriceSwing(history) : null;
  const { state: plantedForecast, retry: retryForecast } = usePlantedForecast(
    item.cropId,
    item.plantedDate,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  const [range, setRange] = useState<ChartRange>('3m');
  const shownHistory = history === null ? null : sliceHistoryByRange(history, range);

  const priceCell = (
    <div className={`pf-card__pricecell${hasPrice ? '' : ' pf-card__pricecell--nodata'}`}>
      <PriceBlock
        market={market}
        lang={lang}
        todayYmd={todayYmd}
        part="price"
        hintId={`pf-card-${item.cropId}`}
        hintCrop={item.cropName}
      />
      <PriceBlock market={market} lang={lang} todayYmd={todayYmd} part="trend" trendStyle="badge" />
    </div>
  );

  return (
    <li className={`pf-card${selected ? ' pf-card--selected' : ''}`}>
      <article className="pf-card__inner" aria-labelledby={titleId}>
        {/* The header grid, and only it: three cells on row 1 — the crop's identity, the
            remove tick, and (on a wide enough card) the price. The market panel is one
            full-width row beneath them and lays its own contents out in a column. */}
        <div className="pf-card__top">
          <header className="pf-card__ident">
            {/* DECORATION, and deliberately so: the emoji is aria-hidden and never joins
                any accessible name, because a screen-reader user gains nothing from
                "aubergine Brinjal". It is here for the farmer scanning ten cards at arm's
                length in daylight, who finds their crop by shape before they read it. */}
            <span className="crop-chip crop-chip--lg" aria-hidden="true">
              {cropIcon({ cropCode: item.cropCode, cropName: item.cropName })}
            </span>
            <h3 className="pf-card__title" id={titleId}>
              {item.cropName}
            </h3>
            {item.markets.length > 0 && (
              // Decorative: the arrow says "read at" to the eye. Screen readers get the
              // relationship from the tablist's own name ("Markets you watch Tomato at").
              <span className="pf-card__arrow" aria-hidden="true">
                →
              </span>
            )}
            <MarketTabs
              cropId={item.cropId}
              cropName={item.cropName}
              markets={item.markets}
              selectedMarketId={marketId}
              onSelect={setPickedMarketId}
            />
          </header>

          {/* The BOOKMARK is a checkbox wearing a different picture. The control is a real
              <input type="checkbox"> with its crop-specific accessible name — so a list of
              ten of them is never ten controls called "Select", and the keyboard, the
              screen reader, the form semantics and the page's remove-selected flow are all
              exactly what they were. Only the paint changed: the box is moved off-screen
              (never display:none, which would take it out of the tab order) and the SVG
              beside it is filled when checked and outlined when not — shape first, so the
              state does not depend on colour.
              It comes before the price and the panel in the DOM and sits in the header row
              in both layout variants, so it is never reached after the chart. */}
          <label className="pf-pick">
            <input
              type="checkbox"
              className="pf-pick__box sr-only"
              checked={selected}
              onChange={() => onToggleSelect(item.cropId)}
              aria-label={t('pages.portfolio.selectCropAria', { crop: item.cropName })}
            />
            <span className="pf-pick__mark" aria-hidden="true">
              <BookmarkIcon filled={selected} />
            </span>
          </label>

          {/* The PRICE ROW sits outside the tabpanel on purpose: the tablist above it
              cannot live inside the panel it controls, and a grid item is a rectangle. What
              keeps it honest is not the nesting but the seam — this block, the badge inside
              it and the chart below all read `market`, one selectedMarketFor() resolution,
              so the tab cannot move one of them without moving the others.
              The NO-PRICE note is the same block in the same place in the reading order,
              rendered inside the panel instead. It has to be full width either way (a
              sentence in a header column crushes the crop name), and the two positions are
              pixel-identical — so putting it inside is free, and it is the only thing that
              would be in the panel on a market with no price. Outside, a tab would label an
              empty region and the one sentence that answers "what does this market pay?"
              would sit outside the region that tab names. */}
          {hasPrice && priceCell}

          {/* Everything in here belongs to ONE market. With tabs it is that tabpanel; with a
              single market there is no tablist, so there is no orphan tabpanel either. */}
          <div
            className="pf-card__panel"
            {...(hasTabs && marketId
              ? {
                  id: marketPanelId(item.cropId),
                  role: 'tabpanel',
                  'aria-labelledby': marketTabId(item.cropId, marketId),
                }
              : {})}
          >
            {!hasPrice && priceCell}

            {/* Load-bearing honesty, not clutter: this crop has no market of the farmer's
                own, so the number above it belongs to the economic centre we chose for them. */}
            {market?.isDefaultMarket && (
              <p className="pf-card__market-note">{t('pages.portfolio.defaultMarketNote')}</p>
            )}

            {chartMarketId && (
              <div className="pf-card__chart">
                {shownHistory === null ? (
                  <div className="pf-skel pf-skel--chart" aria-busy="true">
                    <span className="sr-only">{t('common.loading')}</span>
                  </div>
                ) : (
                  <PriceLineChart
                    history={shownHistory}
                    cropLabel={item.cropName}
                    marketName={market?.name ?? ''}
                    lang={lang}
                    hideTable
                    showUnitLabel
                    headerExtra={
                      <label className="pf-range" htmlFor={rangeId}>
                        <span className="sr-only">{t('pages.portfolio.rangeLabel')}</span>
                        {/* A native <select>: the phone's own picker, two options, no
                            invented widget to learn. It re-slices data the card already
                            holds — nothing is fetched and the price above cannot move. */}
                        <select
                          id={rangeId}
                          className="pf-range__select"
                          value={range}
                          onChange={(e) => setRange(e.target.value as ChartRange)}
                        >
                          <option value="1m">{t('pages.portfolio.range1m')}</option>
                          <option value="3m">{t('pages.portfolio.range3m')}</option>
                        </select>
                      </label>
                    }
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Outside the tabpanel: one forecast per crop, so it must not look market-scoped. */}
        <PlantedDateSection
          item={item}
          market={market}
          lang={lang}
          todayYmd={todayYmd}
          forecast={plantedForecast}
          onRetryForecast={retryForecast}
          onSave={onSavePlantedDate}
          busy={busy}
          idPrefix="card"
          forecastLayout="split"
          // NO Remove-date control on the card (2026-07-30): removing a date is a
          // destructive, reason-needing action, and a card in a grid of ten is the wrong
          // place for it. It lives in the popup below.
          clearControl="none"
        />

        <p className="pf-card__more">
          {/* A button, not a link: it opens a dialog on this page rather than going
              somewhere, and aria-haspopup says so before it is pressed. Focus returns here
              when the dialog closes (the shared dialog behaviour captures the opener).
              It is the SECOND action on the card — outlined, under the primary "See the
              full forecast" — because a farmer who has a forecast to read should read it,
              and everything in here is detail about it. */}
          <button
            type="button"
            className="pf-btn pf-btn--ghost"
            aria-haspopup="dialog"
            aria-label={t('pages.portfolio.moreDetailsAria', { crop: item.cropName })}
            onClick={() => setDetailsOpen(true)}
          >
            {t('pages.portfolio.moreDetails')}
            <span className="pf-btn__chev" aria-hidden="true">
              {' →'}
            </span>
          </button>
        </p>
      </article>

      {detailsOpen && (
        <CropDetailsDialog
          item={item}
          market={market}
          allMarkets={allMarkets}
          readiness={readiness}
          lang={lang}
          todayYmd={todayYmd}
          // The card's own cached series — opening the popup buys no round trip. `undefined`
          // says "this market has no price, so there is no chart", which is not the same
          // thing as an empty series.
          history={chartMarketId ? history : undefined}
          swing={swing}
          forecast={plantedForecast}
          onRetryForecast={retryForecast}
          onSavePlantedDate={onSavePlantedDate}
          onClearPlantedDate={onClearPlantedDate}
          busy={busy}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </li>
  );
}

/** The bookmark the removal tick wears. Filled when the card is ticked, outlined when it is
 *  not — a shape difference, so the state survives greyscale and sunlight. Decorative: the
 *  checkbox beside it carries the name and the state for assistive tech. */
function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="pf-pick__icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1Z" />
    </svg>
  );
}
