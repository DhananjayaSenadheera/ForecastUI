// PredictionBlock — the frozen snapshot forecast for a crop: a range with a confidence word,
// de-rated when it came from a fallback, labelled "National forecast" beside a market that is
// not the model's anchor.
//
// It lived inside WatchlistCard until step 6, when the card stopped carrying a forecast
// section (the planted-date-driven replacement is step 7). Moved to its own file rather than
// left exported from a component that no longer renders it — the crop detail page is now its
// only caller, and an export nobody on the card uses is a trap for the next reader.
//
// The honesty rules it encodes (PRD §3.6, §5.2):
//  - The prediction is a RANGE with a confidence word; the band is never collapsed into the
//    single number above it.
//  - A fallback-served prediction is visibly de-rated — never hidden, never upgraded.
//  - Beside a market that is not the anchor it carries the "National forecast" label,
//    because the model has only ever served one national price per crop.
//  - Nothing here is red. Red is reserved app-wide for the "Not recommended" verdict.
//
// It branches on the PRESENCE of the prediction, not on `predictionUnavailableReason`. That
// is deliberate while that field has exactly one code ("no_snapshot"): switching on a
// one-member set buys nothing and would silently drop an unknown future code into a blank
// space. When a second code appears, branch here.
import { useTranslation } from 'react-i18next';
import type { PortfolioDashboardItem, PortfolioDashboardMarket } from '../api/types';
import { formatDate, formatPrice, formatRange, mapConfidenceString } from '../lib/format';
import { isDeratedPrediction, showsNationalLabel } from '../lib/portfolio';

export default function PredictionBlock({
  item,
  market,
  lang,
  economicCenterIds,
}: {
  item: PortfolioDashboardItem;
  market: PortfolioDashboardMarket | null;
  lang: string;
  /** Economic-centre market ids; absent = the national label is shown (see
   *  showsNationalLabel — the safe direction). */
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
          <span className="pf-tag pf-tag--national">{t('pages.portfolio.nationalForecast')}</span>
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
