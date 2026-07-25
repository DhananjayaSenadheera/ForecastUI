// =============================================================================
// ForecastResult (FE-4, ClickUp 86cacw5xg). The app's signature screen — the
// honest harvest-price forecast panel. Renders inside the My Harvest workspace
// once the farmer hits "Get forecast".
//
// Four async states (loading skeleton / success / error+retry). Success surfaces
// uncertainty honestly:
//   - hero central price (the numeral IS the product) + exact harvest date
//   - a marked-centre P10–P90 band (never a bare interval), amber when low-trust
//   - confidence as pictograph dots + translated word + plain-language reason
//   - an amber "rough estimate" banner when confidence is Low / data is stale
//   - provenance line + a <details> table alternative (WCAG) for the band
// NO natural-frequency phrasing: the payload exposes no frequency field, so per
// owner decision #4 it is omitted rather than invented. RED is never used here
// (red = "Not recommended" verdict, FE-7); the verdict is a neutral hint.
// Presentation only — band geometry / low-trust / verdict-tone live in lib/forecast.
// =============================================================================
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarvestForecast } from '../api/types';
import { formatDate, formatPrice, mapConfidenceString, mapVerdict } from '../lib/format';
import { bandCentrePct, forecastVerdictTone, isLowTrust } from '../lib/forecast';
import WhyForecast from './WhyForecast';
import ShareForecast from './ShareForecast';

export interface ForecastResultProps {
  forecast: HarvestForecast | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Localized crop name from the picker; falls back to the payload cropName. */
  cropLabel?: string | null;
  /**
   * Extra content for the LEFT column, below the price-range block — in practice
   * the best-planting-window strip (2026-07-25). It is rendered in EVERY state,
   * including error and first-load, because it is a control the farmer uses to
   * change the very forecast those states describe: unmounting it would remove
   * the only way out of a failed or pending result.
   */
  windowSlot?: ReactNode;
}

const DOTS = 4; // pictograph is 4 dots; High fills 3 (●●●○), Fair 2, Low 1

