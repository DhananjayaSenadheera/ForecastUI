// PlantedDateSection — "when did you plant this?", and the answer that follows from it.
//
// This is the section that replaced the card's forecast block in step 6. The card used to
// print a national snapshot forecast beside a crop the farmer might not even have in the
// ground; now the farmer records the day they planted, and the card answers the question
// they actually have: what will THIS planting be worth when it is ready.
//
// Two states, one section:
//   • no date  -> an invitation ("When did you plant this crop?") and a date field. Nothing
//                 forecast-shaped is shown, because without a planting day there is no
//                 harvest day to forecast for and a national snapshot is not an answer.
//   • a date   -> "Planted <date>", the forecast for that planting, and the way to change
//                 or remove the date. The forecast comes from the SAME harvest route the My
//                 harvest page calls, with the SAME crop and date, so the two screens can
//                 never quote different numbers for one question.
//
// Honesty rules that shape this file:
//  - The forecast is rendered by PredictionBlock, the same component the crop page uses.
//    There is no second confidence mapper and no second de-rating rule here; the harvest
//    route's own `lowTrust` flag is handed over as an EXTRA de-rating signal, which can
//    only ever make the claim smaller.
//  - Every path out of the fetch resolves: loading shows a skeleton with aria-busy, a
//    failure says so in words and offers a retry, and neither one is left announcing work
//    that will never finish.
//  - The date the farmer typed is never discarded on a refusal. A rejected save keeps the
//    field open with their date in it and says why.
//  - Nothing here is red. Removing a date destroys nothing that cannot be typed again in
//    five seconds, so it is a quiet ghost button, not a destructive confirm.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type {
  HarvestForecast,
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
} from '../api/types';
import { formatDate } from '../lib/format';
import {
  PLANTED_DATE_MIN,
  harvestLinkFor,
  isPlantedDateAllowed,
  plantedDateMax,
  predictionFromHarvestForecast,
} from '../lib/portfolio';
import PredictionBlock from './PredictionBlock';

/** What the page's write machinery reports back: a tone and an i18n key, exactly the shape
 *  PortfolioPage puts in its own status region. */
export interface WriteMessage {
  tone: 'ok' | 'warn' | 'error';
  key: string;
}

/** The forecast for one planting, as four honest states. `idle` is "no planting date, so
 *  there is nothing to ask about" — deliberately distinct from `loading`. */
export type PlantedForecastState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; forecast: HarvestForecast }
  | { status: 'error' };

/**
 * The harvest forecast for ONE crop at ONE planting date, cached per pair.
 *
 * The state is DERIVED from the (crop, date) key rather than stored beside it: the moment
 * the farmer changes their planting date the key changes, the cache has no entry for it and
 * the section is `loading` in the same render. That is the step-6 lesson — "reset derived
 * state before refetching" — met by construction, so there is no window in which the old
 * date's number sits under the new date's label.
 *
 * `requested` is a ref so React 18's dev double-mount cannot fire the same call twice, and
 * a failure is CACHED as an error rather than retried on every render: on a rural
 * connection a silent retry loop is a bill the farmer pays. `retry` is the way back, and it
 * clears both the cache entry and the request mark.
 */
