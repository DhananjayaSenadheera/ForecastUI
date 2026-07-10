import { useTranslation } from 'react-i18next';

// Best crops — ranked comparison (FE-2 = table slot; data + shared-scale range
// bars + verdict badges land in FE-7).
export default function BestCropsPage() {
  const { t } = useTranslation();
  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.bestCrops.title')}</h1>
        <span className="topbar__updated">
          <span className="prov">{t('common.source')}</span>
        </span>
      </div>
      <section className="panel" aria-label={t('pages.bestCrops.title')}>
        <div className="slot">Crop-vs-crop comparison table (shared scale) — FE-7</div>
      </section>
    </>
  );
}
