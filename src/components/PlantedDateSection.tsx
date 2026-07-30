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
//  - ONE thing here is red: the button that really does remove the date. That is the same
//    exception the remove-crop confirm claims (portfolio.css names it) — red marks
//    destruction, never a falling price and never a warning.
//
// WHO OWNS REMOVING THE DATE (`clearControl`, 2026-07-30):
//   'none'    — the card. There is no Remove control on it at all. A destructive control
//               repeated across ten cards, one tap from the thumb, next to no room for the
//               question "why?", is an accident waiting to happen.
//   'confirm' — the "More details" popup. Remove opens an inline confirm that asks for a
//               reason (required) and an optional note, because the server now records WHY a
//               planting date went away — a harvested planting and a typo are different
//               facts and only the farmer knows which this was.
// The prop is EXPLICIT rather than inferred from idPrefix, exactly like forecastLayout: a
// behaviour decision should read as one at the call site.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import {
  CLEAR_REASON_NOTE_MAX,
  PLANTED_DATE_CLEAR_REASONS,
  type HarvestForecast,
  type PlantedDateClearReason,
  type PlantedDateClearRequest,
  type PortfolioDashboardItem,
  type PortfolioDashboardMarket,
} from '../api/types';
import { formatDate } from '../lib/format';
import {
  PLANTED_DATE_MIN,
  canSubmitClearReason,
  harvestLinkFor,
  isPlantedDateAllowed,
  plantedDateMax,
  predictionFromHarvestForecast,
} from '../lib/portfolio';
import PredictionBlock, { type PredictionLayout } from './PredictionBlock';

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
  /** Saves the planting day and answers with the message to show. Null means the write
   *  reported nothing — treated as neither success nor failure. */
  onSave: (cropId: string, plantedDate: string) => Promise<WriteMessage | null>;
  /** REMOVES the planting day, carrying the reason the farmer picked (and their note, if they
   *  wrote one). Only ever called from the confirm below, so it can never be a bare clear —
   *  which the server refuses. Required whenever clearControl is 'confirm'. */
  onClear?: (cropId: string, clear: PlantedDateClearRequest) => Promise<WriteMessage | null>;
  /** A write is in flight somewhere on the page: every control here is disabled. */
  busy: boolean;
  /** DOM id prefix. The card and the popup over it are BOTH mounted at once, so a fixed id
   *  would give one label two inputs to point at and break both. */
  idPrefix: string;
  /** 3 inside the popup (under its h2), 4 on the card (under the crop's h3). */
  headingLevel?: 3 | 4;
  /** How the forecast underneath is arranged (see PredictionBlock): the card asks for the
   *  two-column 'split' block, the popup keeps the stacked lines. Passed EXPLICITLY rather
   *  than inferred from idPrefix — a layout decision should read as one. */
  forecastLayout?: PredictionLayout;
  /** Who owns removing the date on this surface (see the header). 'none' renders NO Remove
   *  control at all; 'confirm' renders it with the reason confirm behind it. Defaults to
   *  'none' so a new surface cannot destroy the farmer's date by simply mounting. */
  clearControl?: 'none' | 'confirm';
}

/** The four reasons, in wire order, each with the label the farmer reads. The wire strings
 *  are frozen camelCase and are never shown; the key is only a label. */
const REASON_LABEL_KEYS: Record<PlantedDateClearReason, string> = {
  harvested: 'pages.portfolio.clearReasonHarvested',
  cropFailed: 'pages.portfolio.clearReasonCropFailed',
  enteredByMistake: 'pages.portfolio.clearReasonEnteredByMistake',
  other: 'pages.portfolio.clearReasonOther',
};

