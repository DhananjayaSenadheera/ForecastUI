// Shared admin-console primitives (ADM-1..7). Imported ONLY by lazy admin pages,
// so this ships in the admin async chunk — never the farmer first-load bundle.
// Keeps every admin page's four async states + the "demo data" honesty note + the
// sortable header idiom consistent (mirrors the farmer pages' BestCrops/Prices).
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { apiMode } from '../api/client';
import './admin.css';

// Table pagination is app-wide (owner 2026-07-13: "all the tables, not only the
// admin") — the implementation lives in components/TablePagination; re-exported
// here so admin pages keep their existing imports.
export {
  default as AdminPagination,
  usePagination,
  PAGE_SIZES,
} from '../components/TablePagination';

/** Page header: title + optional subtitle (mirrors the farmer `.topbar`). */
export function AdminTopbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="topbar adm-topbar">
      <div>
        <h1 className="topbar__title">{title}</h1>
        {subtitle && <p className="adm-sub">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Honest "this is demo data" note — shown in FIXTURES mode only. Every admin page
 *  renders it so nobody mistakes seeded fixtures for the live registry. `live` prop
 *  lets a page say whether a live endpoint exists yet. */
export function DemoNote({ hasLiveEndpoint = true }: { hasLiveEndpoint?: boolean }) {
  const { t } = useTranslation();
  if (apiMode !== 'fixtures') return null;
  return (
    <p className="adm-demonote" role="note">
      <span aria-hidden="true">🧪 </span>
      {t(hasLiveEndpoint ? 'admin.demoNote' : 'admin.demoNoteNoApi')}
    </p>
  );
}

/** Dismissible AMBER training-data warning banner (ADM-2/ADM-5). Rendered when a
 *  SUCCESSFUL mutation returns a non-null trainingDataWarning — the affected row is
 *  as-of-joined into the model's training data, so a past-dated edit/delete may need a
 *  retrain. It is honest info, NEVER an error: role="status" (not alert), and the amber
 *  `.adm-warn--dismiss` styling is shared, not red. Title + body are page-supplied so
 *  PolicyFlags and Festivals reuse identical markup with their own wording. */
export function TrainingWarningBanner({
  title,
  body,
  onDismiss,
}: {
  title: string;
  body: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="adm-warn adm-warn--dismiss" role="status" aria-live="polite">
      <span className="adm-warn__body">
        <span className="adm-warn__title">
          <span aria-hidden="true">⚠️ </span>
          {title}
        </span>{' '}
        {body}
      </span>
      <button
        type="button"
        className="adm-warn__close"
        onClick={onDismiss}
        aria-label={t('common.dismiss')}
      >
        ✕
      </button>
    </div>
  );
}

/** Loading skeleton — N shimmer rows. */
export function AdminLoading({ rows = 6 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div className="adm-skeleton" aria-busy="true">
      <p className="sr-only">{t('common.loading')}</p>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="adm-skel-row" aria-hidden="true" />
      ))}
    </div>
  );
}

/** Error state with a retry action. */
export function AdminError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="adm-state" role="alert">
      <p className="adm-state__title">{t('common.errorTitle')}</p>
      <p className="adm-state__body">{t('common.errorBody')}</p>
      <button type="button" className="btn-ghost adm-state__retry" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </div>
  );
}

/** Empty state (no rows). */
export function AdminEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="adm-state">
      <p className="adm-state__title">{title}</p>
      <p className="adm-state__body">{body}</p>
    </div>
  );
}

/** A muted raw fallback label for an unknown enum int (never crashes the table). */
export function EnumBadge({
  labelKey,
  fallback,
  glyph,
  className,
}: {
  labelKey: string | null;
  fallback: string;
  glyph?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const known = labelKey !== null;
  return (
    <span className={`adm-badge${known ? '' : ' is-unknown'}${className ? ` ${className}` : ''}`}>
      {glyph && (
        <span className="adm-badge__glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      <span>{known ? t(labelKey) : fallback}</span>
    </span>
  );
}

/** Sortable table header cell (button-in-th + aria-sort) — same idiom as the
 *  farmer BestCrops/Prices tables. */
export function SortableTh<K extends string>({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
  numeric,
}: {
  col: K;
  label: string;
  sortKey: K;
  sortDir: 'asc' | 'desc';
  onSort: (k: K) => void;
  numeric?: boolean;
}) {
  const { t } = useTranslation();
  const active = col === sortKey;
  const ariaSort: 'ascending' | 'descending' | 'none' = active
    ? sortDir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className={numeric ? 'adm-th--num' : undefined}>
      <button
        type="button"
        className={`adm-sort${active ? ' is-active' : ''}`}
        onClick={() => onSort(col)}
        aria-label={t('admin.sortBy', { col: label })}
      >
        <span>{label}</span>
        <span className="adm-sort__caret" aria-hidden="true">
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

/** Simple accessible modal dialog shell (used by users/festivals/news demo CRUD). */
export function AdminDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="adm-dialog__backdrop" onClick={onClose}>
      <div
        className="adm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adm-dialog__head">
          <h2 className="adm-dialog__title">{title}</h2>
          <button
            type="button"
            className="adm-dialog__close"
            onClick={onClose}
            aria-label={t('common.dismiss')}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
