// =============================================================================
// WhyForecast (FE-6, ClickUp 86cacw5xq / 86cawu59h). The collapsible
// "Why this price?" factor / explanation panel on the harvest result view.
//
// Two honest modes:
//   1. STRUCTURED (API-5): a `topFactors` list of stable reason CODES. Each row
//      is a full CAUSAL SENTENCE — cause -> everyday consequence -> direction —
//      plus a muted "<factor> · <strength> effect" caption.
//   2. DEGRADED (fallback predictor / no factors): the free-text `explanation`
//      sentence + an honest note that a detailed breakdown isn't available for
//      this crop yet. NEVER invented factors, NEVER an empty panel.
//
// WHY SENTENCES, NOT `topic + arrow`: the old row said "Seasonal supply /
// Pushes price down" — it named the TOPIC and the EFFECT but omitted the STATE
// (supply will be plentiful). A farmer's own causal model ("low supply -> high
// demand -> price up") then collides with the arrow and the panel reads wrong.
// Lay-user XAI work finds natural-language causal templates the best-performing
// explanation format; smallholder-advisory work adds spoken-style sentences,
// concrete referents and HEDGED predictions ("usually", never "will").
//
// ROW RENDERING IS PER-LOCALE, BY DESIGN. The sentences are long-form prose and
// ship English-first; si/ta get them when a native speaker writes them, never
// from a machine. A row therefore renders in whichever mode its ACTIVE LOCALE
// can actually support:
//   * sentence mode — locale owns `factor.sentence.*` (+ the strength word)
//   * compact mode  — the previous rendering (translated factor label +
//                     translated "pushes price up/down" + weight bar), which
//                     si/ta already have in full.
// The gate is `hasOwnTranslation` (a real per-locale resource lookup), NOT
// `i18n.exists()`/try-catch: i18next resolves through fallbackLng, so both of
// those would report English prose as "present" and leak it to a Sinhala farmer.
//
// Disclosure: WAI-ARIA button + region (aria-expanded / aria-controls) rather
// than native <details>, so the default-open state can be responsive (open on
// desktop >=1024px, collapsed on mobile) AND aria-expanded is assertable. State
// is seeded once from the breakpoint at mount; it does not track live resizes.
// =============================================================================
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ForecastFactor } from '../api/types';
import i18n, { hasOwnTranslation } from '../i18n';
import {
  factorDirectionKey,
  factorGlyph,
  factorLabelKey,
  factorSentenceKey,
  factorStrength,
  factorStrengthKey,
  factorWeightPct,
  maxFactorWeight,
  totalFactorWeight,
} from '../lib/forecast';
import { FactorIcon } from './factorIcons';

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
  /** Localized crop name, interpolated into the price-trend sentence. */
  cropLabel?: string | null;
}

export default function WhyForecast({ factors, explanation, cropLabel }: WhyForecastProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(initialOpen);
  const panelId = useId();

  const list = Array.isArray(factors) ? factors : [];
  const hasFactors = list.length > 0;
  const maxWeight = maxFactorWeight(list);
  const totalWeight = totalFactorWeight(list);
  // "Capsicum prices have been climbing" / "This crop's prices have been
  // climbing" — both grammatical, so one template covers a missing crop name.
  const crop = cropLabel?.trim() || t('factor.cropGeneric');

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
              const strength = factorStrength(f.weight, totalWeight);

              // Sentence mode needs the sentence AND (when there is a magnitude)
              // the strength word in THIS locale — a half-translated row reading
              // "කන්නයට අනුව සැපයුම · strong effect" is worse than the compact one.
              // A neutral row's sentence already names the factor AND states the
              // magnitude ("... made little difference this time"), so it needs
              // no caption — and therefore no strength word to render.
              const wantsCaption = f.direction !== 'neutral';
              const sentenceKey = factorSentenceKey(f.code, f.direction);
              const useSentence =
                hasOwnTranslation(sentenceKey) &&
                (!wantsCaption || strength == null || hasOwnTranslation(factorStrengthKey(strength)));

              if (useSentence) {
                const caption = !wantsCaption
                  ? null
                  : strength
                    ? t('factor.caption', { label, strength: t(factorStrengthKey(strength)) })
                    : label;
                return (
                  <li
                    className={`wf-factor wf-factor--sentence wf-factor--${f.direction}`}
                    key={`${f.code}-${i}`}
                  >
                    <span className="wf-factor__icon" aria-hidden="true">
                      <FactorIcon code={f.code} />
                    </span>
                    <span className="wf-factor__body">
                      <p className="wf-factor__sentence">
                        {/* The arrow rides WITH the sentence (which states the
                            consequence in words), never beside a bare topic. */}
                        <span className="wf-factor__glyph" aria-hidden="true">
                          {factorGlyph[f.direction]}
                        </span>
                        {t(sentenceKey, { crop, label })}
                      </p>
                      {/* Magnitude in WORDS. The bar below only echoes it, so the
                          bar is decorative — the caption is the real carrier. */}
                      {caption && <p className="wf-factor__caption">{caption}</p>}
                      {pct != null && (
                        <span className="wf-factor__bar" aria-hidden="true">
                          <span className="wf-factor__barfill" style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </span>
                  </li>
                );
              }

              // Compact mode — unchanged from the previous release. This is what
              // si/ta render until their sentences land, so they see no English
              // prose and no regression.
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
