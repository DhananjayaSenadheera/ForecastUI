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
//
// `part` exists because the crop card puts the NUMBER and the TREND side by side in one
// price row while the other surfaces stack them — two layouts, one fact. `trendStyle` and
// `hintId` are the same idea taken one step further: the card draws the trend as a tinted
// badge and hangs an ⓘ on the observed date, because it has to be read at a glance in
// sunlight. All three are RENDER options and never wording options: every string, every
// rounding rule and every honesty branch below is shared by all three surfaces, the badge
// carries the identical sentence for assistive tech, and the defaults ('all' / 'line' / no
// hint) are exactly what the popup and the crop page render today. The alternative — the
// card assembling its own price line from `market.price` — is how three screens end up
// saying three different things about one number.
import { useTranslation } from 'react-i18next';
import type { PortfolioDashboardMarket, PortfolioPriceDirection } from '../api/types';
import { formatDate, formatPrice } from '../lib/format';
import {
  PRICE_AGE_NOTE_DAYS,
  priceAgeDays,
  trendGlyph,
  trendLabelKey,
} from '../lib/portfolio';
import InfoHint from './InfoHint';

/** Which half of the price fact to render.
 *  - 'all'   — number, observed date and trend together (popup, crop page).
 *  - 'price' — the number and its observed date, PLUS the "no price here" note, because that
 *              note is what stands in the number's place when there is none.
 *  - 'trend' — the trend line alone; nothing at all when there is no price, since the note
 *              in the price slot has already said so and repeating it is noise. */
export type PriceBlockPart = 'all' | 'price' | 'trend';

/** How the trend is drawn. Same facts, same words, two shapes:
 *  - 'line'  — one sentence under the price (popup, crop page). The original, and the
 *              default, so those surfaces cannot be changed by a card decision.
 *  - 'badge' — the card's tinted block: the percentage large, the comparison small beneath.
 *              The SENTENCE is still rendered, screen-reader-only, so assistive tech hears
 *              the identical string every other surface says. The visible split is
 *              aria-hidden decoration of a fact that is already there in full. */
export type TrendStyle = 'line' | 'badge';

/** Badge tint by direction. Green for a rise, AMBER for a fall — never red: a falling
 *  price is a fact the farmer must act on, not a failure or an error, and red is reserved
 *  app-wide for the "Not recommended" verdict. Steady is neutral. The arrow and the words
 *  carry the direction on their own; the tint only reinforces them. */
const TREND_ARROW: Record<PortfolioPriceDirection, string> = {
  up: '↑',
  down: '↓',
  steady: '→',
};

export default function PriceBlock({
  market,
  lang,
  todayYmd,
  part = 'all',
  trendStyle = 'line',
  hintId,
}: {
  market: PortfolioDashboardMarket | null;
  lang: string;
  todayYmd: string;
  part?: PriceBlockPart;
  trendStyle?: TrendStyle;
  /** Set to attach the "what does this date mean?" ⓘ to the observed-date line, with this
   *  as its id root. Omitted (popup, crop page) means no hint at all — those surfaces have
   *  the room to explain in prose and are not competing with a crop name for width. */
  hintId?: string;
}) {
  const { t } = useTranslation();
  const rs = t('common.rs');
  const price = market?.price ?? null;

  if (!price) {
    if (part === 'trend') return null;
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

  const facts = (
    <>
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
        {/* Everything InfoHint renders is inline-safe, so it can live inside this
            paragraph and stay on the date's own line. */}
        {hintId && <InfoHint hint={t('pages.portfolio.priceFromHint')} id={`${hintId}-pricefrom`} />}
      </p>
    </>
  );

  // Returned before the trend is built at all: the card asks for the two halves separately,
  // so the header slot must not construct a line it would throw away on every repaint.
  if (part === 'price') return <div className="pf-price pf-price--head">{facts}</div>;

  // The comparison's own words, built ONCE and used by both shapes below, so the line and
  // the badge can never end up describing the movement differently.
  const trendParts =
    price.direction && price.changePct !== null
      ? {
          direction: price.direction,
          dir: t(trendLabelKey(price.direction)),
          pct: Math.abs(price.changePct),
          prev: price.previousPrice !== null ? formatPrice(price.previousPrice, lang, rs) : '—',
          date:
            price.previousObservedDate !== null
              ? formatDate(price.previousObservedDate, lang)
              : '—',
        }
      : null;

  const trend = !trendParts ? (
    // NOT "steady": there is simply nothing recent enough to compare against. No badge
    // either — a tinted block would give an absence the weight of a movement.
    <p className="pf-trend pf-trend--none">{t('pages.portfolio.noTrend')}</p>
  ) : trendStyle === 'badge' ? (
    <p className={`pf-trendbadge pf-trendbadge--${trendParts.direction}`}>
      {/* The canonical sentence, word for word the one the popup and the crop page print.
          It is what assistive tech reads; the two visible lines below are the same fact
          laid out for the eye and are hidden from the accessibility tree so it is never
          announced twice. */}
      <span className="sr-only">{t('pages.portfolio.trendLine', trendParts)}</span>
      <span className="pf-trendbadge__pct" aria-hidden="true">
        <span className="pf-trendbadge__arrow">{TREND_ARROW[trendParts.direction]}</span>
        {t('pages.portfolio.trendPct', { pct: trendParts.pct })}
      </span>
      <span className="pf-trendbadge__from" aria-hidden="true">
        {t('pages.portfolio.trendFrom', trendParts)}
      </span>
    </p>
  ) : (
    <p className={`pf-trend pf-trend--${trendParts.direction}`}>
      <span className="pf-trend__glyph" aria-hidden="true">
        {trendGlyph[trendParts.direction]}
      </span>{' '}
      {t('pages.portfolio.trendLine', trendParts)}
    </p>
  );

  if (part === 'trend') return trend;

  return (
    <div className="pf-price">
      {facts}
      {trend}
    </div>
  );
}
