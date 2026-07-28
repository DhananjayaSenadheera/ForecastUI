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
// The forecast section ("≈ About Rs. X at harvest", the band, the harvest date, the
// National-forecast / rough-estimate tags) is GONE from the card this step. It is not
// hidden-but-still-true: nothing on the card claims a harvest price any more. The
// planted-date-driven replacement is step 7, and the crop detail page still shows the full
// prediction via PredictionBlock in the meantime. The wire types still carry `prediction` —
// only the card stopped rendering it.
//
// The honesty rules that shape this markup (PRD §3.6, §5.2):
//  - The price is shown WITH its observed date, always. There is no staleness cutoff on the
//    wire, so an old price is displayed and its age is said out loud in plain words — never
//    hidden, never quietly discounted.
//  - A null `direction` prints "no earlier price to compare", NOT "steady". Treating an
//    absent comparison as a flat price is a lie the farmer cannot detect.
//  - The price shown is the named market's OWN price. It is never substituted from another
//    market, so "no price" means this market has published none — not that it is stale.
//  - The chart is drawn for the SELECTED market and nothing else. A Kandy series under a
//    Dambulla price would quietly contradict the number; every market-scoped thing on the
//    card therefore resolves its market through one function, selectedMarketFor().
//  - Nothing here is red. Red is reserved app-wide for the "Not recommended" verdict — the
//    remove flow's own confirm button is the single deliberate exception (it destroys data).
//
// PriceBlock branches on the PRESENCE of the price leg, not on `priceUnavailableReason`.
// That is deliberate while that field has exactly one code ("no_recent_price"): switching on
// a one-member set buys nothing and would silently drop an unknown future code into a blank
// space. When a second code appears, branch there — the reason is carried in the types.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type {
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
  PriceHistoryPoint,
} from '../api/types';
import { formatDate, formatPrice } from '../lib/format';
import {
  PRICE_AGE_NOTE_DAYS,
  cropDetailLink,
  priceAgeDays,
  selectedMarketFor,
  trendGlyph,
  trendLabelKey,
} from '../lib/portfolio';
import { classifyPriceSwing } from '../lib/priceSwing';
import type { CropReadinessStatus } from '../lib/readiness';
import MarketTabs, { marketPanelId, marketTabId } from './MarketTabs';
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

        <p className="pf-card__more">
          <Link
            className="pf-card__link"
            to={cropDetailLink(item, marketId)}
            aria-label={t('pages.portfolio.openCropAria', { crop: item.cropName })}
          >
            {t('pages.portfolio.openCrop')}
          </Link>
        </p>
      </article>
    </li>
  );
}

/** Today's observed price for the crop AT THIS MARKET: the number, the date it was observed,
 *  and the trend — or an honest "this market has no price for this crop". Shared with the
 *  crop detail page so the two screens can never word the same fact differently. */
export function PriceBlock({
  market,
  lang,
  todayYmd,
}: {
  market: PortfolioDashboardMarket | null;
  lang: string;
  todayYmd: string;
}) {
  const { t } = useTranslation();
  const rs = t('common.rs');
  const price = market?.price ?? null;

  if (!price) {
    // NOT "no recent price": nothing was substituted and nothing went stale — this market
    // has published no usable price for this crop at all. Saying "recent" would invite the
    // farmer to wait for an update that is not late.
    return (
      <p className="pf-nodata" role="note">
        <span aria-hidden="true">🌱 </span>
        {t('pages.portfolio.noPriceAtMarket')}
      </p>
    );
  }

  const age = priceAgeDays(price.observedDate, todayYmd);
  const showAge = age !== null && age >= PRICE_AGE_NOTE_DAYS;

  return (
    <div className="pf-price">
      <p className="pf-price__value">
        <strong className="pf-price__num">{formatPrice(price.price, lang, rs)}</strong>
        <span className="pf-price__unit">{t('common.perKg')}</span>
      </p>
      <p className="pf-price__meta">
        {t('pages.portfolio.observedOn', { date: formatDate(price.observedDate, lang) })}
        {showAge && (
          <>
            {' · '}
            <span className="pf-price__age">
              {t('pages.portfolio.priceAge', { count: age as number })}
            </span>
          </>
        )}
      </p>
      {price.direction && price.changePct !== null ? (
        <p className={`pf-trend pf-trend--${price.direction}`}>
          <span className="pf-trend__glyph" aria-hidden="true">
            {trendGlyph[price.direction]}
          </span>{' '}
          {t('pages.portfolio.trendLine', {
            dir: t(trendLabelKey(price.direction)),
            pct: Math.abs(price.changePct),
            prev:
              price.previousPrice !== null ? formatPrice(price.previousPrice, lang, rs) : '—',
            date:
              price.previousObservedDate !== null
                ? formatDate(price.previousObservedDate, lang)
                : '—',
          })}
        </p>
      ) : (
        // NOT "steady": there is simply nothing recent enough to compare against.
        <p className="pf-trend pf-trend--none">{t('pages.portfolio.noTrend')}</p>
      )}
    </div>
  );
}
