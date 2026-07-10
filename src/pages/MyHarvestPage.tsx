import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// My harvest — forecast workspace. Controls (crop + plant-date + harvest-date)
// pin left; results fill the rest (FE-2 = slots). Harvest-date picker is a native
// <input type="date"> stub here (owner decision: EXACT harvest-date picker, not
// fixed chips). Real forecast wiring + uncertainty pattern land in FE-3/FE-4.
export default function MyHarvestPage() {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const [plantDate, setPlantDate] = useState(today);
  const [harvestDate, setHarvestDate] = useState(today);

  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.myHarvest.title')}</h1>
        <span className="topbar__updated">
          <span className="prov">{t('common.source')}</span>
        </span>
      </div>

      <div className="panelgrid panelgrid--workspace">
        {/* pinned controls column */}
        <div>
          <section className="panel" style={{ marginBottom: 14 }}>
            <h2 className="panel__title">{t('pages.myHarvest.myCrop')}</h2>

            <label className="wrap-label" htmlFor="crop-select">
              {t('pages.myHarvest.myCrop')}
            </label>
            <select id="crop-select" className="filterchip" style={{ width: '100%', marginBottom: 12 }}>
              {/* FE-3 populates from api.getCrops() */}
              <option>—</option>
            </select>

            <label className="wrap-label" htmlFor="plant-date">
              {t('pages.myHarvest.plantDate')}
            </label>
            <input
              id="plant-date"
              type="date"
              className="filterchip"
              style={{ width: '100%', marginBottom: 12 }}
              value={plantDate}
              onChange={(e) => setPlantDate(e.target.value)}
            />

            <label className="wrap-label" htmlFor="harvest-date">
              {t('pages.myHarvest.harvestDate')}
            </label>
            <input
              id="harvest-date"
              type="date"
              className="filterchip"
              style={{ width: '100%' }}
              value={harvestDate}
              min={plantDate}
              onChange={(e) => setHarvestDate(e.target.value)}
            />
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              {t('pages.myHarvest.harvestHint')}
            </p>
          </section>

          <section className="panel" aria-label={t('confidence.label')}>
            <h2 className="panel__title">{t('confidence.label')}</h2>
            <div className="slot">Confidence + reason — FE-4</div>
          </section>
        </div>

        {/* results grid */}
        <div>
          <section className="panel" style={{ marginBottom: 14 }} aria-label={t('pages.myHarvest.expectedAt')}>
            <div className="slot">Hero price + confidence band + timeline — FE-4 / FE-5</div>
          </section>
          <div className="panelgrid panelgrid--half">
            <section className="panel" aria-label="Market comparison">
              <div className="slot">Same crop, other markets (needs API #1/#2)</div>
            </section>
            <section className="panel" aria-label="Seasonality">
              <div className="slot">Price seasonality strip (needs API #2)</div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