export function usePlantedForecast(
  cropId: string,
  plantedDate: string | null,
): { state: PlantedForecastState; retry: () => void } {
  type Entry = { status: 'ok'; forecast: HarvestForecast } | { status: 'error' };
  const [cache, setCache] = useState<Record<string, Entry>>({});
  const requested = useRef<Set<string>>(new Set());
  // Bumped by retry(): the request mark for this key has just been cleared, and the effect
  // has to run again to notice. It is a counter rather than a dependency on `cache` itself,
  // so the effect that WRITES the cache is not also woken by every write to it.
  const [attempt, setAttempt] = useState(0);
  const key = plantedDate ? `${cropId}:${plantedDate}` : null;

  useEffect(() => {
    if (!key || !plantedDate) return;
    if (requested.current.has(key)) return;
    requested.current.add(key);
    api
      .getHarvestForecast(cropId, plantedDate)
      .then((f) => setCache((prev) => ({ ...prev, [key]: { status: 'ok', forecast: f } })))
      .catch(() => setCache((prev) => ({ ...prev, [key]: { status: 'error' } })));
  }, [cropId, plantedDate, key, attempt]);

  const retry = useCallback(() => {
    if (!key) return;
    requested.current.delete(key);
    setCache((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setAttempt((n) => n + 1);
  }, [key]);

  const state: PlantedForecastState = !key ? { status: 'idle' } : (cache[key] ?? { status: 'loading' });
  return { state, retry };
}

export interface PlantedDateSectionProps {
  item: PortfolioDashboardItem;
  /** The market this surface is showing. Used ONLY to decide whether the forecast needs the
   *  "National forecast" label — the number is national either way. */
  market: PortfolioDashboardMarket | null;
  lang: string;
  /** Today as "YYYY-MM-DD", passed in so the date bounds stay testable. */
  todayYmd: string;
  forecast: PlantedForecastState;
  onRetryForecast: () => void;
  /** Saves (a date) or CLEARS (null) the planting day and answers with the message to show.
   *  Null means the write reported nothing — treated as neither success nor failure. */
  onSave: (cropId: string, plantedDate: string | null) => Promise<WriteMessage | null>;
  /** A write is in flight somewhere on the page: every control here is disabled. */
  busy: boolean;
  /** DOM id prefix. The card and the popup over it are BOTH mounted at once, so a fixed id
   *  would give one label two inputs to point at and break both. */
  idPrefix: string;
  /** 3 inside the popup (under its h2), 4 on the card (under the crop's h3). */
  headingLevel?: 3 | 4;
}

export default function PlantedDateSection({
  item,
  market,
  lang,
  todayYmd,
  forecast,
  onRetryForecast,
  onSave,
  busy,
  idPrefix,
  headingLevel = 4,
}: PlantedDateSectionProps) {
  const { t } = useTranslation();
  const plantedDate = item.plantedDate;
  const [editing, setEditing] = useState(false);
  // Seeded from the recorded date so "Change" opens on the day already saved; today when
  // there is none, because a farmer recording a planting usually just planted.
  const [draft, setDraft] = useState<string>(plantedDate ?? todayYmd);
  const [msg, setMsg] = useState<WriteMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const editBtn = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The control the farmer used can unmount under them (the field becomes a date line, the
  // date line becomes a field), so focus is sent somewhere deliberate each time instead of
  // being dropped on <body>.
  const [pendingFocus, setPendingFocus] = useState<'input' | 'edit' | null>(null);

  const headingId = `${idPrefix}-plant-head-${item.cropId}`;
  const inputId = `${idPrefix}-plant-date-${item.cropId}`;
  const hintId = `${idPrefix}-plant-hint-${item.cropId}`;
  const Heading = headingLevel === 3 ? 'h3' : 'h4';

  useEffect(() => {
    if (pendingFocus === null) return;
    if (pendingFocus === 'input') inputRef.current?.focus();
    else editBtn.current?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  // A date saved (or cleared) somewhere else — the popup while the card is open behind it —
  // closes this copy's editor rather than leaving a stale field over a changed fact.
  useEffect(() => {
    setEditing(false);
    setDraft(plantedDate ?? todayYmd);
    // todayYmd is recomputed on every render but its VALUE only changes at midnight, so it
    // is a safe dependency: this does not re-run on ordinary parent re-renders and cannot
    // wipe a half-typed date.
  }, [plantedDate, todayYmd]);

  const save = useCallback(
    async (value: string | null) => {
      // Refuse out-of-range dates before the round trip, with the SAME sentence the server's
      // invalid_planted_date answers with — one refusal, one wording, whoever spots it.
      if (value !== null && !isPlantedDateAllowed(value, todayYmd)) {
        setMsg({ tone: 'error', key: 'pages.portfolio.errInvalidPlantedDate' });
        return;
      }
      setSaving(true);
      setMsg(null);
      try {
        const result = await onSave(item.cropId, value);
        setMsg(result);
        if (result?.tone === 'error') {
          // The farmer's date stays in the field, exactly as they left it.
          setPendingFocus('input');
          return;
        }
        setEditing(false);
        // Setting a date replaces the field with the date line; clearing replaces it with
        // the invitation, whose field is the natural landing place.
        setPendingFocus(value === null ? 'input' : 'edit');
      } finally {
        setSaving(false);
      }
    },
    [item.cropId, onSave, todayYmd],
  );

  const disabled = busy || saving;
  const showField = editing || !plantedDate;

  return (
    <section className="pf-plant" aria-labelledby={headingId}>
      <Heading className="pf-plant__head" id={headingId}>
        {plantedDate && !editing
          ? t('pages.portfolio.plantedForecastHeading')
          : t('pages.portfolio.plantedQuestion')}
      </Heading>

      {plantedDate && !editing && (
        <p className="pf-plant__on">
          <span className="pf-plant__date">
            {t('pages.portfolio.plantedOn', { date: formatDate(plantedDate, lang) })}
          </span>
          <button
            type="button"
            ref={editBtn}
            className="pf-plant__link"
            disabled={disabled}
            onClick={() => {
              setMsg(null);
              setDraft(plantedDate);
              setEditing(true);
              setPendingFocus('input');
            }}
            aria-label={t('pages.portfolio.editPlantedDateAria', { crop: item.cropName })}
          >
            {t('pages.portfolio.editPlantedDate')}
          </button>
          <button
            type="button"
            className="pf-plant__link"
            disabled={disabled}
            onClick={() => void save(null)}
            aria-label={t('pages.portfolio.clearPlantedDateAria', { crop: item.cropName })}
          >
            {t('pages.portfolio.clearPlantedDate')}
          </button>
        </p>
      )}

      {showField && (
        <div className="pf-plant__form">
          <label className="pf-plant__label" htmlFor={inputId}>
            {t('pages.portfolio.plantedDateLabel')}
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="date"
            className="pf-plant__input"
            value={draft}
            // The server's floor, and today as the ceiling — a planting is something that
            // has happened, not something planned.
            min={PLANTED_DATE_MIN}
            max={plantedDateMax(todayYmd)}
            disabled={disabled}
            aria-describedby={hintId}
            onChange={(e) => {
              setMsg(null);
              setDraft(e.target.value);
            }}
          />
          <p className="pf-plant__hint" id={hintId}>
            {t('pages.portfolio.plantedDateHint')}
          </p>
          <div className="pf-plant__actions">
            <button
              type="button"
              className="btn-primary pf-plant__save"
              disabled={disabled}
              onClick={() => void save(draft)}
              aria-label={t('pages.portfolio.savePlantedDateAria', { crop: item.cropName })}
            >
              {t('pages.portfolio.savePlantedDate')}
            </button>
            {/* Only when there is a recorded date to fall back to: "Cancel" on the first
                entry would suggest there is something to go back to, and there is not. */}
            {editing && plantedDate && (
              <button
                type="button"
                className="btn-ghost pf-plant__cancel"
                disabled={disabled}
                onClick={() => {
                  setMsg(null);
                  setDraft(plantedDate);
                  setEditing(false);
                  setPendingFocus('edit');
                }}
              >
                {t('pages.portfolio.cancelPlantedDate')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* The result of the farmer's OWN action, beside the control they used — not at the
          bottom of a page they may not be looking at, and certainly not behind the popup. */}
      <p
        className={`pf-plant__msg${msg ? ` pf-plant__msg--${msg.tone}` : ''}`}
        role="status"
        aria-live="polite"
      >
        {msg && t(msg.key)}
      </p>

      {plantedDate && !editing && (
        <PlantedForecast
          item={item}
          market={market}
          lang={lang}
          state={forecast}
          onRetry={onRetryForecast}
        />
      )}
    </section>
  );
}

/** The forecast for the recorded planting, in its four states. Rendered by the shared
 *  PredictionBlock so the range, the confidence word and the de-rating are the same
 *  presentation the rest of the app uses. */
function PlantedForecast({
  item,
  market,
  lang,
  state,
  onRetry,
}: {
  item: PortfolioDashboardItem;
  market: PortfolioDashboardMarket | null;
  lang: string;
  state: PlantedForecastState;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <div className="pf-skel pf-skel--pred" aria-busy="true">
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (state.status === 'error') {
    // An honest admission, not an alarm: the price above it is untouched and the farmer is
    // given the way to ask again.
    return (
      <div className="pf-plant__fcerr">
        <p className="pf-nodata" role="note">
          <span aria-hidden="true">🔎 </span>
          {t('pages.portfolio.plantedForecastFailed')}
        </p>
        <button type="button" className="btn-ghost pf-plant__retry" onClick={onRetry}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <>
      <PredictionBlock
        prediction={predictionFromHarvestForecast(state.forecast)}
        market={market}
        lang={lang}
        lowTrust={state.forecast.lowTrust}
      />
      <p className="pf-plant__more">
        <Link
          className="pf-card__link"
          to={harvestLinkFor(item.cropId, item.plantedDate)}
          aria-label={t('pages.portfolio.openHarvestAria', { crop: item.cropName })}
        >
          {t('pages.portfolio.openHarvest')}
        </Link>
      </p>
    </>
  );
}
