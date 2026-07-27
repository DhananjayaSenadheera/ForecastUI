// Admin "Logs" hub: one page heading plus a route-driven tab strip, with the active
// tab rendered into <Outlet/>. Each tab is its own lazy child route. A tab's explainer
// is a hover/focus tooltip; touch has no hover, so a mobile-only ⓘ toggle shows the
// active tab's text instead.
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
  {
    to: '/admin/logs/forecast-accuracy',
    labelKey: 'admin.logs.tabs.forecastAccuracy',
    hintKey: 'admin.forecastAccuracy.explainer',
  },
];

const LOGS_HINT_ID = 'logs-hint';

export default function LogsPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeTab = LOGS_TABS.find((tab) => tab.to === pathname) ?? LOGS_TABS[0];

  // Collapse the ⓘ note on tab change so a stale explainer never sits under a new tab.
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
        // aria-controls only while the note exists — a dangling idref is invalid.
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
