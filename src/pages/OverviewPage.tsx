import { useTranslation } from 'react-i18next';

// Overview / landing dashboard. The data panels + KPIs are NOT wired yet (they
// depend on the not-yet-built markets/price-history routes, API gaps #1/#2). Per
// the honest-data rule we show an explicit "not available yet" placeholder — never
// fabricated numbers and never a fake loading skeleton that implies data is on the
// way. Internal task-IDs are kept OUT of farmer-facing copy (localized strings).
const KPI_KEYS = ['kpiRising', 'kpiMover', 'kpiSeason', 'kpiConfidence'] as const;
const PANELS = ['forecast', 'factors', 'prices', 'bestCrops'] as const;

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

      {/* KPI row — honest "not available yet" placeholders (no fabricated values). */}
      <div className="kpis">
        {KPI_KEYS.map((k) => (
          <div className="kpi" key={k}>
            <div className="kpi__lbl">{t(`pages.overview.${k}`)}</div>
            <div className="kpi__val kpi__val--pending">
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t('pages.overview.pending')}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Panel grid — each panel states plainly that it is not built yet. */}
      <div className="panelgrid panelgrid--main">
        {PANELS.slice(0, 2).map((p) => (
          <OverviewPanelStub key={p} nameKey={`pages.overview.panel_${p}`} />
        ))}
      </div>
      <div className="panelgrid panelgrid--half" style={{ marginTop: 14 }}>
        {PANELS.slice(2).map((p) => (
          <OverviewPanelStub key={p} nameKey={`pages.overview.panel_${p}`} />
        ))}
      </div>
    </>
  );
}

function OverviewPanelStub({ nameKey }: { nameKey: string }) {
  const { t } = useTranslation();
  const title = t(nameKey);
  return (
    <section className="panel" aria-label={title}>
      <h2 className="ov-panel__title">{title}</h2>
      <div className="slot slot--pending">
        <span className="slot__icon" aria-hidden="true">
          🕓
        </span>
        <p className="slot__text">{t('pages.overview.panelSoon')}</p>
      </div>
    </section>
  );
}
