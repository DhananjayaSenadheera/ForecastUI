// PriceBlock — today's observed price for one crop AT ONE MARKET: the number, the date it
// was observed, and the trend — or an honest "this market has no price for this crop".
//
// Its own file because THREE surfaces show this same fact (the card, the "More details"
// popup and the crop detail page) and they must never word it differently. It used to live
// inside WatchlistCard and be imported back out of it; once the popup — which the card
// itself renders — needed it too, that made a circular import between the two modules. A
// shared leaf component is not the card's to own.
//
// The honesty rules it carries (PRD §3.6, §5.2):
//  - The price is shown WITH its observed date, always. There is no staleness cutoff on the
//    wire, so an old price is displayed and its age is said out loud in plain words.
//  - A null `direction` prints "no earlier price to compare", NOT "steady". Treating an
//    absent comparison as a flat price is a lie the farmer cannot detect.
//  - The price is the named market's OWN price, never substituted from another market, so
//    "no price" means this market has published none — not that it is stale.
//  - Nothing here is red.
//
// It branches on the PRESENCE of the price leg, not on `priceUnavailableReason`. That is
// deliberate while that field has exactly one code ("no_recent_price"): switching on a
// one-member set buys nothing and would silently drop an unknown future code into a blank
// space. When a second code appears, branch there — the reason is carried in the types.
import { useTranslation } from 'react-i18next';
import type { PortfolioDashboardMarket } from '../api/types';
import { formatDate, formatPrice } from '../lib/format';
import {
  PRICE_AGE_NOTE_DAYS,
  priceAgeDays,
  trendGlyph,
  trendLabelKey,
} from '../lib/portfolio';

export default function PriceBlock({
  market,
  lang,
  todayYmd,
}: {
  market: PortfolioDashboardMarket | null;
  lang: string;
  todayYmd: string;
}) {
  const { t } = useTranslation();
  const rs = t('common.rs');
  const price = market?.price ?? null;

  if (!price) {
    // NOT "no recent price": nothing was substituted and nothing went stale — this market
    // has published no usable price for this crop at all. Saying "recent" would invite the
    // farmer to wait for an update that is not late.
    return (
      <p className="pf-nodata" role="note">
        <span aria-hidden="true">🌱 </span>
        {t('pages.portfolio.noPriceAtMarket')}
      </p>
    );
  }

  const age = priceAgeDays(price.observedDate, todayYmd);
  const showAge = age !== null && age >= PRICE_AGE_NOTE_DAYS;

  return (
    <div className="pf-price">
      <p className="pf-price__value">
        <strong className="pf-price__num">{formatPrice(price.price, lang, rs)}</strong>
        <span className="pf-price__unit">{t('common.perKg')}</span>
      </p>
      <p className="pf-price__meta">
        {t('pages.portfolio.observedOn', { date: formatDate(price.observedDate, lang) })}
        {showAge && (
          <>
            {' · '}
            <span className="pf-price__age">
              {t('pages.portfolio.priceAge', { count: age as number })}
            </span>
          </>
        )}
      </p>
      {price.direction && price.changePct !== null ? (
        <p className={`pf-trend pf-trend--${price.direction}`}>
          <span className="pf-trend__glyph" aria-hidden="true">
            {trendGlyph[price.direction]}
          </span>{' '}
          {t('pages.portfolio.trendLine', {
            dir: t(trendLabelKey(price.direction)),
            pct: Math.abs(price.changePct),
            prev:
              price.previousPrice !== null ? formatPrice(price.previousPrice, lang, rs) : '—',
            date:
              price.previousObservedDate !== null
                ? formatDate(price.previousObservedDate, lang)
                : '—',
          })}
        </p>
      ) : (
        // NOT "steady": there is simply nothing recent enough to compare against.
        <p className="pf-trend pf-trend--none">{t('pages.portfolio.noTrend')}</p>
      )}
    </div>
  );
}
