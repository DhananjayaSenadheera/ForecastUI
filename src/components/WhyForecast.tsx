// =============================================================================
// WhyForecast (FE-6, ClickUp 86cacw5xq). The collapsible "Why this forecast?"
// factor / explanation panel on the harvest result view.
//
// Two honest modes:
//   1. STRUCTURED (API-5, provisional): a `topFactors` list of stable reason
//      CODES the UI maps to farmer-language i18n labels. Each row is direction
//      glyph + WORD (never color-only, never a verdict) + localized label +
//      optional shared-scale weight bar. Unknown codes degrade to the raw code
//      shown muted — never a broken/empty row.
//   2. DEGRADED (the common case today: fallback predictor / pre-API-5, no
//      factors): the free-text `explanation` sentence + an honest note that a
//      detailed breakdown isn't available for this crop yet. NEVER invented
//      factors, NEVER an empty panel.
//
// Disclosure: WAI-ARIA button + region (aria-expanded / aria-controls) rather
// than native <details>, so the default-open state can be responsive (open on
// desktop >=1024px, collapsed on mobile) AND aria-expanded is assertable. State
// is seeded once from the breakpoint at mount; it does not track live resizes.
// =============================================================================
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ForecastFactor } from '../api/types';
import i18n from '../i18n';
import {
  factorDirectionKey,
  factorGlyph,
  factorLabelKey,
  factorWeightPct,
  maxFactorWeight,
} from '../lib/forecast';

const DESKTOP_QUERY = '(min-width: 1024px)';

/** Default-open on desktop, collapsed on mobile. Guards SSR/jsdom (no matchMedia). */
function initialOpen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

export interface WhyForecastProps {
  factors?: ForecastFactor[] | null;
  /** Free-text data-basis sentence — shown in the degraded (no-factors) mode. */
  explanation: string;
}

export default function WhyForecast({ factors, explanation }: WhyForecastProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(initialOpen);
  const panelId = useId();

  const list = Array.isArray(factors) ? factors : [];
  const hasFactors = list.length > 0;
  const maxWeight = maxFactorWeight(list);

  return (
    <section className="wf">
      <h3 className="sr-only">{t('factor.title')}</h3>
      <button
        type="button"
        className="wf-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="wf-toggle__label">{t('factor.title')}</span>
        <span className="wf-toggle__chevron" aria-hidden="true" data-open={open}>
          ▾
        </span>
      </button>

      <div id={panelId} className="wf-body" hidden={!open}>
        {hasFactors ? (
          <ul className="wf-list">
            {list.map((f, i) => {
              const known = i18n.exists(factorLabelKey(f.code));
              const label = known ? t(factorLabelKey(f.code)) : f.code;
              const pct = factorWeightPct(f.weight, maxWeight);
              return (
                <li className="wf-factor" key={`${f.code}-${i}`}>
                  <span className={`wf-factor__dir wf-factor__dir--${f.direction}`}>
                    <span className="wf-factor__glyph" aria-hidden="true">
                      {factorGlyph[f.direction]}
                    </span>
                    <span className="wf-factor__dirword">{t(factorDirectionKey(f.direction))}</span>
                  </span>
                  <span className="wf-factor__body">
                    <span className={`wf-factor__label${known ? '' : ' wf-factor__label--raw'}`}>
                      {label}
                    </span>
                    {pct != null && (
                      <span
                        className="wf-factor__bar"
                        role="img"
                        aria-label={t('factor.weightAria', { pct: Math.round(pct) })}
                      >
                        <span className="wf-factor__barfill" style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="wf-degraded">
            {explanation && <p className="wf-degraded__explain">{explanation}</p>}
            <p className="wf-degraded__note">{t('factor.noBreakdown')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
