// PredictionBlock — a forecast for one crop: a range with a confidence word, de-rated when
// it came from a fallback, labelled "National forecast" beside a market that is not the
// model's anchor.
//
// It renders TWO different forecasts and must keep rendering them the same way:
//   • the crop page's frozen nightly SNAPSHOT (PortfolioDashboardItem.prediction), and
//   • step 7's forecast for the farmer's OWN planting date, which comes from the harvest
//     route and is renamed into this shape by predictionFromHarvestForecast().
// That is why the prop is a prediction and not a dashboard item: the trust presentation —
// which confidence word, when the "rough estimate" caution appears, whether the National
// label is needed — is one implementation for both, so a second surface can never quietly
// present a fallback more confidently than the first. `lowTrust` is the harvest route's own
// stale/fallback-DATA flag; it can only ever ADD the caution, never remove it.
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
import type { PortfolioDashboardMarket } from '../api/types';
import { formatDate, formatPrice, formatRange, mapConfidenceString } from '../lib/format';
import { isDeratedPrediction, showsNationalLabel, type DisplayPrediction } from '../lib/portfolio';

export default function PredictionBlock({
  prediction,
  market,
  lang,
  lowTrust = false,
}: {
  prediction: DisplayPrediction | null;
  /** The market the prediction is shown BESIDE — it decides whether the "National forecast"
   *  label is needed, not which number is shown (there is one forecast per crop). */
  market: PortfolioDashboardMarket | null;
  lang: string;
  /** The harvest route's own `lowTrust` flag (old data behind an otherwise model-served
   *  number). ORed into the de-rating: a caution may always be ADDED by a second signal,
   *  never withdrawn by one. */
  lowTrust?: boolean;
}) {
  const { t } = useTranslation();
  const rs = t('common.rs');
  const p = prediction;

  if (!p) {
    return (
      <p className="pf-nodata" role="note">
        <span aria-hidden="true">🔎 </span>
        {t('pages.portfolio.noPrediction')}
      </p>
    );
  }

  const conf = mapConfidenceString(p.confidence);
  const derated = isDeratedPrediction(p) || lowTrust;

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
        {showsNationalLabel(market) && (
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
