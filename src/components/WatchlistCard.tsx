// WatchlistCard — one watched crop on the portfolio dashboard: what it fetches today, which
// way it has moved, how much it swings, and what the model says it will fetch at harvest.
// Also exports the two blocks so the per-crop page shows the SAME facts in the same words
// rather than a second phrasing of them.
//
// The honesty rules that shape this markup (PRD §3.6, §5.2):
//  - The price is shown WITH its observed date, always. There is no staleness cutoff on the
//    wire, so an old price is displayed and its age is said out loud in plain words — never
//    hidden, never quietly discounted.
//  - A null `direction` prints "no earlier price to compare", NOT "steady". Treating an
//    absent comparison as a flat price is a lie the farmer cannot detect.
//  - A fallback-served price names the market it really came from.
//  - The prediction is a RANGE with a confidence word; a fallback-served one is visibly
//    de-rated (never hidden), and under a non-economic-centre home market it carries the
//    "National forecast" label, because the model has only ever served one national price.
//  - Nothing here is red. Red is reserved app-wide for the "Not recommended" verdict.
//
// Both blocks branch on the PRESENCE of the leg, not on `priceUnavailableReason` /
// `predictionUnavailableReason`. That is deliberate while each field has exactly one code
// ("no_recent_price" / "no_snapshot"): switching on a one-member set buys nothing and
// would silently drop an unknown future code into a blank space. When a second code
// appears, branch here — the reason is already carried through in the types.
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PortfolioDashboardItem, PortfolioHomeMarket } from '../api/types';
import { formatDate, formatPrice, formatRange, mapConfidenceString } from '../lib/format';
import {
  PRICE_AGE_NOTE_DAYS,
  isDeratedPrediction,
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
  homeMarket: PortfolioHomeMarket | null;
  /** Forecast-readiness for this crop; null = unknown -> no badge, no claim. */
  readiness: CropReadinessStatus | null;
  /** FE-derived price swing; null = too thin to say -> renders nothing. */
  swing: PriceSwing | null;
  lang: string;
  /** Today as "YYYY-MM-DD", passed in so the card stays pure and testable. */
  todayYmd: string;
}

export default function WatchlistCard({
  item,
  homeMarket,
  readiness,
  swing,
  lang,
  todayYmd,
}: WatchlistCardProps) {
  const { t } = useTranslation();
  const titleId = `pf-crop-${item.cropId}`;

  return (
    <li className="pf-card">
      <article className="pf-card__inner" aria-labelledby={titleId}>
        <header className="pf-card__head">
          {/* The badge sits OUTSIDE any link, so it keeps its word visible and never
              joins a control's accessible name. */}
          <h3 className="pf-card__title" id={titleId}>
            {item.cropName}
          </h3>
          <ReadinessBadge status={readiness} compact />
        </header>

        <PriceBlock item={item} lang={lang} todayYmd={todayYmd} />
        <PriceSwingBadge swing={swing} />
        <PredictionBlock item={item} homeMarket={homeMarket} lang={lang} />

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

/** Today's observed price for the crop: the number, the market it really came from, the
 *  date it was observed, and the trend — or an honest "nothing yet". */
export function PriceBlock({
  item,
  lang,
  todayYmd,
}: {
  item: PortfolioDashboardItem;
  lang: string;
  todayYmd: string;
}) {
  const { t } = useTranslation();
  const rs = t('common.rs');
  const price = item.price;

  if (!price) {
    return (
      <p className="pf-nodata" role="note">
        <span aria-hidden="true">🌱 </span>
        {t('pages.portfolio.noPrice')}
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
      {price.isFallbackMarket && (
        <p className="pf-note pf-note--fallback" role="note">
          <span aria-hidden="true">ℹ️ </span>
          {t('pages.portfolio.fallbackMarket', { market: price.marketName })}
        </p>
      )}
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
 *  from a fallback, labelled "National forecast" when the home market is not the anchor. */
export function PredictionBlock({
  item,
  homeMarket,
  lang,
}: {
  item: PortfolioDashboardItem;
  homeMarket: PortfolioHomeMarket | null;
  lang: string;
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
        {showsNationalLabel(homeMarket) && (
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
