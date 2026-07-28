// WatchlistCard — one watched crop on "My crops": which market it is being read at, what
// that market pays today, which way it has moved, how much it swings, and the recent price
// history behind those numbers.
//
// STEP 6 SHAPE (the owner's Trello-card sketch):
//   • the market's SHORT CODE sits on top, the crop name under it;
//   • a crop watched at two or three markets turns those codes into TABS, and selecting one
//     switches everything market-scoped at once — the price, its observed date, the trend
//     line, the swing pill and the chart. One market means one chip and no tablist;
//   • a compact price-history chart of the selected market closes the card.
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
//  - Nothing here is red. Red is reserved app-wide for the "Not recommended" verdict — the
//    remove flow's own confirm button is the single deliberate exception (it destroys data).
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { PortfolioDashboardItem, PriceHistoryPoint } from '../api/types';
import { selectedMarketFor } from '../lib/portfolio';
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
import PriceSwingBadge from './PriceSwingBadge';
import ReadinessBadge from './ReadinessBadge';

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
  /** Saves or clears this crop's planting date through the page's write machinery (the same
   *  error mapping every other watchlist write uses), and answers with what to show. */
  onSavePlantedDate: (cropId: string, plantedDate: string | null) => Promise<WriteMessage | null>;
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
  busy,
}: WatchlistCardProps) {
  const { t } = useTranslation();
  const titleId = `pf-crop-${item.cropId}`;

  // Null = "the farmer has not chosen a tab", which resolves to markets[0] — the oldest
  // chosen, exactly what the wire leads with. A selection naming a market this crop no
  // longer has falls back the same way instead of blanking the card.
  const [pickedMarketId, setPickedMarketId] = useState<string | null>(null);
  const market = selectedMarketFor(item, pickedMarketId);
  const marketId = market?.marketId ?? null;
  const hasTabs = item.markets.length > 1;

  // A market with NO price has no history to draw either: the wire's price is the freshest
  // observation that exists at that market and there is no staleness cutoff, so a null price
  // means this market has published nothing for this crop at all. PriceBlock already says
  // that in the farmer's words; a second, differently-worded empty chart under it would be
  // noise, and the request would be a round trip on a rural connection for a series that
  // cannot have rows. The day the contract grows a staleness cutoff, this has to change.
  const chartMarketId = market?.price ? marketId : null;
  const history = useMarketHistory(item.cropId, chartMarketId);
  // The swing describes the SAME series the chart draws, so it can never disagree with it.
  const swing = history ? classifyPriceSwing(history) : null;

  // ONE fetch per (crop, planting date) for the whole card, shared with the popup: the two
  // surfaces show the same forecast because they are literally reading the same state, not
  // because two requests happened to agree.
  const { state: plantedForecast, retry: retryForecast } = usePlantedForecast(
    item.cropId,
    item.plantedDate,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <li className={`pf-card${selected ? ' pf-card--selected' : ''}`}>
      <article className="pf-card__inner" aria-labelledby={titleId}>
        <MarketTabs
          cropId={item.cropId}
          cropName={item.cropName}
          markets={item.markets}
          selectedMarketId={marketId}
          onSelect={setPickedMarketId}
        />

        <header className="pf-card__head">
          {/* The tick is a real checkbox with a crop-specific accessible name, so a list of
              ten of them is never ten controls called "Select". */}
          <label className="pf-pick">
            <input
              type="checkbox"
              className="pf-pick__box"
              checked={selected}
              onChange={() => onToggleSelect(item.cropId)}
              aria-label={t('pages.portfolio.selectCropAria', { crop: item.cropName })}
            />
          </label>
          {/* The badge sits OUTSIDE any link, so it keeps its word visible and never
              joins a control's accessible name. */}
          <h3 className="pf-card__title" id={titleId}>
            {item.cropName}
          </h3>
          <ReadinessBadge status={readiness} compact />
        </header>

        {/* Everything below belongs to ONE market. With tabs it is that tabpanel; with a
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
          {/* The full market name in plain words, under the code. This is what makes the
              codes readable on a touch screen, where a tap on a tab selects rather than
              explains — and "KEP" alone is not a market a farmer can recognise. */}
          <p className="pf-card__market">
            <span className="pf-card__market-label">{t('pages.portfolio.marketLabel')}</span>{' '}
            <span className="pf-card__market-name">
              {market ? market.name : t('pages.portfolio.noMarketChosen')}
            </span>
          </p>
          {market?.isDefaultMarket && (
            <p className="pf-card__market-note">{t('pages.portfolio.defaultMarketNote')}</p>
          )}

          <PriceBlock market={market} lang={lang} todayYmd={todayYmd} />
          <PriceSwingBadge swing={swing} />

          {chartMarketId && (
            <div className="pf-card__chart">
              {history === null ? (
                <div className="pf-skel pf-skel--chart" aria-busy="true">
                  <span className="sr-only">{t('common.loading')}</span>
                </div>
              ) : (
                <PriceLineChart
                  history={history}
                  cropLabel={item.cropName}
                  marketName={market?.name ?? ''}
                  lang={lang}
                />
              )}
            </div>
          )}
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
        />

        <p className="pf-card__more">
          {/* A button, not a link: it opens a dialog on this page rather than going
              somewhere, and aria-haspopup says so before it is pressed. Focus returns here
              when the dialog closes (the shared dialog behaviour captures the opener). */}
          <button
            type="button"
            className="pf-card__link pf-card__more-btn"
            aria-haspopup="dialog"
            aria-label={t('pages.portfolio.moreDetailsAria', { crop: item.cropName })}
            onClick={() => setDetailsOpen(true)}
          >
            {t('pages.portfolio.moreDetails')}
          </button>
        </p>
      </article>

      {detailsOpen && (
        <CropDetailsDialog
          item={item}
          market={market}
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
          busy={busy}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </li>
  );
}
