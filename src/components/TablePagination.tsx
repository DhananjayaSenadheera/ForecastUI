// =============================================================================
// TablePagination — app-wide table pager (owner request 2026-07-13: "all the
// tables, not only the admin"). Promoted out of the admin chunk so farmer pages
// can use it too; adminShared re-exports it for the admin pages.
//   - 10/25/50 items per page (default 10), first/prev/next/last, "x of y".
//   - Hides itself entirely while the table fits in the smallest page size —
//     a pager on a 6-row table is noise.
//   - Trilingual: labels come from the root `pagination.*` i18n keys (si/ta
//     drafts pending FE-8 native review, like the rest of the app strings).
// =============================================================================
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../styles/pagination.css';

export const PAGE_SIZES = [10, 25, 50] as const;

/** Client-side pagination over an (already sorted/filtered) row array. `page` is
 *  1-based and self-clamps when the row count shrinks (e.g. a filter narrows). */
export function usePagination<T>(rows: T[], defaultPerPage: number = PAGE_SIZES[0]) {
  const [rawPage, setPage] = useState(1);
  const [perPage, setPerPageState] = useState<number>(defaultPerPage);
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const page = Math.min(rawPage, totalPages);
  const pageRows = useMemo(
    () => rows.slice((page - 1) * perPage, page * perPage),
    [rows, page, perPage],
  );
  const setPerPage = (n: number) => {
    setPerPageState(n);
    setPage(1);
  };
  return { pageRows, page, totalPages, perPage, total: rows.length, setPage, setPerPage };
}

/**
 * Server-paged sibling of usePagination. The SERVER slices the rows; we only track
 * the page/perPage cursor and derive totalPages from the server-reported `total`. The
 * page NEVER client-slices — it re-fetches on page/perPage change. Changing the page
 * size returns to page 1 (a size change invalidates the old page cursor). Feed the
 * returned shape straight into <TablePagination/>. `total` self-updates each fetch.
 */
export function useServerPagination(total: number, defaultPerPage: number = PAGE_SIZES[1]) {
  const [rawPage, setPage] = useState(1);
  const [perPage, setPerPageState] = useState<number>(defaultPerPage);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  // Self-clamp when `total` shrinks (e.g. a Refresh returns fewer rows) so a stale
  // page-3 cursor over a now-1-page set resolves to page 1, never an empty "3 of 1".
  // Mirrors the client usePagination clamp; callers read the clamped `page`.
  const page = Math.min(rawPage, totalPages);
  const setPerPage = (n: number) => {
    setPerPageState(n);
    setPage(1);
  };
  return { page, perPage, totalPages, total, setPage, setPerPage };
}

export default function TablePagination({
  page,
  totalPages,
  perPage,
  total,
  setPage,
  setPerPage,
}: {
  page: number;
  totalPages: number;
  perPage: number;
  total: number;
  setPage: (p: number) => void;
  setPerPage: (n: number) => void;
}) {
  const { t } = useTranslation();
  if (total <= PAGE_SIZES[0]) return null;
  const btn = (label: string, target: number, disabled: boolean, glyph: string) => (
    <button
      type="button"
      className="tpg-btn"
      onClick={() => setPage(target)}
      disabled={disabled}
      aria-label={label}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
  return (
    <nav className="tpg" aria-label={t('pagination.label')}>
      <label className="tpg__size">
        <span>{t('pagination.itemsPerPage')}</span>
        <select
          className="tpg__select"
          value={perPage}
          onChange={(e) => setPerPage(Number(e.target.value))}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="tpg__nav">
        {btn(t('pagination.first'), 1, page <= 1, '⇤')}
        {btn(t('pagination.prev'), page - 1, page <= 1, '‹')}
        <span className="tpg__count" aria-live="polite">
          {t('pagination.pageOf', { page, total: totalPages })}
        </span>
        {btn(t('pagination.next'), page + 1, page >= totalPages, '›')}
        {btn(t('pagination.last'), totalPages, page >= totalPages, '⇥')}
      </div>
    </nav>
  );
}
