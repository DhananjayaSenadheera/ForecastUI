// MarketTabs — the short-code strip that sits in a crop card's header row, right after the
// crop name and the arrow ("Beans → DEC"), and says WHICH market the numbers beside and
// below it belong to.
//
// One market: a single chip, no tablist (a tab strip of one is a control that cannot do
// anything). Two or three: the WAI-ARIA tabs pattern, in wire order — markets[0], the
// farmer's oldest-chosen, is the preselected tab and we never re-sort. Keyboard behaviour
// is the shared useRovingTabs hook, the same one the admin Logs strips use.
//
// Why the full market name is everywhere at once:
//   • it is the control's ACCESSIBLE NAME ("Kandy (HARTI wholesale) (KAN)"), so a screen
//     reader never announces three unexplained letters;
//   • it is a hover/focus tooltip for pointer and keyboard users;
//   • the single chip — which has no selection job — toggles it inline on tap, the same
//     idiom as the admin ⓘ hint;
//   • and for a crop with SEVERAL markets, where a tap on a tab selects rather than
//     explains, "More details" spells the selected market out in plain words. The card
//     itself no longer prints it (the owner's 2026-07-29 simplification moved that line
//     into the popup along with readiness and the swing pill), so the popup is now the
//     touch answer to "what is KEP?" and must keep carrying it.
//
// "DEC"/"KEP"/… are display only. Every market is addressed by marketId, and the contract
// allows an empty shortCode — marketCodeLabel falls back to the full name so the chip is
// never blank.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioDashboardMarket } from '../api/types';
import { marketCodeLabel } from '../lib/portfolio';
import { useRovingTabs } from '../lib/tabs';

/** Stable DOM id for one market's tab on one crop's card. */
export function marketTabId(cropId: string, marketId: string): string {
  return `pf-mtab-${cropId}-${marketId}`;
}

/** Stable DOM id for the card's market-scoped panel. */
export function marketPanelId(cropId: string): string {
  return `pf-mpanel-${cropId}`;
}

export interface MarketTabsProps {
  cropId: string;
  cropName: string;
  markets: PortfolioDashboardMarket[];
  /** The market whose numbers are on screen; always one of `markets`. */
  selectedMarketId: string | null;
  onSelect: (marketId: string) => void;
}

export default function MarketTabs({
  cropId,
  cropName,
  markets,
  selectedMarketId,
  onSelect,
}: MarketTabsProps) {
  const { t } = useTranslation();
  const { refs, onKeyDown } = useRovingTabs<HTMLButtonElement>(markets.length);

  if (markets.length === 0) return null;
  if (markets.length === 1) return <MarketCodeChip market={markets[0]} />;

  return (
    <div
      className="pf-mtabs"
      role="tablist"
      aria-label={t('pages.portfolio.marketTabsAria', { crop: cropName })}
      onKeyDown={onKeyDown}
    >
      {markets.map((m, i) => {
        const selected = m.marketId === selectedMarketId;
        return (
          <span className="pf-mtab-wrap" key={m.marketId}>
            <button
              type="button"
              id={marketTabId(cropId, m.marketId)}
              role="tab"
              aria-selected={selected}
              aria-controls={marketPanelId(cropId)}
              // The three letters are the visible label; the accessible name spells the
              // market out and still contains them (WCAG 2.5.3).
              aria-label={t('pages.portfolio.marketCodeAria', {
                market: m.name,
                code: marketCodeLabel(m),
              })}
              // Roving tabindex: only the selected tab is in the Tab order.
              tabIndex={selected ? 0 : -1}
              className={`pf-mtab${selected ? ' is-active' : ''}`}
              ref={(el) => {
                refs.current[i] = el;
              }}
              onClick={() => onSelect(m.marketId)}
            >
              {marketCodeLabel(m)}
            </button>
            {/* Visual only: this text IS the button's accessible name, so announcing it a
                second time as a description would just double-speak. */}
            <span className="pf-mtab-tip" aria-hidden="true">
              {m.name}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** The one-market case: a chip, not a tab. Hover/focus shows the full name; a tap toggles
 *  it as an inline note, because touch has no hover and this control has nothing to select. */
function MarketCodeChip({ market }: { market: PortfolioDashboardMarket }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const noteId = `pf-mcode-note-${market.marketId}`;
  return (
    <div className="pf-mcode-row">
      <span className="pf-mtab-wrap">
        <button
          type="button"
          className="pf-mcode"
          aria-label={t('pages.portfolio.marketCodeAria', {
            market: market.name,
            code: marketCodeLabel(market),
          })}
          aria-expanded={open}
          // Only while the note exists: a dangling idref is invalid.
          {...(open ? { 'aria-controls': noteId } : {})}
          onClick={() => setOpen((o) => !o)}
        >
          {marketCodeLabel(market)}
        </button>
        <span className="pf-mtab-tip" aria-hidden="true">
          {market.name}
        </span>
      </span>
      {open && (
        <span className="pf-mcode__note" id={noteId}>
          {market.name}
        </span>
      )}
    </div>
  );
}
