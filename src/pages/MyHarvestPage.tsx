import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { RecommendationLevel } from '../api/types';
import type { Crop, CropTimeline, HarvestForecast, HarvestWindow } from '../api/types';
import { cropDisplayName } from '../lib/crops';
import { clampPlantDateToRange, formatDate, ymdLocal } from '../lib/format';
import { isLowTrust } from '../lib/forecast';
import { buildReadinessMap, type ReadinessMap } from '../lib/readiness';
import { pushRecentCrop, readLastHarvest, readRecentCrops, writeLastHarvest } from '../lib/storage';
import BestWindowPanel from '../components/BestWindowPanel';
import CropPicker from '../components/CropPicker';
import ForecastResult from '../components/ForecastResult';
import TimelineChart from '../components/TimelineChart';
import AudioHelpButton from '../components/AudioHelpButton';

// My harvest — forecast workspace (FE-3, ClickUp 86cacw5wy).
// Flow: step 1 pick crop (illustrated searchable grid) -> step 2 confirm planting
// date -> "Get forecast" -> the result, which now CONTAINS the best-planting-window
// strip (ClickUp 86cawt9tr, 2026-07-25). The page is a workspace panel INSIDE the
// dashboard shell (desktop-first, 2-col grid collapses to a single column, and the
// crop grid to 2 cols, at narrow width).
//
// WHY THE WINDOW STRIP MOVED INTO THE RESULT: not accuracy — the strip and
// /predict have built the same what-if row from the same anchor since the
// consistency fix, so the numbers are identical wherever it renders. It moved for
// CONTEXT (min-max bars need the hero price and the range beside them to mean
// anything) and for FLOW ("Not recommended" is a dead end; the strip answers "then
// when?"). Two consequences are load-bearing here:
//   - onPickDate must NOT reset `submitted`. The strip lives inside the result, so
//     clearing it would unmount the very control being used.
//   - the loop must not run backwards up the page: activating a bar re-forecasts
//     IN PLACE rather than sending the farmer back to the date field + CTA above.

/** How far ahead a farmer may plan a planting date. EXPORTED because the window
 *  strip's sweep length and this field's `max` must be the SAME number — the test
 *  that pins that should read the number, not restate it. */
export const HORIZON_DAYS = 60;
const LOOKBACK_DAYS = 365; // how far back a planting date may be back-dated

function shiftDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
}

