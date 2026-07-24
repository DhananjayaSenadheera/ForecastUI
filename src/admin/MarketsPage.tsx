// ADM-3 — Markets registry + monitoring VIEW page (/admin/markets). LIVE via
// GET /api/markets/get/all (backend PR #24); the client falls back to fixtures that
// mirror the REAL 12 seeded markets when VITE_API_MODE=fixtures.
//
// Beyond the registry (Name/District/Type/Economic centre) the table now answers three
// operational questions per market, straight off the wire DTO:
//   • Data stored     — does the market hold any stored price observation at all?
//   • Last stored     — the freshest observation date we hold (with a stale cue when old).
//   • Training source  — does its USABLE data actually feed the forecasting models?
//                        (feature-safe + usable; the national-average row is monitored but
//                        excluded by design, so it reads —/Never/Excluded — honestly.)
// All flags are icon + text, never colour-only.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Market } from '../api/types';
import { formatDate, mapMarketType } from '../lib/format';
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTopbar,
  DemoNote,
  EnumBadge,
  usePagination,
} from './adminShared';

const STALE_AFTER_DAYS = 7;

function daysSince(ymd: string): number {
  const then = new Date(ymd + 'T00:00:00').getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export default function MarketsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pager = usePagination(markets);

  // Summary counts across the WHOLE set (not just the current page).
  const summary = useMemo(
    () => ({
      total: markets.length,
      storing: markets.filter((m) => m.hasStoredData).length,
      training: markets.filter((m) => m.isTrainingSource).length,
    }),
    [markets],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setMarkets(await api.getAdminMarkets());
    } catch {
      // Any failure surfaces as the error state with retry — the page never white-screens.
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <AdminTopbar title={t('admin.markets.title')} subtitle={t('admin.markets.subtitle')} />
      <section className="panel adm" aria-label={t('admin.markets.title')}>
        <DemoNote hasLiveEndpoint={true} />

        {!loading && !error && markets.length > 0 && (
          <p className="adm-note" role="status">
            {t('admin.markets.summary', summary)}
          </p>
        )}

        {error ? (
          <AdminError onRetry={() => void load()} />
        ) : loading ? (
          <AdminLoading rows={6} />
        ) : markets.length === 0 ? (
          <AdminEmpty title={t('admin.markets.emptyTitle')} body={t('admin.markets.emptyBody')} />
        ) : (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <caption className="sr-only">{t('admin.markets.title')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('admin.markets.colName')}</th>
                  <th scope="col">{t('admin.markets.colDistrict')}</th>
                  <th scope="col">{t('admin.markets.colType')}</th>
                  <th scope="col">{t('admin.markets.colEconomic')}</th>
                  <th scope="col">{t('admin.markets.colStored')}</th>
                  <th scope="col">{t('admin.markets.colLastStored')}</th>
                  <th scope="col">{t('admin.markets.colTraining')}</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((m) => {
                  const type = mapMarketType(m.marketType);
                  const isStale =
                    m.hasStoredData &&
                    m.lastStoredDate != null &&
                    daysSince(m.lastStoredDate) > STALE_AFTER_DAYS;
                  return (
                    <tr key={m.id}>
                      <th scope="row" className="adm-c-title" data-label={t('admin.markets.colName')}>
                        <span className="adm-title">{m.name}</span>
                      </th>
                      <td data-label={t('admin.markets.colDistrict')}>
                        {m.district ?? <span className="adm-muted">—</span>}
                      </td>
                      <td data-label={t('admin.markets.colType')}>
                        <EnumBadge labelKey={type.labelKey} fallback={type.fallback} />
                      </td>
                      <td data-label={t('admin.markets.colEconomic')}>
                        {m.isEconomicCenter ? (
                          <span className="adm-yes">
                            <span aria-hidden="true">✓ </span>
                            {t('admin.markets.economicYes')}
                          </span>
                        ) : (
                          <span className="adm-muted">
                            <span aria-hidden="true">— </span>
                            <span className="sr-only">{t('admin.markets.economicNo')}</span>
                          </span>
                        )}
                      </td>
                      <td data-label={t('admin.markets.colStored')}>
                        {m.hasStoredData ? (
                          <span className="adm-yes">
                            <span aria-hidden="true">✓ </span>
                            {t('admin.markets.storedYes')}
                          </span>
                        ) : (
                          <span className="adm-muted">
                            <span aria-hidden="true">— </span>
                            <span className="sr-only">{t('admin.markets.storedNo')}</span>
                          </span>
                        )}
                      </td>
                      <td data-label={t('admin.markets.colLastStored')}>
                        {m.lastStoredDate ? (
                          <>
                            {formatDate(m.lastStoredDate, lang)}
                            {isStale && (
                              <>
                                {' · '}
                                <span
                                  className="adm-muted adm-stale"
                                  title={t('admin.markets.staleTitle')}
                                >
                                  {t('admin.markets.staleTag')}
                                </span>
                              </>
                            )}
                          </>
                        ) : (
                          <span className="adm-muted">{t('admin.markets.lastNever')}</span>
                        )}
                      </td>
                      <td data-label={t('admin.markets.colTraining')}>
                        {m.isTrainingSource ? (
                          <span className="adm-yes">
                            <span aria-hidden="true">✓ </span>
                            {t('admin.markets.trainingYes')}
                          </span>
                        ) : (
                          <span className="adm-muted">
                            <span aria-hidden="true">— </span>
                            {t('admin.markets.trainingNo')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <AdminPagination {...pager} />
          </div>
        )}
      </section>
    </>
  );
}
