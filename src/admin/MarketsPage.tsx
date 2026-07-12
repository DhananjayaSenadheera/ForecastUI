// ADM-3 — Markets registry VIEW page (/admin/markets). FIXTURE-ONLY today: no live
// GET route yet (API gap #1, backlogged as API-1). The client method (getAdminMarkets)
// is stubbed so live mode flips on later with no page change — same pattern the farmer
// Prices page uses for fixture-only endpoints.
//
// Fixtures mirror the REAL 12 seeded markets (verified against the .NET DbContext).
// Type is a badge; Economic centre is ✓/— (icon + accessible text, never colour-only).
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Market } from '../api/types';
import { mapMarketType } from '../lib/format';
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

export default function MarketsPage() {
  const { t } = useTranslation();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pager = usePagination(markets);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setMarkets(await api.getAdminMarkets());
    } catch {
      // Any failure (incl. a 501 while the markets API is unbuilt) surfaces as the
      // error state with retry — the page never white-screens; live wiring lands
      // with the markets API (API-1).
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
        <DemoNote hasLiveEndpoint={false} />
        <p className="adm-note" role="note">
          <span aria-hidden="true">ℹ️ </span>
          {t('admin.markets.liveNote')}
        </p>

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
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((m) => {
                  const type = mapMarketType(m.marketType);
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
