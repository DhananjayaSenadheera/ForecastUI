// WhyForecast — the collapsible "Why this price?" panel on the harvest result.
// Two honest modes:
//   1. STRUCTURED: a `topFactors` list of stable reason CODES. Each row is a full causal
//      sentence (cause -> everyday consequence -> direction) plus a muted
//      "<factor> · <strength> effect" caption.
//   2. DEGRADED (fallback predictor, or no factors): the free-text `explanation` plus an
//      honest note that no detailed breakdown exists for this crop yet. Never invented
//      factors, never an empty panel.
// Sentences, not "topic + arrow": the old row said "Seasonal supply / Pushes price down",
// naming the topic and the effect but omitting the STATE (supply will be plentiful), which
// collides with a farmer's own causal model and makes the panel read wrong.
// ROW RENDERING IS PER-LOCALE BY DESIGN. The sentences are long-form prose shipped
// English-first; si/ta get them when a native speaker writes them. A row renders in
// whichever mode its ACTIVE LOCALE supports: sentence mode when the locale owns that row's
// `factor.sentence.*` (plus the strength word, plus `factor.cropGeneric` when the sentence
// interpolates {{crop}} and no crop name was passed), otherwise the compact rendering
// (translated label + "pushes price up/down" + weight bar) that si/ta already have in full.
// The gate is `hasOwnTranslation` — a real per-locale resource lookup — NOT `i18n.exists()`
// or try/catch: i18next resolves through fallbackLng, so both would report English prose as
// present and leak it to a Sinhala farmer.
// Disclosure uses a button + region (aria-expanded / aria-controls) rather than <details>,
// so the default-open state can be responsive (open on desktop, collapsed on mobile) and
// aria-expanded is assertable. It is seeded once at mount and does not track resizes.
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ForecastFactor } from '../api/types';
import i18n, { hasOwnTranslation, ownTranslation } from '../i18n';
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

/** Does a sentence template actually interpolate the crop name? (i18next `{{crop}}`) */
const CROP_VAR = /\{\{\s*crop\s*\}\}/;

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
  // Both "Capsicum prices have been climbing" and "This crop's prices have been climbing"
  // are grammatical, so one template covers a missing crop name.
  const crop = cropLabel?.trim() || t('factor.cropGeneric');
  // But `factor.cropGeneric` is itself English-first, so it is a third way English can get
  // wedged inside a translated sentence. Checked per ROW, and only for sentences that
  // actually interpolate {{crop}}: pushing an unrelated row back to compact over a word it
  // never renders would be a false degradation.
  const hasCropName = !!cropLabel?.trim();
  const cropWordOk = hasCropName || hasOwnTranslation('factor.cropGeneric');

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

              // Sentence mode needs the sentence AND (when there is a magnitude) the
              // strength word in THIS locale — a half-translated row is worse than the
              // compact one. A neutral row's sentence already names the factor and states
              // the magnitude, so it needs no caption and no strength word.
              const wantsCaption = f.direction !== 'neutral';
              const sentenceKey = factorSentenceKey(f.code, f.direction);
              const template = ownTranslation(sentenceKey);
              const useSentence =
                template !== undefined &&
                (cropWordOk || !CROP_VAR.test(template)) &&
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

              // Compact mode: what si/ta render until their sentences land, so they never
              // see English prose.
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
