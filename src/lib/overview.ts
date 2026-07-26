// Market-overview presentation logic. Pure helpers so mover partitioning and the
// biggest-mover pick are unit-tested and OverviewPage stays presentational.
// The server sends up to 5 risers then up to 5 fallers, already ordered: partitioning only
// splits by the frozen `direction` string and never re-sorts. Direction renders as glyph +
// word and is never colour-coded. `hasData` reads the payload honestly — no asOf means no
// data.
import type { MarketMover, MarketOverview } from '../api/types';

export interface MoverGroups {
  risers: MarketMover[];
  fallers: MarketMover[];
}

/**
 * Split movers into risers and fallers by the frozen `direction` string, preserving the
 * server order within each group (that order IS the ranking).
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
 * The single biggest mover by absolute percent change. Ties keep the higher-ranked row;
 * returns null for an empty list.
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
