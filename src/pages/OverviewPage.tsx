import { useTranslation } from 'react-i18next';

// Overview / landing dashboard (FE-2 = layout slots only; data wiring in later FEs).
// KPI row + panel grid per the normative dashboard sample.
export default function OverviewPage() {
  const { t } = useTranslation();
  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.overview.title')}</h1>
        <span className="filterchip">📍 {t('filter.market')} ▾</span>
        <span className="filterchip">📅 {t('filter.date')} ▾</span>
        <span className="topbar__updated">
          {t('common.updated')} · <span className="prov">{t('common.source')}</span>
        </span>
      </div>

      {/* KPI row slot */}
      <div className="kpis">
        <div className="kpi">
          <div className="kpi__lbl">{t('pages.overview.kpiRising')}</div>
          <div className="kpi__val">—</div>
        </div>
        <div className="kpi">
          <div className="kpi__lbl">{t('pages.overview.kpiMover')}</div>
          <div className="kpi__val">—</div>
        </div>
        <div className="kpi">
          <div className="kpi__lbl">{t('pages.overview.kpiSeason')}</div>
          <div className="kpi__val">—</div>
        </div>
        <div className="kpi">
          <div className="kpi__lbl">{t('pages.overview.kpiConfidence')}</div>
          <div className="kpi__val">—</div>
        </div>
      </div>

      {/* panel grid slot */}
      <div className="panelgrid panelgrid--main">
        <section className="panel" aria-label="12-month price outlook">
          <div className="slot">12-month forecast chart — FE-5</div>
        </section>
        <section className="panel" aria-label="Why this price">
          <div className="slot">Why this price / factors — FE-6</div>
        </section>
      </div>
      <div className="panelgrid panelgrid--half" style={{ marginTop: 14 }}>
        <section className="panel" aria-label="Today's prices">
          <div className="slot">Today's prices — my crops (needs API #2)</div>
        </section>
        <section className="panel" aria-label="Best crops mini">
          <div className="slot">Best crops mini comparison — FE-7</div>
        </section>
      </div>
    </>
  );
}
