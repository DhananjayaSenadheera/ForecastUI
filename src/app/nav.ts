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
  { to: '/prices', labelKey: 'nav.prices', icon: '💰' },
];

// Admin console destinations (ADM-1). Rendered in the shell nav ONLY when the
// signed-in role is 'Admin' — farmers never see these, so the locked 4-tab farmer
// IA is unchanged. This is an internal tool, so more than 4 entries is acceptable
// for admins (unlike the farmer bottom tab bar).
export const ADMIN_NAV_DESTINATIONS: NavDest[] = [
  { to: '/admin/policy-flags', labelKey: 'nav.admin.policyFlags', icon: '🏳️' },
  { to: '/admin/markets', labelKey: 'nav.admin.markets', icon: '🏪' },
  { to: '/admin/users', labelKey: 'nav.admin.users', icon: '👥' },
  { to: '/admin/festivals', labelKey: 'nav.admin.festivals', icon: '🗓️' },
  { to: '/admin/indicators', labelKey: 'nav.admin.indicators', icon: '📈' },
  { to: '/admin/news', labelKey: 'nav.admin.news', icon: '📰' },
  { to: '/admin/ingestion', labelKey: 'nav.admin.ingestion', icon: '📥' },
];
