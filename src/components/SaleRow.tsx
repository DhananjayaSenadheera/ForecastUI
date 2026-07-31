// SaleRow — one recorded sale, as the farmer wrote it down.
//
// Shared by the popup's "sales for this crop" list and the My-sales page, so a sale reads
// identically wherever it is met. The two surfaces differ in one thing only — the page shows
// WHICH crop each sale was, the popup is already about one crop — and that is a prop, not a
// second component.
//
// Honesty rules here:
//  - The price is printed EXACTLY as it was recorded. Rs. 215.50 never becomes Rs. 216: this
//    is the farmer's own money, not a forecast, and rounding someone's records is a lie about
//    what they told us. Whole numbers still print whole (no "Rs. 215.00" noise).
//  - "No market recorded" is a FACT, not missing data: selling at the farm gate is a normal
//    answer, and the copy must not read as an omission to be fixed.
//  - Nothing here is red, including "Remove". Deleting a sale removes a record the farmer can
//    type again in ten seconds; the app's reds are the "Not recommended" verdict and the
//    controls that destroy something irreplaceable. Money vocabulary stays neutral.
//  - The delete confirm is CONTROLLED by the parent, so opening an editor anywhere on the
//    surface closes it. A confirm merely hidden by another editor resurrects stale and asks
//    to destroy something the farmer has since moved on from.
import { useTranslation } from 'react-i18next';
import type { SaleItem } from '../api/types';
import { exactDigits, formatDate, formatExactAmount, formatPrice } from '../lib/format';

export interface SaleRowProps {
  sale: SaleItem;
  lang: string;
  /** True on the My-sales page, where one list holds every crop. */
  showCrop: boolean;
  /** A write is in flight on this surface. */
  busy: boolean;
  /** This row's delete confirm is the open one. Owned by the parent — one confirm at a time,
   *  and any editor opening closes it. */
  confirming: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  /** The confirm's "Yes". Focus is sent here when the confirm OPENS (the Remove button the
   *  farmer pressed is being unmounted by that very state change) and again after a refused
   *  delete, which leaves the question standing. */
  yesRef?: React.Ref<HTMLButtonElement>;
}

export default function SaleRow({
  sale,
  lang,
  showCrop,
  busy,
  confirming,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  yesRef,
}: SaleRowProps) {
  const { t } = useTranslation();
  const when = formatDate(sale.saleDate, lang);
  const confirmId = `sale-confirm-${sale.id}`;

  return (
    <li className="pf-sale">
      <div className="pf-sale__head">
        <p className="pf-sale__when">
          <span className="pf-sale__date">{t('pages.sales.soldOn', { date: when })}</span>
          {showCrop && <span className="pf-sale__crop">{sale.cropName}</span>}
        </p>
        <p className="pf-sale__price">
          {formatPrice(sale.pricePerKg, lang, t('common.rs'), exactDigits(sale.pricePerKg))}
          <span className="pf-sale__unit">{t('common.perKg')}</span>
        </p>
      </div>

      <p className="pf-sale__meta">
        <span className="pf-sale__metaitem">
          <span className="pf-sale__metalabel">{t('pages.sales.quantityShort')}</span>{' '}
          {sale.quantityKg === null
            ? t('pages.sales.notRecorded')
            : t('pages.sales.quantityValue', { qty: formatExactAmount(sale.quantityKg, lang) })}
        </span>
        <span className="pf-sale__metaitem">
          <span className="pf-sale__metalabel">{t('pages.sales.marketShort')}</span>{' '}
          {sale.marketId === null ? t('pages.sales.noMarket') : sale.marketName}
        </span>
      </p>

      {sale.note && <p className="pf-sale__note">{sale.note}</p>}

      {confirming ? (
        // alertdialog, not alert: this region is a CHOICE, and a plain alert announces text
        // while telling a screen-reader user nothing about the decision they are standing in.
        // Escape is swallowed UNCONDITIONALLY and only the cancel is conditional: on the popup
        // surface this sits inside a dialog, and a mid-flight Escape that bubbled would close
        // the only surface reporting the result.
        <div
          className="pf-confirm pf-sale__confirm"
          role="alertdialog"
          aria-labelledby={confirmId}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            e.preventDefault();
            if (!busy) onCancelDelete();
          }}
        >
          <p className="pf-confirm__q" id={confirmId}>
            {t('pages.sales.deleteConfirmQuestion', { crop: sale.cropName, date: when })}
          </p>
          <div className="pf-confirm__actions">
            <button
              type="button"
              ref={yesRef}
              className="btn-primary pf-sale__yes"
              disabled={busy}
              onClick={onConfirmDelete}
            >
              {t('pages.sales.deleteConfirmYes')}
            </button>
            <button
              type="button"
              className="btn-ghost pf-confirm__no"
              disabled={busy}
              onClick={onCancelDelete}
            >
              {t('pages.sales.deleteConfirmNo')}
            </button>
          </div>
        </div>
      ) : (
        <p className="pf-sale__actions">
          <button
            type="button"
            className="pf-plant__link"
            disabled={busy}
            onClick={onEdit}
            aria-label={t('pages.sales.editAria', { crop: sale.cropName, date: when })}
          >
            {t('pages.sales.edit')}
          </button>
          <button
            type="button"
            className="pf-plant__link"
            disabled={busy}
            onClick={onAskDelete}
            aria-label={t('pages.sales.deleteAria', { crop: sale.cropName, date: when })}
          >
            {t('pages.sales.delete')}
          </button>
        </p>
      )}
    </li>
  );
}
