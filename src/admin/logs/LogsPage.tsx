// Admin "Logs" hub. One page heading (H1) + a route-driven tab strip; the active tab's
// content renders into <Outlet/>. Phase 2 adds Model training + User activity alongside
// Ingestion runs — each tab is its own lazy child route (App.tsx), so a tab's code only
// loads when its route is visited and none of it lands in the farmer first-load bundle.
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminTopbar } from '../adminShared';
import LogsTabs, { LOGS_TABPANEL_ID, logsTabId, type LogsTab } from './LogsTabs';

const LOGS_TABS: LogsTab[] = [
  { to: '/admin/logs/ingestion', labelKey: 'admin.logs.tabs.ingestion' },
  { to: '/admin/logs/training', labelKey: 'admin.logs.tabs.training' },
  { to: '/admin/logs/user-activity', labelKey: 'admin.logs.tabs.userActivity' },
];

export default function LogsPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeTab = LOGS_TABS.find((tab) => tab.to === pathname) ?? LOGS_TABS[0];
  return (
    <>
      <AdminTopbar title={t('admin.logs.title')} subtitle={t('admin.logs.subtitle')} />
      <LogsTabs tabs={LOGS_TABS} ariaLabel={t('admin.logs.title')} />
      <div role="tabpanel" id={LOGS_TABPANEL_ID} aria-labelledby={logsTabId(activeTab.to)}>
        <Outlet />
      </div>
    </>
  );
}
