// Admin "Logs" hub. One page heading (H1) + a route-driven tab strip; the active tab's
// content renders into <Outlet/>. Phase 2 adds Model training + User activity alongside
// Ingestion runs — each tab is its own lazy child route (App.tsx), so a tab's code only
// loads when its route is visited and none of it lands in the farmer first-load bundle.
// Each tab's one-paragraph explainer is a hover/focus tooltip on the tab itself (owner
// request 2026-07-22, replacing the per-page 💡 banner). Touch devices have no hover, so
// a mobile-only ⓘ toggle below the strip shows the ACTIVE tab's explainer on tap.
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminTopbar } from '../adminShared';
import LogsTabs, { LOGS_TABPANEL_ID, logsTabId, type LogsTab } from './LogsTabs';

const LOGS_TABS: LogsTab[] = [
  { to: '/admin/logs/ingestion', labelKey: 'admin.logs.tabs.ingestion', hintKey: 'admin.ingestion.explainer' },
  { to: '/admin/logs/training', labelKey: 'admin.logs.tabs.training', hintKey: 'admin.logs.training.explainer' },
  { to: '/admin/logs/user-activity', labelKey: 'admin.logs.tabs.userActivity', hintKey: 'admin.logs.userActivity.explainer' },
  { to: '/admin/logs/errors', labelKey: 'admin.logs.tabs.errors', hintKey: 'admin.logs.errors.explainer' },
];

const LOGS_HINT_ID = 'logs-hint';

export default function LogsPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeTab = LOGS_TABS.find((tab) => tab.to === pathname) ?? LOGS_TABS[0];

  // Mobile ⓘ state. Collapses on tab change so a stale explainer never lingers
  // under a different tab.
  const [hintOpen, setHintOpen] = useState(false);
  useEffect(() => {
    setHintOpen(false);
  }, [pathname]);

  return (
    <>
      <AdminTopbar title={t('admin.logs.title')} subtitle={t('admin.logs.subtitle')} />
      <LogsTabs tabs={LOGS_TABS} ariaLabel={t('admin.logs.title')} />
      <button
        type="button"
        className="logs-hint-toggle"
        aria-expanded={hintOpen}
        // aria-controls only while the note exists — a collapsed note is not in the
        // DOM, and a dangling idref is an ARIA violation.
        {...(hintOpen ? { 'aria-controls': LOGS_HINT_ID } : {})}
        onClick={() => setHintOpen((open) => !open)}
      >
        <span aria-hidden="true">ⓘ </span>
        {t('admin.logs.hintToggle')}
      </button>
      {hintOpen && (
        <p className="adm-note logs-hint-note" role="note" id={LOGS_HINT_ID}>
          {t(activeTab.hintKey)}
        </p>
      )}
      <div role="tabpanel" id={LOGS_TABPANEL_ID} aria-labelledby={logsTabId(activeTab.to)}>
        <Outlet />
      </div>
    </>
  );
}