export default function ForecastResult({
  forecast,
  loading,
  error,
  onRetry,
  cropLabel,
  windowSlot,
}: ForecastResultProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const rs = t('common.rs');
  const tableId = useId();

  const slot = windowSlot ? <div className="fc-window">{windowSlot}</div> : null;

  // ---- error ----------------------------------------------------------------
  if (error) {
    return (
      <>
        <div className="fc-state" role="alert">
          <p className="fc-state__title">{t('common.errorTitle')}</p>
          <p className="fc-state__body">{t('common.errorBody')}</p>
          <button type="button" className="btn-ghost fc-state__retry" onClick={onRetry}>
            {t('common.retry')}
          </button>
        </div>
        {slot}
      </>
    );
  }

  // ---- loading skeleton -----------------------------------------------------
  // Only when there is NOTHING to show yet. A re-run triggered from the window
  // strip below keeps the previous result on screen (flagged "Updating…" further
  // down) rather than collapsing the whole panel — swapping a full result for a
  // skeleton would unmount the strip the farmer just tapped and jump the page.
  if (!forecast) {
    return (
      <>
        <div className="fc fc--skeleton" aria-busy="true">
          <p className="sr-only">{t('common.loading')}</p>
          <div className="fc-skel fc-skel--hero" />
          <div className="fc-skel fc-skel--band" />
          <div className="fc-skel fc-skel--line" />
          <div className="fc-skel fc-skel--line fc-skel--short" />
        </div>
        {slot}
      </>
    );
  }

  // ---- success --------------------------------------------------------------
  const f = forecast;
  const name = cropLabel ?? f.cropName ?? '';
  const conf = mapConfidenceString(f.confidence);
  const lowTrust = isLowTrust(f);
  const centrePct = bandCentrePct(f.lowerBound, f.predictedPrice, f.upperBound);

  const midStr = formatPrice(f.predictedPrice, lang, rs);
  const loStr = formatPrice(f.lowerBound, lang, rs);
  const hiStr = formatPrice(f.upperBound, lang, rs);
  const nowStr = formatDate(new Date(), lang);

  const bandAria = t('forecast.bandAria', { mid: midStr, min: loStr, max: hiStr });

  const verdict = mapVerdict(f.recommendationLevel);
  const verdictTone = forecastVerdictTone(f.recommendationLevel);

  // A forecast is on screen AND a newer one is in flight (the farmer tapped a bar
  // on the strip below). Everything visible still belongs to the previous planting
  // date, so it is marked busy and labelled — but NOT dimmed: fading real numbers
  // would push their contrast under AA for the seconds it takes to land.
  const refreshing = loading;

  return (
    <div className={`fc${lowTrust ? ' fc--lowtrust' : ''}`} aria-busy={refreshing || undefined}>
      <div className="fc-layout">
        {/* ---- LEFT: hero price + marked-centre band ---- */}
        <div className="fc-main">
          <div className="fc-hero">
            <p className="fc-hero__crop">{name}</p>
            {f.harvestDate && (
              <p className="fc-hero__harvest">
                {t('forecast.harvestAround', { date: formatDate(f.harvestDate, lang) })}
              </p>
            )}
            <p className="fc-hero__price">
              <span className="fc-hero__num">{midStr}</span>
              <span className="fc-hero__unit">{t('common.perKg')}</span>
            </p>
            <p className="fc-hero__label">{t('forecast.expectedAt')}</p>
            {/* role=status announces the pending change without stealing focus
                from the bar that started it. */}
            {refreshing && (
              <p className="fc-hero__updating" role="status">
                {t('forecast.updating')}
              </p>
            )}
          </div>

          {/* Marked-centre P10–P90 band — never a bare interval. */}
          <div className={`fc-band${lowTrust ? ' is-low' : ''}`}>
            <p className="fc-band__title">{t('forecast.rangeTitle')}</p>
            <svg
              className="fc-band__svg"
              viewBox="0 0 320 34"
              preserveAspectRatio="none"
              role="img"
              aria-label={bandAria}
            >
              <rect className="fc-band__track" x="0" y="14" width="320" height="6" rx="3" />
              <rect className="fc-band__fill" x="0" y="12" width="320" height="10" rx="5" />
              <line
                className="fc-band__tick"
                x1={(centrePct / 100) * 320}
                y1="2"
                x2={(centrePct / 100) * 320}
                y2="32"
              />
            </svg>
            <div className="fc-band__labels">
              <span className="fc-band__end">
                <span className="fc-band__cap">{t('forecast.bandMin')}</span>
                <span className="fc-band__amt">{loStr}</span>
              </span>
              <span className="fc-band__end fc-band__end--mid" style={{ left: `${centrePct}%` }}>
                <span className="fc-band__cap">{t('forecast.bandMid')}</span>
                <span className="fc-band__amt">{midStr}</span>
              </span>
              <span className="fc-band__end fc-band__end--hi">
                <span className="fc-band__cap">{t('forecast.bandMax')}</span>
                <span className="fc-band__amt">{hiStr}</span>
              </span>
            </div>
          </div>

          {/* Table alternative for the band (WCAG). */}
          <details className="fc-table">
            <summary className="fc-table__summary">
              <span aria-hidden="true">📋 </span>
              {t('forecast.tableToggle')}
            </summary>
            <table className="fc-table__grid" aria-describedby={tableId}>
              <caption id={tableId} className="sr-only">
                {t('forecast.rangeTitle')}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t('forecast.tableWhat')}</th>
                  <th scope="col" className="fc-table__num">
                    {t('forecast.tablePrice')}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{t('forecast.bandMid')}</th>
                  <td className="fc-table__num">{midStr}</td>
                </tr>
                <tr>
                  <th scope="row">{t('forecast.bandMin')}</th>
                  <td className="fc-table__num">{loStr}</td>
                </tr>
                <tr>
                  <th scope="row">{t('forecast.bandMax')}</th>
                  <td className="fc-table__num">{hiStr}</td>
                </tr>
                <tr>
                  <th scope="row">{t('forecast.currentPrice')}</th>
                  <td className="fc-table__num">{formatPrice(f.currentPrice, lang, rs)}</td>
                </tr>
              </tbody>
            </table>
          </details>

          {/* Best planting window (2026-07-25). Placed AFTER the range block and
              its table alternative — the table is that block's text equivalent, so
              nothing may come between them — and inside the left column, where the
              hero price, the P10–P90 range and today's price give the min-max
              scaled bars something to be judged against. */}
          {slot}
        </div>

        {/* ---- RIGHT: confidence + verdict + provenance ---- */}
        <aside className="fc-side">
          {lowTrust && (
            <div className="fc-lowtrust" role="note">
              <p className="fc-lowtrust__title">
                <span aria-hidden="true">⚠ </span>
                {t('forecast.lowTrustTitle')}
              </p>
              <p className="fc-lowtrust__body">{t('forecast.lowTrustLead')}</p>
              {f.explanation && <p className="fc-lowtrust__reason">{f.explanation}</p>}
            </div>
          )}

          <div className={`fc-conf fc-conf--${conf.tone}`}>
            <p className="fc-conf__label">{t('confidence.label')}</p>
            <p className="fc-conf__row">
              <span className="fc-dots" aria-hidden="true">
                {Array.from({ length: DOTS }).map((_, i) => (
                  <span key={i} className={`fc-dot${i < conf.dots ? ' is-on' : ''}`} />
                ))}
              </span>
              <span className="fc-conf__word">{t(conf.labelKey)}</span>
            </p>
            {!lowTrust && f.explanation && <p className="fc-conf__reason">{f.explanation}</p>}
          </div>

          {/* Neutral verdict hint (full verdict card = FE-7; never red here). */}
          <div className={`fc-take fc-take--${verdictTone}`}>
            <p className="fc-take__label">{t('forecast.takeLabel')}</p>
            <p className="fc-take__verdict">{t(verdict.labelKey)}</p>
            {f.reason && <p className="fc-take__reason">{f.reason}</p>}
          </div>

          {/* "Why this forecast?" factor breakdown (FE-6) — structured when the
              API-5 topFactors are present, honest degraded note otherwise. */}
          <WhyForecast factors={f.topFactors} explanation={f.explanation} />

          {/* Share this forecast as plain text (FE-11) — only in the success view. */}
          <ShareForecast forecast={f} cropLabel={name} />

          <p className="fc-prov">
            <span className="prov">{t('common.source')}</span>
            <span className="fc-prov__asof">{t('forecast.provAsOf', { date: nowStr })}</span>
          </p>
        </aside>
      </div>
    </div>
  );
}
