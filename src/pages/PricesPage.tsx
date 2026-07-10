import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

// Prices — honest "coming soon" stub in R1 (owner decision #2). The nav item stays
// visible so navigation is stable across releases; the full browser lands in R2
// once markets + price-history endpoints exist (API gaps #1/#2).
export default function PricesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.prices.title')}</h1>
      </div>
      <section className="panel" style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 'var(--fs-h2)', marginBottom: 8 }}>
          🕓 {t('pages.prices.soonTitle')}
        </h2>
        <p style={{ color: 'var(--text-2)', marginBottom: 20 }}>{t('pages.prices.soonBody')}</p>
        <button type="button" className="btn-ghost" style={{ width: 'auto' }} onClick={() => navigate('/overview')}>
          ← {t('common.backHome')}
        </button>
      </section>
    </>
  );
}
