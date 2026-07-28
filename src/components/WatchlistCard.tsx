// WatchlistCard — one watched crop on the portfolio dashboard: what it fetches today at the
// market the card leads with, which way it has moved, how much it swings, and what the model
// says it will fetch at harvest. Also exports the two blocks so the per-crop page shows the
// SAME facts in the same words rather than a second phrasing of them.
//
// STEP 5 SCOPE: markets are per crop now and a crop can carry up to three, but this card
// still shows exactly ONE — markets[0], the farmer's oldest-chosen (the wire orders them and
// we never re-sort). Market tabs, the in-card chart and the planted date are steps 6–7; the
// layout here is deliberately unchanged so the rewire and the redesign are separable.
//
// The honesty rules that shape this markup (PRD §3.6, §5.2):
//  - The price is shown WITH its observed date, always. There is no staleness cutoff on the
//    wire, so an old price is displayed and its age is said out loud in plain words — never
//    hidden, never quietly discounted.
//  - A null `direction` prints "no earlier price to compare", NOT "steady". Treating an
//    absent comparison as a flat price is a lie the farmer cannot detect.
//  - The price shown is the named market's OWN price. It is never substituted from another
//    market, so "no price" means this market has published none — not that it is stale.
//  - The prediction is a RANGE with a confidence word; a fallback-served one is visibly
//    de-rated (never hidden), and beside a market that is not the anchor it carries the
//    "National forecast" label, because the model has only ever served one national price.
//  - Nothing here is red. Red is reserved app-wide for the "Not recommended" verdict — the
//    remove flow's own confirm button is the single deliberate exception (it destroys data).
//
// Both blocks branch on the PRESENCE of the leg, not on `priceUnavailableReason` /
// `predictionUnavailableReason`. That is deliberate while each field has exactly one code
// ("no_recent_price" / "no_snapshot"): switching on a one-member set buys nothing and
// would silently drop an unknown future code into a blank space. When a second code
// appears, branch here — the reason is already carried through in the types.
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PortfolioDashboardItem, PortfolioDashboardMarket } from '../api/types';
import { formatDate, formatPrice, formatRange, mapConfidenceString } from '../lib/format';
import {
  PRICE_AGE_NOTE_DAYS,
  isDeratedPrediction,
  primaryMarket,
  priceAgeDays,
  showsNationalLabel,
  trendGlyph,
  trendLabelKey,
} from '../lib/portfolio';
import type { PriceSwing } from '../lib/priceSwing';
import type { CropReadinessStatus } from '../lib/readiness';
import ReadinessBadge from './ReadinessBadge';
import PriceSwingBadge from './PriceSwingBadge';

export interface WatchlistCardProps {
  item: PortfolioDashboardItem;
  /** Forecast-readiness for this crop; null = unknown -> no badge, no claim. */
  readiness: CropReadinessStatus | null;
  /** FE-derived price swing; null = too thin to say -> renders nothing. */
  swing: PriceSwing | null;
  lang: string;
  /** Today as "YYYY-MM-DD", passed in so the card stays pure and testable. */
  todayYmd: string;
  /** Economic-centre market ids; absent = the national label is shown (see
   *  showsNationalLabel — the safe direction). */
  economicCenterIds?: ReadonlySet<string>;
  /** Ticked for removal. Selection lives on the page so one action can remove many. */
  selected: boolean;
  onToggleSelect: (cropId: string) => void;
}

export default function WatchlistCard({
  item,
  readiness,
  swing,
  lang,
  todayYmd,
  economicCenterIds,
  selected,
  onToggleSelect,
}: WatchlistCardProps) {
  const { t } = useTranslation();
  const titleId = `pf-crop-${item.cropId}`;
  const market = primaryMarket(item);

  return (
    <li className={`pf-card${selected ? ' pf-card--selected' : ''}`}>
      <article className="pf-card__inner" aria-labelledby={titleId}>
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

        {/* Which market these numbers belong to, said once, above them. */}
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
        <PredictionBlock
          item={item}
          market={market}
          lang={lang}
          economicCenterIds={economicCenterIds}
        />

        <p className="pf-card__more">
          <Link
            className="pf-card__link"
            to={`/portfolio/crop/${item.cropId}`}
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
 *  and the trend — or an honest "this market has no price for this crop". */
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

/** The frozen snapshot prediction: a range with a confidence word, de-rated when it came
 *  from a fallback, labelled "National forecast" beside a market that is not the anchor. */
export function PredictionBlock({
  item,
  market,
  lang,
  economicCenterIds,
}: {
  item: PortfolioDashboardItem;
  market: PortfolioDashboardMarket | null;
  lang: string;
  economicCenterIds?: ReadonlySet<string>;
}) {
  const { t } = useTranslation();
  const rs = t('common.rs');
  const p = item.prediction;

  if (!p) {
    return (
      <p className="pf-nodata" role="note">
        <span aria-hidden="true">🔎 </span>
        {t('pages.portfolio.noPrediction')}
      </p>
    );
  }

  const conf = mapConfidenceString(p.confidence);
  const derated = isDeratedPrediction(p);

  return (
    <div className={`pf-pred${derated ? ' pf-pred--derated' : ''}`}>
      <p className={`pf-pred__chip pf-pred__chip--${conf.tone}`}>
        <span aria-hidden="true">≈ </span>
        <span className="pf-pred__price">
          {t('pages.portfolio.predAbout', { price: formatPrice(p.predictedPrice, lang, rs) })}
        </span>{' '}
        <span className="pf-pred__conf">
          ({t('confidence.label')}: {t(conf.labelKey)})
        </span>
      </p>
      {/* A band is always shown as a band — never collapsed into the single number above. */}
      <p className="pf-pred__band">
        {t('forecast.rangeTitle')}: {formatRange(p.lowerBound, p.upperBound, lang, rs)}
      </p>
      {p.harvestDate && (
        <p className="pf-pred__when">
          {t('forecast.harvestAround', { date: formatDate(p.harvestDate, lang) })}
        </p>
      )}
      <p className="pf-pred__tags">
        {showsNationalLabel(market, economicCenterIds) && (
          <span className="pf-tag pf-tag--national">
            {t('pages.portfolio.nationalForecast')}
          </span>
        )}
        {derated && (
          <span className="pf-tag pf-tag--derated">
            <span aria-hidden="true">⚠ </span>
            {t('forecast.lowTrustTitle')}
          </span>
        )}
      </p>
      {derated && <p className="pf-pred__derated-body">{t('forecast.lowTrustLead')}</p>}
    </div>
  );
}
