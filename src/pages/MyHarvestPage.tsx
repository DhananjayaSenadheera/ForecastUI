import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Crop } from '../api/types';
import { cropDisplayName } from '../lib/crops';
import { formatDate } from '../lib/format';
import CropPicker from '../components/CropPicker';

// My harvest — forecast workspace (FE-3, ClickUp 86cacw5wy).
// Flow: pick crop (illustrated searchable grid) -> confirm planting date ->
// "Get forecast". The forecast result panel itself lands in FE-4/FE-5; here it is
// a labelled placeholder so the pick -> date -> submit flow is complete + testable.
// The page is a workspace panel INSIDE the dashboard shell (desktop-first, 2-col
// grid collapses to a single column, and the crop grid to 2 cols, at narrow width).

const HORIZON_DAYS = 60; // how far ahead a farmer may plan a planting date
const LOOKBACK_DAYS = 365; // how far back a planting date may be back-dated

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function shiftDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

export default function MyHarvestPage() {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => ymd(today), [today]);
  const minDate = useMemo(() => shiftDays(today, -LOOKBACK_DAYS), [today]);
  const maxDate = useMemo(() => shiftDays(today, HORIZON_DAYS), [today]);

  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Crop | null>(null);
  const [plantDate, setPlantDate] = useState(todayStr);
  const [submitted, setSubmitted] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

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

  const onSelect = useCallback((crop: Crop) => {
    setSelected(crop);
    setSubmitted(false); // changing the crop invalidates a prior forecast request
  }, []);

  const canSubmit = selected !== null && Boolean(plantDate);

  const onGetForecast = useCallback(() => {
    if (!canSubmit) return;
    setSubmitted(true);
    // Move focus/scroll to the (placeholder) result so the flow feels connected.
    requestAnimationFrame(() => resultRef.current?.focus());
  }, [canSubmit]);

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

      {/* Placeholder result — real forecast view arrives in FE-4/FE-5 */}
      {submitted && selected && (
        <section
          className="panel hv-result"
          ref={resultRef}
          tabIndex={-1}
          aria-label={t('pages.myHarvest.expectedAt')}
        >
          <div className="slot hv-result__slot">
            {t('pages.myHarvest.forecastComingFor', {
              crop: selectedLabel,
              date: formatDate(plantDate, i18n.language),
            })}
          </div>
        </section>
      )}
    </>
  );
}
