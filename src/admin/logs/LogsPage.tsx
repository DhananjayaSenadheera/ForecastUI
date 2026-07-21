// Admin "Logs" hub (Phase 1). One page heading (H1) + a route-driven tab strip; the
// active tab's content renders into <Outlet/>. Today there is exactly ONE tab
// (Ingestion runs) — future tabs (User activity, Errors) are deliberately NOT stubbed,
// so the single-tab strip is the honest current state. Lazy-loaded from App, so none
// of this lands in the farmer first-load bundle.
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminTopbar } from '../adminShared';
import LogsTabs, { LOGS_TABPANEL_ID, logsTabId, type LogsTab } from './LogsTabs';

const LOGS_TABS: LogsTab[] = [{ to: '/admin/logs/ingestion', labelKey: 'admin.logs.tabs.ingestion' }];

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
