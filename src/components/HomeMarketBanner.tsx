// HomeMarketBanner — "Prices shown for: <market> ▾", the one line that tells a farmer
// which market every number below belongs to, and the way into changing it.
// It never silently implies a choice the farmer did not make: when the economic centre is
// only standing in (isDefault), the banner says so, and when no market resolves at all it
// asks for one instead of naming a market by guess.
// The ▾ is decorative; the link carries an explicit accessible name that includes the
// market, so a screen-reader user hears what changing it would change.
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PortfolioHomeMarket } from '../api/types';

export default function HomeMarketBanner({
  homeMarket,
}: {
  homeMarket: PortfolioHomeMarket | null;
}) {
  const { t } = useTranslation();

  if (!homeMarket) {
    return (
      <div className="pf-hmb pf-hmb--none">
        <p className="pf-hmb__line">
          <span className="pf-hmb__label">{t('pages.portfolio.noHomeMarket')}</span>{' '}
          <Link
            className="pf-hmb__link"
            to="/portfolio/settings"
            aria-label={t('pages.portfolio.chooseMarketAria')}
          >
            {t('pages.portfolio.chooseMarket')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="pf-hmb">
      <p className="pf-hmb__line">
        <span className="pf-hmb__label">{t('pages.portfolio.pricesShownFor')}</span>{' '}
        <Link
          className="pf-hmb__link"
          to="/portfolio/settings"
          aria-label={t('pages.portfolio.changeMarketAria', { market: homeMarket.name })}
        >
          <span className="wrap-label">{homeMarket.name}</span>
          <span aria-hidden="true"> ▾</span>
        </Link>
      </p>
      {homeMarket.isDefault && (
        <p className="pf-hmb__note">{t('pages.portfolio.homeMarketDefault')}</p>
      )}
    </div>
  );
}
