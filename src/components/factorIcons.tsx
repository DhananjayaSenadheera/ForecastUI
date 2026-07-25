// Leading icons for the "Why this price?" factor rows — small inline SVGs
// (Feather-style, stroke = currentColor), matching src/admin/icons.tsx so the app
// has ONE icon language. No icon font, no emoji: emoji render differently on every
// mid-range Android and carry an unwanted skin/culture tone.
//
// These are DECORATIVE ONLY (aria-hidden): the row's text is the causal sentence,
// and an icon can never disambiguate "supply is plentiful" from "supply is short".
// The icon is a scanning aid for a farmer skimming four rows, nothing more.
import type { ReactElement, SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

// Zig-zag line on axes — recent price trend.
function IconTrend() {
  return (
    <svg {...base}>
      <path d="M4 4v16h16" />
      <path d="M7 15l4-5 3 3 5-6" />
    </svg>
  );
}

// Star — festival demand.
function IconFestival() {
  return (
    <svg {...base}>
      <path d="M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8L12 3.5z" />
    </svg>
  );
}

// Calendar with a leaf tick — seasonal supply (how much is harvested WHEN).
function IconSeason() {
  return (
    <svg {...base}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M9 16h6" />
    </svg>
  );
}

// Cloud with rain — weather and monsoon.
function IconWeather() {
  return (
    <svg {...base}>
      <path d="M7 16a4 4 0 0 1 .6-8 5 5 0 0 1 9.5 1.4A3.3 3.3 0 0 1 17 16H7z" />
      <path d="M8 19.5l-.7 1.5M12 19.5l-.7 1.5M16 19.5l-.7 1.5" />
    </svg>
  );
}

// Shop awning — market conditions (prices in nearby markets).
function IconMarket() {
  return (
    <svg {...base}>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9a2.5 2.5 0 0 0 4.5 1.5A2.5 2.5 0 0 0 12 10.5a2.5 2.5 0 0 0 4.5 0A2.5 2.5 0 0 0 21 9" />
      <path d="M5 11.5V20h14v-8.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

// Coin — economic conditions (the rupee, cost of living).
function IconEconomy() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 8h5M9.5 11h5" />
      <path d="M13 8c1.8 0 2.5 1.2 2.5 2.5S14.5 13 13 13h-3l4.5 4" />
    </svg>
  );
}

// Anything the model sends that we have no icon for yet.
function IconGeneric() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v.5M12 11.5V16" />
    </svg>
  );
}

const BY_CODE: Record<string, () => ReactElement> = {
  recent_price_trend: IconTrend,
  festival_demand: IconFestival,
  seasonal_supply: IconSeason,
  weather_monsoon: IconWeather,
  market_conditions: IconMarket,
  economic_conditions: IconEconomy,
};

/** Decorative leading icon for a factor code; a neutral glyph for unknown codes. */
export function FactorIcon({ code }: { code: string }) {
  const Icon = BY_CODE[code] ?? IconGeneric;
  return <Icon />;
}