export default function MyHarvestPage() {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => ymdLocal(today), [today]);
  const minDate = useMemo(() => shiftDays(today, -LOOKBACK_DAYS), [today]);
  const maxDate = useMemo(() => shiftDays(today, HORIZON_DAYS), [today]);

  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Crop | null>(null);
  const [plantDate, setPlantDate] = useState(todayStr);
  const [submitted, setSubmitted] = useState(false);
  const [forecast, setForecast] = useState<HarvestForecast | null>(null);
  const [fcLoading, setFcLoading] = useState(false);
  const [fcError, setFcError] = useState(false);
  const [timeline, setTimeline] = useState<CropTimeline | null>(null);
  const [tlLoading, setTlLoading] = useState(false);
  const [tlError, setTlError] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecentCrops());
  const [readiness, setReadiness] = useState<ReadinessMap | null>(null);
  const [bestWindow, setBestWindow] = useState<HarvestWindow | null>(null);
  const [bwLoading, setBwLoading] = useState(false);
  const [bwError, setBwError] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // Crop-status colouring (2026-07-22). Strictly fail-soft: readiness is
  // decoration on the picker — a failure or inactive model leaves the map null
  // and the cards untinted, never an error state.
  useEffect(() => {
    let cancelled = false;
    api
      .getCropReadiness()
      .then((r) => {
        if (!cancelled) setReadiness(buildReadinessMap(r));
      })
      .catch(() => {
        /* readiness unknown -> no tint */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Preselect precedence (runs ONCE after the list loads, so a later manual change
  // is never undone): a /my-harvest?crop=<id> deep-link (FE-7) ALWAYS wins; failing
  // that, the last-forecast crop + planting date remembered in localStorage (FE-16).
  const [searchParams] = useSearchParams();
  const cropParam = searchParams.get('crop');
  const didPreselect = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.getCrops();
      setCrops(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (didPreselect.current || crops.length === 0) return;
    didPreselect.current = true;

    // URL ?crop= ALWAYS wins over the remembered crop (even if it doesn't match).
    if (cropParam) {
      const match = crops.find((c) => c.id === cropParam);
      if (match) {
        setSelected(match);
        setSubmitted(false);
      }
      return;
    }

    // Otherwise restore the last-forecast crop + date, if the crop still exists and
    // the date is within [today-365, today+60] (else the date falls back to today).
    const last = readLastHarvest();
    if (!last) return;
    const match = crops.find((c) => c.id === last.cropId);
    if (!match) return;
    setSelected(match);
    setSubmitted(false);
    setPlantDate(clampPlantDateToRange(last.plantDate, todayStr, minDate, maxDate));
  }, [cropParam, crops, todayStr, minDate, maxDate]);

  const onSelect = useCallback((crop: Crop) => {
    setSelected(crop);
    setSubmitted(false); // changing the crop invalidates a prior forecast request
  }, []);

  // Best planting window. Depends on the CROP ONLY — not the date — so it is
  // fetched the moment a crop is picked, well before "Get forecast" is pressed.
  // That is deliberate: the strip renders inside the result, and pre-loading it
  // here is what keeps a second spinner from appearing in there. Fail-soft: an
  // error shows a compact retry inside the panel and never blocks the picker,
  // the CTA or the forecast itself.
  const runWindow = useCallback(async () => {
    if (!selected) return;
    setBwLoading(true);
    setBwError(false);
    try {
      // Sweep EXACTLY as far as the date field will accept (HORIZON_DAYS). If the
      // sweep ran longer, the strip would recommend dates that clampPlantDateToRange
      // silently rewrites on tap — handing the farmer a different date from the bar
      // they chose. The two horizons must stay equal.
      setBestWindow(await api.getHarvestWindow(selected.id, HORIZON_DAYS, todayStr));
    } catch {
      setBwError(true);
    } finally {
      setBwLoading(false);
    }
  }, [selected, todayStr]);

  useEffect(() => {
    if (!selected) {
      setBestWindow(null);
      return;
    }
    setBestWindow(null); // clear the previous crop's window so the skeleton shows
    void runWindow();
  }, [selected, runWindow]);

  const canSubmit = selected !== null && Boolean(plantDate);

  // Takes the date EXPLICITLY rather than reading `plantDate` from state: a bar tap
  // sets the date and re-forecasts in the same handler, and the state update is not
  // visible to it yet. Passing the value removes the whole class of "forecast ran
  // for the previous date" bug.
  const fcReq = useRef(0);
  // `fcReq` guards ORDER, not LIFETIME. A continuation that resumes after the page
  // has gone would still run the localStorage writes below — setState is a harmless
  // no-op, but "remember my crop" is a real side effect and must not fire for a
  // screen the farmer has already left. (Assigned in the effect body, not just the
  // cleanup, so a StrictMode double-mount does not leave it stuck false.)
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const runForecast = useCallback(
    async (date: string) => {
      if (!selected || !date) return;
      // Tapping along the strip fires overlapping requests; only the newest may
      // write. Without this a slow earlier response lands last and the hero ends up
      // showing a different date's price than the highlighted bar.
      const req = ++fcReq.current;
      setFcLoading(true);
      setFcError(false);
      try {
        const data = await api.getHarvestForecast(selected.id, date);
        if (!alive.current || fcReq.current !== req) return;
        setForecast(data);
        // Remember this successful pick (crop + date) + push it onto the Recent list.
        writeLastHarvest(selected.id, date);
        setRecentIds(pushRecentCrop(selected.id));
      } catch {
        if (alive.current && fcReq.current === req) setFcError(true);
      } finally {
        if (alive.current && fcReq.current === req) setFcLoading(false);
      }
    },
    [selected],
  );

  // Activating a bar on the strip. The strip now lives INSIDE the result, so this
  // is a comparison control, not advice to read: it applies the date AND re-runs
  // the forecast on the spot. `submitted` stays true and the previous forecast is
  // deliberately NOT cleared, so the result panel — and the strip inside it — never
  // unmounts, focus stays on the bar and the page does not jump. ForecastResult
  // marks itself busy while the new numbers land.
  const onPickDate = useCallback(
    (date: string) => {
      const applied = clampPlantDateToRange(date, todayStr, minDate, maxDate);
      setPlantDate(applied);
      // Defensive: standalone use (no result on screen) keeps the old behaviour of
      // simply filling the field.
      if (!submitted || !selected) return;
      void runForecast(applied);
      // The timeline is deliberately NOT refetched: it is crop + as-of-today + 12
      // months, none of which a planting date changes. Its ▲ harvest marker follows
      // the new forecast's harvestDate.
    },
    [todayStr, minDate, maxDate, submitted, selected, runForecast],
  );

  // Timeline is loaded independently of the harvest call (same crop, asOf=today,
  // months=12). Fail-soft: a timeline error must NOT fail the whole result panel.
  const runTimeline = useCallback(async () => {
    if (!selected) return;
    setTlLoading(true);
    setTlError(false);
    try {
      const data = await api.getCropTimeline(selected.id, 12, todayStr);
      setTimeline(data);
    } catch {
      setTlError(true);
    } finally {
      setTlLoading(false);
    }
  }, [selected, todayStr]);

  const onGetForecast = useCallback(() => {
    if (!canSubmit) return;
    setSubmitted(true);
    setForecast(null); // clear any prior result so the skeleton shows
    setTimeline(null);
    void runForecast(plantDate);
    void runTimeline();
    // Move focus/scroll to the result so the flow feels connected.
    requestAnimationFrame(() => resultRef.current?.focus());
  }, [canSubmit, plantDate, runForecast, runTimeline]);

  const selectedLabel = selected ? cropDisplayName(selected, i18n.language) : null;

  // The panel may only drop its "even at the best time this loses money" sentence
  // if a verdict is on screen RIGHT NOW saying it. That is a narrower condition
  // than "the panel is embedded":
  //   - the API calls it "Not recommended" only below −5% upside, while the panel
  //     warns whenever no single date beats today — a sweep 0–5% under today shows
  //     "Little data / roughly flat versus today" and states no loss at all;
  //   - `fcError` replaces the whole result with a retry card — no verdict;
  //   - `fcLoading` with no forecast yet is the first-load skeleton — no verdict,
  //     while the strip beside it is already fully painted from the pre-fetch.
  // Anything but a live NotRecommended verdict => the panel says it itself.
  const lossCarriedByVerdict =
    forecast !== null &&
    !fcError &&
    !fcLoading &&
    forecast.recommendationLevel === RecommendationLevel.NotRecommended;

  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.myHarvest.title')}</h1>
        <span className="topbar__updated">
          <span className="prov">{t('common.source')}</span>
        </span>
      </div>

      {/* Step 1 — choose crop */}
      <section className="panel hv-step" aria-labelledby="hv-step1">
        <h2 id="hv-step1" className="hv-step__head">
          <span className="hv-step__num" aria-hidden="true">1</span>
          {t('pages.myHarvest.chooseCrop')}
        </h2>
        <CropPicker
          crops={crops}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          selectedId={selected?.id ?? null}
          onSelect={onSelect}
          recentIds={recentIds}
          readiness={readiness}
        />
      </section>

      {/* Step 2 — planting date + summary/CTA. (The best-planting-window strip used
          to sit above this as its own step; it now renders inside the forecast
          result below, where the prices give its bars a scale — and it is NOT
          rendered twice: two charts of identical data on one screen is a bug.) */}
      <div className="panelgrid panelgrid--half hv-row">
        <section className="panel hv-step" aria-labelledby="hv-step2">
          <h2 id="hv-step2" className="hv-step__head">
            <span className="hv-step__num" aria-hidden="true">2</span>
            {t('pages.myHarvest.plantDateQ')}
          </h2>
          <label className="wrap-label" htmlFor="hv-plant-date">
            {t('pages.myHarvest.plantDate')}
          </label>
          <input
            id="hv-plant-date"
            type="date"
            className="hv-date"
            value={plantDate}
            min={minDate}
            max={maxDate}
            onChange={(e) => {
              setPlantDate(e.target.value);
              setSubmitted(false);
            }}
          />
          <p className="hv-hint">{t('pages.myHarvest.plantDateHint')}</p>
        </section>

        <section className="panel hv-summary" aria-label={t('pages.myHarvest.summaryLabel')}>
          <div className="hv-summary__row">
            <span className="hv-summary__key">{t('pages.myHarvest.myCrop')}</span>
            <span className="hv-summary__val">
              {selectedLabel ?? <span className="hv-summary__empty">{t('pages.myHarvest.noCropYet')}</span>}
            </span>
          </div>
          <div className="hv-summary__row">
            <span className="hv-summary__key">{t('pages.myHarvest.plantDate')}</span>
            <span className="hv-summary__val">{formatDate(plantDate, i18n.language)}</span>
          </div>
          <button
            type="button"
            className="btn-primary hv-cta"
            disabled={!canSubmit}
            onClick={onGetForecast}
          >
            {t('pages.myHarvest.getForecast')}
          </button>
          {!canSubmit && (
            <p className="hv-hint hv-hint--center">{t('pages.myHarvest.pickToContinue')}</p>
          )}
        </section>
      </div>

      {/* Forecast result — the signature honest-uncertainty panel (FE-4). */}
      {submitted && selected && (
        <section
          className="panel hv-result"
          ref={resultRef}
          tabIndex={-1}
          aria-label={t('pages.myHarvest.expectedAt')}
        >
          <div className="hv-result__head">
            <h2 className="hv-result__title">{t('pages.myHarvest.expectedAt')}</h2>
            <AudioHelpButton />
          </div>
          <ForecastResult
            forecast={forecast}
            loading={fcLoading}
            error={fcError}
            onRetry={() => void runForecast(plantDate)}
            cropLabel={selectedLabel}
            windowSlot={
              <>
                <h3 className="fc-window__title">{t('bestWindow.title')}</h3>
                <BestWindowPanel
                  embedded
                  lossCarriedByVerdict={lossCarriedByVerdict}
                  window={bestWindow}
                  loading={bwLoading}
                  error={bwError}
                  onRetry={() => void runWindow()}
                  onPickDate={onPickDate}
                  selectedDate={plantDate}
                  cropLabel={selectedLabel}
                />
              </>
            }
          />

          {/* 12-month timeline (FE-5) — stacks under the hero; fail-soft on error. */}
          <div className="hv-timeline">
            <TimelineChart
              timeline={timeline}
              loading={tlLoading}
              error={tlError}
              onRetry={() => void runTimeline()}
              harvestDate={forecast?.harvestDate ?? null}
              cropLabel={selectedLabel}
              lowTrust={forecast ? isLowTrust(forecast) : false}
            />
          </div>
        </section>
      )}
    </>
  );
}
