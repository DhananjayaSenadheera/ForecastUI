// =============================================================================
// Market-overview presentation logic (FE-1 landing dashboard). Pure, framework-free
// helpers so the load-bearing bits (mover partitioning, biggest-mover pick) are
// unit-tested and OverviewPage stays presentational.
//
// HONEST-DISPLAY RULES baked in here:
//   - The server sends movers as up-to-5 RISERS then up-to-5 FALLERS, already
//     ordered. We PRESERVE that order — partitioning only splits by the frozen
//     `direction` string, never re-sorts. The UI reflects what the server ranked.
//   - `direction` ("up"/"down") is rendered as a glyph + word by the component and
//     is NEVER colour-coded (RED is reserved app-wide for the "Not recommended"
//     verdict). These helpers carry the neutral glyph, not a colour.
//   - `hasData` reads the payload honestly: no asOf => no data, show the empty state
//     rather than a fabricated snapshot.
// =============================================================================
import type { MarketMover, MarketOverview } from '../api/types';

export interface MoverGroups {
  risers: MarketMover[];
  fallers: MarketMover[];
}

/**
 * Split movers into risers/fallers by the frozen `direction` string, PRESERVING the
 * server order within each group (the server's order is the ranking — never re-sort).
 */
export function partitionMovers(movers: MarketMover[]): MoverGroups {
  const risers: MarketMover[] = [];
  const fallers: MarketMover[] = [];
  for (const m of movers) {
    if (m.direction === 'down') fallers.push(m);
    else risers.push(m);
  }
  return { risers, fallers };
}

/**
 * The single biggest mover by ABSOLUTE percent change (for the KPI tile). Ties keep
 * the earlier (higher-ranked) row. Returns null for an empty list.
 */
export function biggestMover(movers: MarketMover[]): MarketMover | null {
  let best: MarketMover | null = null;
  for (const m of movers) {
    if (best === null || Math.abs(m.changePct) > Math.abs(best.changePct)) best = m;
  }
  return best;
}

/** Direction glyph — paired ALWAYS with a text word by the component (never colour/glyph-only). */
export const moverGlyph: Record<MarketMover['direction'], string> = {
  up: '▲',
  down: '▼',
};

/** i18n key for a mover direction's plain-language word. */
export function moverDirectionKey(d: MarketMover['direction']): 'pages.overview.rising' | 'pages.overview.falling' {
  return d === 'down' ? 'pages.overview.falling' : 'pages.overview.rising';
}

/** Honest data check: a null asOf means the window had no data at all. */
export function overviewHasData(ov: MarketOverview): boolean {
  return ov.asOf !== null;
}
