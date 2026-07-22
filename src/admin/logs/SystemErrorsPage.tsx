// LOGS Phase 3 — System errors (/admin/logs/errors). READ-ONLY admin observability
// over UNHANDLED server exceptions (500s). A SERVER-PAGED table (desktop) / stacked
// cards (<600px) mirroring the sibling tabs' four async states (loading skeleton /
// error + retry / empty / data) and their per-row expansion idiom.
//
// HONEST DISPLAY: each row is ONE unexpected server error. The empty state is a GOOD
// state (no unhandled errors) and is phrased positively — never dressed as a failure.
// The exceptionType keeps its full value in a title while the namespace prefix is
// de-emphasised so the class name reads first. The message is truncated in the table
// with the full text (+ stack trace + full traceId) behind a "Show details" drill-down;
// a null stackTrace shows a quiet "No stack trace" note rather than an empty box.
//
// AUTH: the route sits behind an Admin JWT; a 401/403 flows through the existing global
// client interceptor (silent renew → /login), so there is ZERO new auth code here.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { SystemError, SystemErrorPage } from '../../api/types';
import { formatDateTime, splitExceptionType, truncateId } from '../../lib/format';
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPagination,
  DemoNote,
  useServerPagination,
} from '../adminShared';

const ERRORS_PAGE_SIZE = 25;

export default function SystemErrorsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [data, setData] = useState<SystemErrorPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pager = useServerPagination(data?.total ?? 0, ERRORS_PAGE_SIZE);
  const { page, perPage, totalPages, setPage, setPerPage } = pager;
  const req = useRef(0); // stale-response guard for overlapping page loads

  const load = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    setError(false);
    try {
      const res = await api.getSystemErrors(page, perPage);
      if (id !== req.current) return; // a newer load superseded this one
      setData(res);
    } catch {
      if (id !== req.current) return;
      setError(true);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [page, perPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];

  return (
    <section className="panel adm" aria-label={t('admin.logs.errors.title')}>
      <DemoNote />

      {error && !data ? (
        <AdminError onRetry={() => void load()} />
      ) : loading && !data ? (
        <AdminLoading />
      ) : data && items.length === 0 ? (
        <AdminEmpty
          title={t('admin.logs.errors.emptyTitle')}
          body={t('admin.logs.errors.emptyBody')}
        />
      ) : data ? (
        <>
          {error && (
            <p className="adm-note adm-note--error" role="alert">
              {t('common.errorBody')}
            </p>
          )}
          <div className="adm-tablewrap">
            <table className="ing-table">
              <caption className="sr-only">{t('admin.logs.errors.title')}</caption>
              <thead>
                <tr>
                  <th scope="col" className="ing-th-toggle">
                    <span className="sr-only">{t('admin.logs.errors.expand')}</span>
                  </th>
                  <th scope="col">{t('admin.logs.errors.colWhen')}</th>
                  <th scope="col">{t('admin.logs.errors.colType')}</th>
                  <th scope="col">{t('admin.logs.errors.colMessage')}</th>
                  <th scope="col">{t('admin.logs.errors.colWhere')}</th>
                  <th scope="col">{t('admin.logs.errors.colTrace')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((err) => (
                  <ErrorRow key={err.id} err={err} lang={lang} />
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={page}
            totalPages={totalPages}
            perPage={perPage}
            total={data.total}
            setPage={setPage}
            setPerPage={setPerPage}
          />
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// One error row (+ its expandable full-message / stack-trace detail row).
// ---------------------------------------------------------------------------
function ErrorRow({ err, lang }: { err: SystemError; lang: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const na = t('admin.logs.errors.notApplicable');
  const { namespace, name } = splitExceptionType(err.exceptionType);
  const detailId = `err-detail-${err.id}`;

  return (
    <>
      <tr className="ing-row">
        <td className="ing-td-toggle" data-label="">
          <button
            type="button"
            className="ing-toggle"
            aria-expanded={open}
            {...(open ? { 'aria-controls': detailId } : {})}
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
            <span className="sr-only">
              {open ? t('admin.logs.errors.collapse') : t('admin.logs.errors.expand')}
            </span>
          </button>
        </td>
        <td data-label={t('admin.logs.errors.colWhen')}>{formatDateTime(err.occurredUtc, lang)}</td>
        <td data-label={t('admin.logs.errors.colType')}>
          {/* Full type in the title; namespace muted so the class name reads first. */}
          <span className="err-type" title={err.exceptionType}>
            {namespace && <span className="err-type__ns">{namespace}</span>}
            <span className="err-type__name">{name}</span>
          </span>
        </td>
        <td data-label={t('admin.logs.errors.colMessage')}>
          {err.message ? (
            <span className="err-msg" title={err.message}>
              {err.message}
            </span>
          ) : (
            <span className="adm-muted">{na}</span>
          )}
        </td>
        <td data-label={t('admin.logs.errors.colWhere')}>
          <WhereCell method={err.method} path={err.path} na={na} />
        </td>
        <td data-label={t('admin.logs.errors.colTrace')}>
          {err.traceId ? (
            <span className="ua-id" title={err.traceId}>
              {truncateId(err.traceId)}
            </span>
          ) : (
            <span className="adm-muted">{na}</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="ing-detail" id={detailId}>
          <td colSpan={6}>
            <div className="ing-detailbody">
              <div>
                <p className="ing-checks__head">{t('admin.logs.errors.messageHeading')}</p>
                {err.message ? (
                  <p className="train-decision">{err.message}</p>
                ) : (
                  <p className="ing-checks__note adm-muted">{t('admin.logs.errors.noMessage')}</p>
                )}
              </div>
              {err.traceId && (
                <div>
                  <p className="ing-checks__head">{t('admin.logs.errors.traceHeading')}</p>
                  <p className="err-trace-id">{err.traceId}</p>
                </div>
              )}
              <div>
                <p className="ing-checks__head">{t('admin.logs.errors.sourceHeading')}</p>
                <p>{err.source}</p>
              </div>
              <div>
                <p className="ing-checks__head">{t('admin.logs.errors.stackHeading')}</p>
                {err.stackTrace ? (
                  <pre className="err-trace" tabIndex={0}>
                    {err.stackTrace}
                  </pre>
                ) : (
                  <p className="ing-checks__note adm-muted">{t('admin.logs.errors.noStack')}</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Where the error happened: "GET /api/…". Degrades to path-only or method-only or a
 *  muted dash when a piece is null (both fields are nullable on the wire). */
function WhereCell({
  method,
  path,
  na,
}: {
  method: string | null;
  path: string | null;
  na: string;
}) {
  if (!method && !path) return <span className="adm-muted">{na}</span>;
  return (
    <span className="err-where">
      {method && <span className="err-where__method">{method}</span>}
      {path && <span className="err-where__path">{path}</span>}
    </span>
  );
}