export default function PlantedDateSection({
  item,
  market,
  lang,
  todayYmd,
  forecast,
  onRetryForecast,
  onSave,
  onClear,
  busy,
  idPrefix,
  headingLevel = 4,
  forecastLayout = 'lines',
  clearControl = 'none',
}: PlantedDateSectionProps) {
  const { t } = useTranslation();
  const plantedDate = item.plantedDate;
  const [editing, setEditing] = useState(false);
  // Seeded from the recorded date so "Change" opens on the day already saved; today when
  // there is none, because a farmer recording a planting usually just planted.
  const [draft, setDraft] = useState<string>(plantedDate ?? todayYmd);
  const [msg, setMsg] = useState<WriteMessage | null>(null);
  const [saving, setSaving] = useState(false);
  // The remove flow: closed, or open with the farmer's answer so far. `reason` starts EMPTY
  // and nothing is preselected — a preselected "Harvested" would put words in the farmer's
  // mouth and get recorded as a fact they never stated.
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState<PlantedDateClearReason | null>(null);
  const [note, setNote] = useState('');
  const editBtn = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const removeBtn = useRef<HTMLButtonElement>(null);
  const firstReasonRef = useRef<HTMLInputElement>(null);
  const yesBtn = useRef<HTMLButtonElement>(null);
  // The control the farmer used can unmount under them (the field becomes a date line, the
  // date line becomes a field, the Remove button becomes a confirm), so focus is sent
  // somewhere deliberate each time instead of being dropped on <body>.
  const [pendingFocus, setPendingFocus] = useState<
    'input' | 'edit' | 'remove' | 'reason' | 'yes' | null
  >(null);

  const headingId = `${idPrefix}-plant-head-${item.cropId}`;
  const inputId = `${idPrefix}-plant-date-${item.cropId}`;
  const hintId = `${idPrefix}-plant-hint-${item.cropId}`;
  // Two copies of this section are mounted at once (the card and the popup over it), so every
  // id AND the radio group's name have to carry the surface as well as the crop.
  const confirmQId = `${idPrefix}-clear-q-${item.cropId}`;
  const confirmBodyId = `${idPrefix}-clear-body-${item.cropId}`;
  const noteId = `${idPrefix}-clear-note-${item.cropId}`;
  const noteHintId = `${idPrefix}-clear-notehint-${item.cropId}`;
  const noteErrId = `${idPrefix}-clear-noteerr-${item.cropId}`;
  const reasonGroupName = `${idPrefix}-clear-reason-${item.cropId}`;
  const Heading = headingLevel === 3 ? 'h3' : 'h4';

  /**
   * Send focus somewhere deliberate, ALWAYS.
   *
   * Every destination is a CHAIN, not a single node, because the section this component
   * renders can change under the focus move: a refused write can be answered by a parent
   * refresh that takes the whole confirm away (clear_reason_not_applicable is exactly that —
   * the server says "there is no date to remove" and the refreshed item has none, so the
   * question, the Remove button and the date line all unmount at once). A single ref would be
   * null at that moment and the keyboard user would be dropped on <body>, back at the top of
   * the document. Each chain therefore falls back OUTWARDS, from the most specific control to
   * whatever is still standing:
   *   yes    -> the confirm's own answer, else the control that opened it, else the date line,
   *             else the invitation's field;
   *   remove -> the Remove button, else the date line's Change, else the field;
   *   reason -> the first radio, else the answer, else Change, else the field;
   *   input  -> the invitation's field, else Change (the parent has not caught up yet);
   *   edit   -> Change, else the field.
   */
  useEffect(() => {
    if (pendingFocus === null) return;
    const chain: Record<typeof pendingFocus & string, (HTMLElement | null)[]> = {
      input: [inputRef.current, editBtn.current],
      edit: [editBtn.current, inputRef.current],
      remove: [removeBtn.current, editBtn.current, inputRef.current],
      reason: [firstReasonRef.current, yesBtn.current, editBtn.current, inputRef.current],
      yes: [yesBtn.current, removeBtn.current, editBtn.current, inputRef.current],
    };
    chain[pendingFocus].find((el) => el !== null)?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  // A date saved (or removed) somewhere else — the popup while the card is open behind it —
  // closes this copy's editor rather than leaving a stale field over a changed fact. The
  // confirm goes with it: a question about removing a date that has already changed is a
  // question about something the farmer did not ask.
  useEffect(() => {
    setEditing(false);
    setDraft(plantedDate ?? todayYmd);
    setConfirming(false);
    setReason(null);
    setNote('');
    // todayYmd is recomputed on every render but its VALUE only changes at midnight, so it
    // is a safe dependency: this does not re-run on ordinary parent re-renders and cannot
    // wipe a half-typed date.
  }, [plantedDate, todayYmd]);

  const save = useCallback(
    async (value: string) => {
      // Refuse out-of-range dates before the round trip, with the SAME sentence the server's
      // invalid_planted_date answers with — one refusal, one wording, whoever spots it.
      if (!isPlantedDateAllowed(value, todayYmd)) {
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
        setPendingFocus('edit');
      } finally {
        setSaving(false);
      }
    },
    [item.cropId, onSave, todayYmd],
  );

  // The note as the SERVER will measure it. Trimmed, because that is what is sent and what
  // the 300 is counted against; over-long is refused here rather than posted and bounced.
  const trimmedNote = note.trim();
  const noteTooLong = trimmedNote.length > CLEAR_REASON_NOTE_MAX;

  /** Back out of the confirm — the same path for the Cancel button and for Escape, and it
   *  puts the section back exactly as it was, including the answer being forgotten. */
  const cancelClear = useCallback(() => {
    setConfirming(false);
    setReason(null);
    setNote('');
    setPendingFocus('remove');
  }, []);

  const doClear = useCallback(async () => {
    // The SAME rule the answer button reads for its disabled state — stated once, in
    // lib/portfolio, so the two can never drift apart. It is repeated here rather than trusted
    // to the attribute because the attribute is a courtesy, not a guarantee: a request the
    // server will refuse (clear_reason_required) must not leave this component at all.
    if (!onClear || !canSubmitClearReason(reason, noteTooLong)) return;
    setSaving(true);
    setMsg(null);
    try {
      const result = await onClear(item.cropId, {
        // Non-null by the guard above; named so the guard is the single place that decides.
        reason: reason as PlantedDateClearReason,
        // Never a note without something in it: a blank one is not news, and the wire says so.
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      setMsg(result);
      if (result?.tone === 'error') {
        // The question stays open with the farmer's answer in it, so trying again is one tap
        // and not a re-typed note.
        setPendingFocus('yes');
        return;
      }
      setConfirming(false);
      setReason(null);
      setNote('');
      // The date line the farmer pressed in is gone; the invitation's field replaces it and
      // is the natural landing place.
      setPendingFocus('input');
    } finally {
      setSaving(false);
    }
  }, [item.cropId, noteTooLong, onClear, reason, trimmedNote]);

  const disabled = busy || saving;
  const showField = editing || !plantedDate;
  // Only the surface that OWNS removal renders anything about it, and only when there is a
  // date to remove and no editor open over it.
  const showClear =
    clearControl === 'confirm' && Boolean(onClear) && Boolean(plantedDate) && !editing;

  return (
    <section className="pf-plant" aria-labelledby={headingId}>
      {/* The seedling is DECORATION — it repeats what the heading beside it says and is
          hidden from the accessibility tree. It exists so a farmer scanning a list of cards
          can find "the planting part" of every card in the same place without reading. */}
      <div className="pf-plant__headrow">
        <span className="pf-plant__seed" aria-hidden="true">
          🌱
        </span>
        <Heading className="pf-plant__head" id={headingId}>
          {plantedDate && !editing
            ? t('pages.portfolio.plantedForecastHeading')
            : t('pages.portfolio.plantedQuestion')}
        </Heading>
      </div>

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
              // Changing the date ANSWERS the removal question by walking away from it. The
              // confirm is only hidden while the editor is open (showClear is false), so
              // without this its state — the open flag AND the reason already picked — would
              // survive underneath and reappear the moment the farmer pressed Cancel, asking
              // to destroy the date they had just come back to. Same law as the page's
              // toggleSelect: any change to the subject cancels a pending confirm.
              setConfirming(false);
              setReason(null);
              setNote('');
              setEditing(true);
              setPendingFocus('input');
            }}
            aria-label={t('pages.portfolio.editPlantedDateAria', { crop: item.cropName })}
          >
            {t('pages.portfolio.editPlantedDate')}
          </button>
          {/* "Remove date" is the one control here that DESTROYS something the farmer typed,
              so it is the one that carries the destructive colour and a bin — the same
              exception class as the remove-crop confirm. Never the primary weight in the row:
              it sits after "Change", it is a text button, and the colour is a second signal
              behind the word and the icon. It exists on ONE surface (the popup, clearControl
              'confirm') and it opens a question rather than doing the thing. */}
          {showClear && !confirming && (
            <button
              type="button"
              ref={removeBtn}
              className="pf-plant__link pf-plant__link--danger"
              disabled={disabled}
              onClick={() => {
                setMsg(null);
                setReason(null);
                setNote('');
                setConfirming(true);
                // The first radio, not the Yes button: Yes is disabled until a reason is
                // picked, and picking one is the next thing to do.
                setPendingFocus('reason');
              }}
              aria-label={t('pages.portfolio.clearPlantedDateAria', { crop: item.cropName })}
            >
              <TrashIcon />
              {t('pages.portfolio.clearPlantedDate')}
            </button>
          )}
        </p>
      )}

      {/* The confirm. alertdialog, not alert: this region is INTERACTIVE, and a plain alert
          announces text while telling a screen-reader user nothing about the choice they are
          standing in — the same reading the remove-crop confirm made. It is NOT aria-modal
          and traps nothing: it is a step inside the popup, and the popup already owns the
          modality contract.

          ESCAPE IS SWALLOWED HERE UNCONDITIONALLY, and only the ACTION is conditional. While
          the removal is in flight there is nothing to cancel — the request cannot be recalled —
          but letting the key bubble would close the popup around it, and this write reports
          SILENTLY (the page's status region is deliberately not used while the popup is open),
          so the farmer would be left with no answer anywhere on screen about a removal that is
          really happening. Stopping the key costs one ignored keypress; letting it through
          costs the outcome. preventDefault goes with it so the key's native meanings do not
          fire either. */}
      {showClear && confirming && (
        <div
          className="pf-confirm pf-plant__confirm"
          role="alertdialog"
          aria-labelledby={confirmQId}
          aria-describedby={confirmBodyId}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            e.preventDefault();
            if (!disabled) cancelClear();
          }}
        >
          <p className="pf-confirm__q" id={confirmQId}>
            {t('pages.portfolio.clearConfirmQuestion', { crop: item.cropName })}
          </p>
          {/* What removal really costs, said before it happens and without drama. */}
          <p className="pf-clear__body" id={confirmBodyId}>
            {t('pages.portfolio.clearConfirmBody')}
          </p>

          {/* Real radios in a real fieldset: one tap each, arrow keys work, and the group has
              a name a screen reader reads before the options. Required, and the legend says
              so in words rather than leaving the farmer to discover a dead button. */}
          <fieldset className="pf-clear__reasons">
            <legend className="pf-clear__legend">{t('pages.portfolio.clearReasonLegend')}</legend>
            {PLANTED_DATE_CLEAR_REASONS.map((value, i) => (
              <label className="pf-clear__reason" key={value}>
                <input
                  type="radio"
                  className="pf-clear__radio"
                  name={reasonGroupName}
                  value={value}
                  ref={i === 0 ? firstReasonRef : undefined}
                  checked={reason === value}
                  disabled={disabled}
                  onChange={() => {
                    setMsg(null);
                    setReason(value);
                  }}
                />
                <span>{t(REASON_LABEL_KEYS[value])}</span>
              </label>
            ))}
          </fieldset>

          <div className="pf-clear__note">
            <label className="pf-plant__label" htmlFor={noteId}>
              {t('pages.portfolio.clearNoteLabel')}
            </label>
            <textarea
              id={noteId}
              className="pf-clear__input"
              rows={2}
              // NO maxLength, deliberately. A browser enforces maxLength by TRUNCATING a paste
              // — silently dropping the end of what the farmer wrote — which is the one thing
              // this contract forbids: the server rejects an over-long note and never shortens
              // it, and neither may we. The trimmed check below is the live gate, and it says
              // so in words with the farmer's own count. (With maxLength here the paste is cut
              // to 300 before that check can ever see it, so the refusal would only exist in
              // jsdom, which enforces no such attribute.)
              value={note}
              disabled={disabled}
              aria-invalid={noteTooLong || undefined}
              aria-describedby={noteTooLong ? `${noteHintId} ${noteErrId}` : noteHintId}
              onChange={(e) => {
                setMsg(null);
                setNote(e.target.value);
              }}
            />
            <p className="pf-plant__hint" id={noteHintId}>
              {t('pages.portfolio.clearNoteHint', { max: CLEAR_REASON_NOTE_MAX })}
            </p>
            {/* The count is the farmer's own, measured the way the server measures it. The
                server rejects an over-long note and never shortens it, so neither do we. */}
            {noteTooLong && (
              <p className="pf-clear__err" id={noteErrId} role="alert">
                {t('pages.portfolio.clearNoteTooLong', {
                  count: trimmedNote.length,
                  max: CLEAR_REASON_NOTE_MAX,
                })}
              </p>
            )}
          </div>

          <div className="pf-confirm__actions">
            <button
              type="button"
              ref={yesBtn}
              className="btn-primary pf-confirm__yes"
              // Disabled until the farmer has said why. The reason is not decoration: the
              // server refuses the removal without one, so an enabled button here would be a
              // promise the request cannot keep. Same rule as the handler's guard, by name.
              disabled={disabled || !canSubmitClearReason(reason, noteTooLong)}
              onClick={() => void doClear()}
            >
              {t('pages.portfolio.clearConfirmYes')}
            </button>
            <button
              type="button"
              className="btn-ghost pf-confirm__no"
              disabled={disabled}
              onClick={cancelClear}
            >
              {t('pages.portfolio.clearConfirmNo')}
            </button>
          </div>
        </div>
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
        {/* The glyph is decoration on a message that already says what happened in words;
            an empty region stays empty (and hidden) so no card reserves a blank strip. */}
        {msg && (
          <span className="pf-plant__msg-glyph" aria-hidden="true">
            {msg.tone === 'ok' ? '✓' : '!'}
          </span>
        )}
        {msg && t(msg.key)}
      </p>

      {plantedDate && !editing && (
        <PlantedForecast
          item={item}
          market={market}
          lang={lang}
          todayYmd={todayYmd}
          state={forecast}
          onRetry={onRetryForecast}
          layout={forecastLayout}
          idPrefix={idPrefix}
          clearControl={clearControl}
        />
      )}
    </section>
  );
}

