// CropDetailsDialog — the "More details" popup for one watched crop.
//
// The owner's idea in one line: a farmer manages a crop from ONE card. Tapping the card
// opens everything about that crop in a sheet over the list, instead of navigating away and
// losing their place in it. Phase 2's selling price, fertiliser cost and labour cost become
// FURTHER SECTIONS in this same body — which is why the body is a plain sequence of
// <section>s with their own headings rather than a fixed two-column layout. Nothing is
// stubbed out for them: an empty "coming soon" panel is a promise the screen cannot keep,
// and a farmer reading it learns nothing.
//
// It carries the card's MARKET CONTEXT with it. Opened from the BAN tab, the popup is about
// Bandarawela: the same price, the same date, the same chart, and the link out to the crop
// page carries ?market= so that context survives one more hop. The popup deliberately has
// no market switcher of its own — the tabs on the card behind it are where a market is
// chosen, and a second switcher would be a second answer to "which market is this about".
//
// Since the 2026-07-29 card simplification it is also the ONLY place three facts are shown:
// the market's full name in plain words, the readiness badge and the price-swing pill. The
// card kept the codes and the number; this popup is where "KEP" becomes "Keppetipola" for a
// touch user who has no hover, and where the swing claim is made. None of the three may be
// dropped from here without putting them back on the card.
//
// It re-uses, never re-implements: PriceBlock, PriceSwingBadge and PriceLineChart are the
// card's own components fed the card's own already-fetched history (opening the popup costs
// no request), PlantedDateSection is the same section the card shows, and the forecast state
// is passed IN from the card so both copies show one fetch's answer.
import { useTranslation } from 'react-i18next';
import type {
  PlantedDateClearRequest,
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
  PriceHistoryPoint,
} from '../api/types';
import type { CropReadinessStatus } from '../lib/readiness';
import { cropIcon } from '../lib/cropIcons';
import { cropDetailLink, marketCodeLabel } from '../lib/portfolio';
import Modal from './Modal';
import PlantedDateSection, {
  type PlantedForecastState,
  type WriteMessage,
} from './PlantedDateSection';
import PriceLineChart from './PriceLineChart';
import PriceSwingBadge from './PriceSwingBadge';
import ReadinessBadge from './ReadinessBadge';
import PriceBlock from './PriceBlock';
import { Link } from 'react-router-dom';
import type { PriceSwing } from '../lib/priceSwing';

export interface CropDetailsDialogProps {
  item: PortfolioDashboardItem;
  /** The market the card was showing when this opened — the whole popup is about it. */
  market: PortfolioDashboardMarket | null;
  readiness: CropReadinessStatus | null;
  lang: string;
  todayYmd: string;
  /** The card's cached series for `market`; null while it is still in flight, [] when there
   *  is nothing to draw. Undefined means this market has no price and so no chart at all. */
  history: PriceHistoryPoint[] | null | undefined;
  swing: PriceSwing | null;
  forecast: PlantedForecastState;
  onRetryForecast: () => void;
  onSavePlantedDate: (cropId: string, plantedDate: string) => Promise<WriteMessage | null>;
  /** Removes the planting date, with the reason the farmer picked. THIS surface owns removal:
   *  it is the only one with room to ask why, and the only one where the question cannot be
   *  mistaken for a control on nine other crops. */
  onClearPlantedDate: (
    cropId: string,
    clear: PlantedDateClearRequest,
  ) => Promise<WriteMessage | null>;
  busy: boolean;
  onClose: () => void;
}

export default function CropDetailsDialog({
  item,
  market,
  readiness,
  lang,
  todayYmd,
  history,
  swing,
  forecast,
  onRetryForecast,
  onSavePlantedDate,
  onClearPlantedDate,
  busy,
  onClose,
}: CropDetailsDialogProps) {
  const { t } = useTranslation();
  const titleId = `pf-dlg-title-${item.cropId}`;

  return (
    <Modal
      title={item.cropName}
      titleId={titleId}
      // The same disc the card behind this sheet is showing: the popup covers that card,
      // so carrying its icon over is what makes it read as the SAME crop opened up.
      icon={cropIcon({ cropCode: item.cropCode, cropName: item.cropName })}
      onClose={onClose}
    >
      {/* Header facts: how far the model can be trusted on this crop, and which market
          everything below is about. The code is a LABEL here, not a control — the tabs on
          the card are where a market is chosen. */}
      <div className="pf-dlg__meta">
        <ReadinessBadge status={readiness} compact />
        {market && (
          <span className="pf-dlg__market">
            <span className="pf-dlg__code">{marketCodeLabel(market)}</span>
            <span className="pf-dlg__market-name">{market.name}</span>
          </span>
        )}
      </div>
      {market?.isDefaultMarket && (
        <p className="pf-card__market-note">{t('pages.portfolio.defaultMarketNote')}</p>
      )}

      <section className="pf-dlg__section" aria-labelledby={`${titleId}-price`}>
        <h3 className="pf-dlg__h" id={`${titleId}-price`}>
          {t('pages.portfolio.priceNowHeading')}
        </h3>
        <PriceBlock market={market} lang={lang} todayYmd={todayYmd} />
        <PriceSwingBadge swing={swing} />
        {/* No chart where there is no price: the series behind it cannot have rows, and an
            empty chart under an honest "no price" line is a second, differently-worded way
            of saying the same nothing. */}
        {history !== undefined && (
          <div className="pf-card__chart">
            {history === null ? (
              <div className="pf-skel pf-skel--chart" aria-busy="true">
                <span className="sr-only">{t('common.loading')}</span>
              </div>
            ) : (
              <PriceLineChart
                history={history}
                cropLabel={item.cropName}
                marketName={market?.name ?? ''}
                lang={lang}
              />
            )}
          </div>
        )}
      </section>

      {/* The farmer's planting and what it is forecast to fetch — the same section the card
          shows, with its own ids so the two inputs on screen never share one label.
          A DIV, not a <section>: PlantedDateSection is already a landmark-shaped section
          labelled by its own heading, and wrapping it in a second, nameless one would add
          an unnamed region to the dialog for nothing but a class name. */}
      <div className="pf-dlg__section">
        <PlantedDateSection
          item={item}
          market={market}
          lang={lang}
          todayYmd={todayYmd}
          forecast={forecast}
          onRetryForecast={onRetryForecast}
          onSave={onSavePlantedDate}
          onClear={onClearPlantedDate}
          busy={busy}
          idPrefix="dlg"
          headingLevel={3}
          // The popup is where a planting date can be REMOVED (the card no longer offers it),
          // behind a confirm that asks for a reason. See PlantedDateSection's header.
          clearControl="confirm"
        />
      </div>

      {/* Phase 2 (selling price, fertiliser cost, labour cost) slots in HERE as further
          <section className="pf-dlg__section"> blocks, above the way-out links. */}

      <p className="pf-dlg__links">
        <Link
          className="pf-card__link"
          to={cropDetailLink(item, market?.marketId ?? null)}
          aria-label={t('pages.portfolio.openCropPageAria', { crop: item.cropName })}
        >
          {t('pages.portfolio.openCropPage')}
        </Link>
      </p>
    </Modal>
  );
}
