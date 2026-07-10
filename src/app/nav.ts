// Shared navigation model — one source of truth for sidebar (desktop) and the
// bottom tab bar (mobile). PRD IA §4: exactly 4 destinations, depth <= 2.
export interface NavDest {
  to: string;
  labelKey: string; // i18n key under "nav.*"
  icon: string; // emoji placeholder — swapped for the commissioned SVG set later
  soon?: boolean; // "coming soon" pill (Prices stub in R1, owner decision #2)
}

export const NAV_DESTINATIONS: NavDest[] = [
  { to: '/overview', labelKey: 'nav.overview', icon: '📊' },
  { to: '/my-harvest', labelKey: 'nav.myHarvest', icon: '🌾' },
  { to: '/best-crops', labelKey: 'nav.bestCrops', icon: '🥇' },
  { to: '/prices', labelKey: 'nav.prices', icon: '💰', soon: true },
];
