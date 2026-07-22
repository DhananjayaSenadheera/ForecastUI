import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Crop, CropTimeline, HarvestForecast } from '../api/types';
import { cropDisplayName } from '../lib/crops';
import { clampPlantDateToRange, formatDate, ymdLocal } from '../lib/format';
import { isLowTrust } from '../lib/forecast';
import { buildReadinessMap, type ReadinessMap } from '../lib/readiness';
import { pushRecentCrop, readLastHarvest, readRecentCrops, writeLastHarvest } from '../lib/storage';
import CropPicker from '../components/CropPicker';
import ForecastResult from '../components/ForecastResult';
import TimelineChart from '../components/TimelineChart';
import AudioHelpButton from '../components/AudioHelpButton';

// My harvest — forecast workspace (FE-3, ClickUp 86cacw5wy).
// Flow: pick crop (illustrated searchable grid) -> confirm planting date ->
// "Get forecast". The forecast result panel itself lands in FE-4/FE-5; here it is
// a labelled placeholder so the pick -> date -> submit flow is complete + testable.
// The page is a workspace panel INSIDE the dashboard shell (desktop-first, 2-col
// grid collapses to a single column, and the crop grid to 2 cols, at narrow width).

const HORIZON_DAYS = 60; // how far ahead a farmer may plan a planting date
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

  const canSubmit = selected !== null && Boolean(plantDate);

  const runForecast = useCallback(async () => {
    if (!selected || !plantDate) return;
    setFcLoading(true);
    setFcError(false);
    try {
      const data = await api.getHarvestForecast(selected.id, plantDate);
      setForecast(data);
      // Remember this successful pick (crop + date) + push it onto the Recent list.
      writeLastHarvest(selected.id, plantDate);
      setRecentIds(pushRecentCrop(selected.id));
    } catch {
      setFcError(true);
    } finally {
      setFcLoading(false);
    }
  }, [selected, plantDate]);

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
    void runForecast();
    void runTimeline();
    // Move focus/scroll to the result so the flow feels connected.
    requestAnimationFrame(() => resultRef.current?.focus());
  }, [canSubmit, runForecast, runTimeline]);

  const selectedLabel = selected ? cropDisplayName(selected, i18n.language) : null;

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

      {/* Step 2 — planting date + summary/CTA */}
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
            onRetry={() => void runForecast()}
            cropLabel={selectedLabel}
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
