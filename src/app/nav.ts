// Shared navigation model — one source of truth for the desktop sidebar and the mobile
// tab bar. Exactly 4 farmer destinations.
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

// Admin destinations, rendered in the shell nav ONLY for role 'Admin', so the farmer's
// 4-tab IA is unchanged. More than 4 entries is fine here — it is an internal tool.
export const ADMIN_NAV_DESTINATIONS: NavDest[] = [
  { to: '/admin/policy-flags', labelKey: 'nav.admin.policyFlags', icon: '🏳️' },
  { to: '/admin/markets', labelKey: 'nav.admin.markets', icon: '🏪' },
  { to: '/admin/users', labelKey: 'nav.admin.users', icon: '👥' },
  { to: '/admin/festivals', labelKey: 'nav.admin.festivals', icon: '🗓️' },
  { to: '/admin/indicators', labelKey: 'nav.admin.indicators', icon: '📈' },
  { to: '/admin/news', labelKey: 'nav.admin.news', icon: '📰' },
  // "Logs" hub (Phase 1) — tabbed page; its first/only tab is the former Ingestion runs.
  { to: '/admin/logs', labelKey: 'nav.admin.logs', icon: '📋' },
];