/** A bin, drawn in currentColor so the button decides the hue. Decorative: the button says
 *  "Remove date" beside it and names its crop in its accessible name. */
function TrashIcon() {
  return (
    <svg
      className="pf-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 7h16M10 4h4M9 7v12M15 7v12M6 7l1 13h10l1-13" />
    </svg>
  );
}

/** The forecast for the recorded planting, in its states. Rendered by the shared
 *  PredictionBlock so the range, the confidence word and the de-rating are the same
 *  presentation the rest of the app uses. */
function PlantedForecast({
  item,
  market,
  lang,
  todayYmd,
  state,
  onRetry,
  layout,
  idPrefix,
  clearControl,
}: {
  item: PortfolioDashboardItem;
  market: PortfolioDashboardMarket | null;
  lang: string;
  todayYmd: string;
  state: PlantedForecastState;
  onRetry: () => void;
  layout: PredictionLayout;
  idPrefix: string;
  clearControl: 'none' | 'confirm';
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

  // A harvest day that has already passed. The route answers for ANY planting date, so an
  // old one comes back with a confident future-tense number about a harvest that is over —
  // "About Rs. 240 at harvest · Harvest around Apr 1" beside a date in January. That is not
  // a stale number, it is a claim about the wrong thing, so it is not shown at all: the
  // section states what the date means and points at the ways out. The link to the full
  // forecast is dropped with it, because it would make the same claim one screen further on.
  //
  // The sentence names the controls THIS SURFACE really has. On the popup that is Change and
  // Remove; on the card there is no Remove any more, so it points at "More details" instead —
  // sending a farmer to press a button that is not on their screen is a small lie that costs
  // a real minute.
  //
  // Strictly EARLIER than today: a harvest due today is still ahead of the farmer.
  const harvestDate = state.forecast.harvestDate;
  if (harvestDate && harvestDate < todayYmd) {
    return (
      <p className="pf-plant__past" role="note">
        <span aria-hidden="true">🌾 </span>
        {t(
          clearControl === 'confirm'
            ? 'pages.portfolio.plantedPastHarvest'
            : 'pages.portfolio.plantedPastHarvestChangeOnly',
          { date: formatDate(harvestDate, lang) },
        )}
      </p>
    );
  }

  return (
    <>
      <PredictionBlock
        prediction={predictionFromHarvestForecast(state.forecast)}
        market={market}
        lang={lang}
        lowTrust={state.forecast.lowTrust}
        layout={layout}
        // The hint is part of the split block only. Its id has to be unique across the card
        // and the popup (both mounted at once), and its NAME has to say which crop it is
        // about — a page of ten cards otherwise offers ten identical ⓘ buttons.
        {...(layout === 'split'
          ? { hintId: `${idPrefix}-${item.cropId}`, hintCrop: item.cropName }
          : {})}
      />
      <p className="pf-plant__more">
        {/* Still one link to one place; on the card it is drawn as the primary action of
            the whole card, because "see the whole forecast" is what the card is for. */}
        <Link
          className={layout === 'split' ? 'pf-btn pf-btn--primary' : 'pf-card__link'}
          to={harvestLinkFor(item.cropId, item.plantedDate)}
          aria-label={t('pages.portfolio.openHarvestAria', { crop: item.cropName })}
        >
          {t('pages.portfolio.openHarvest')}
          {layout === 'split' && (
            <span className="pf-btn__chev" aria-hidden="true">
              {' →'}
            </span>
          )}
        </Link>
      </p>
    </>
  );
}
