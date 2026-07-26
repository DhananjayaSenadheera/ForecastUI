// Shared admin primitives. Imported only by lazy admin pages, so this ships in the
// admin chunk and never in the farmer first-load bundle.
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { apiMode } from '../api/client';
import './admin.css';

// TablePagination is app-wide now; re-exported here so admin pages keep their existing
// imports.
export {
  default as AdminPagination,
  usePagination,
  useServerPagination,
  PAGE_SIZES,
} from '../components/TablePagination';

/** Page header: title + optional subtitle, with an optional ⓘ hint beside the title. */
export function AdminTopbar({ title, subtitle, hint, hintId }: { title: string; subtitle?: string; hint?: string; hintId?: string }) {
  return (
    <div className="topbar adm-topbar">
      <div>
        <div className="adm-title-row">
          <h1 className="topbar__title">{title}</h1>
          {hint && hintId && <AdminHint hint={hint} id={hintId} />}
        </div>
        {subtitle && <p className="adm-sub">{subtitle}</p>}
      </div>
    </div>
  );
}

/** ⓘ explainer. On desktop the text is a hover/focus tooltip attached with
 *  aria-describedby — it lives OUTSIDE the button so it never joins the accessible
 *  name. Touch has no hover, so tapping toggles the same text as an inline note.
 *  aria-controls is only set while that note exists (a dangling idref is invalid).
 *  Place AdminHint in the `.adm-title-row`, never inside the heading element, because
 *  heading content becomes the heading's accessible name. */
export function AdminHint({ hint, id }: { hint: string; id: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tipId = `${id}-tip`;
  return (
    <>
      <span className="adm-hint-wrap">
        <button
          type="button"
          className="adm-hint-btn"
          aria-label={t('admin.hintLabel')}
          aria-describedby={tipId}
          aria-expanded={open}
          {...(open ? { 'aria-controls': id } : {})}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">ⓘ</span>
        </button>
        <span role="tooltip" id={tipId} className="adm-hint-tip">
          {hint}
        </span>
      </span>
      {open && (
        <p className="adm-note adm-hint-note" role="note" id={id}>
          {hint}
        </p>
      )}
    </>
  );
}

/** "This is demo data" note — fixtures mode only, so seeded rows are never mistaken
 *  for the live registry. */
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

/** Dismissible amber banner for a trainingDataWarning returned by a SUCCESSFUL
 *  mutation. It is information, never an error: role="status", amber, not red. */
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

/** Sortable table header cell (button inside th + aria-sort). */
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

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible modal dialog shell (users/festivals/news CRUD + the ingestion controls).
 *  aria-modal only PROMISES modality — the keyboard has to deliver it, so this shell
 *  also: closes on Escape, keeps Tab inside the dialog, moves focus in on open, and
 *  returns focus to the element that opened it. `describedBy` points at body copy the
 *  reader must hear with the title (a confirmation's consequences). */
export function AdminDialog({
  title,
  onClose,
  describedBy,
  children,
}: {
  title: string;
  onClose: () => void;
  describedBy?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  // Captured on mount so focus can go back where it came from on close.
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    // Focus the first control (a confirm dialog's Cancel), else the panel itself, so a
    // screen reader lands inside the dialog instead of behind it.
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    return () => {
      // Only restore if focus is still ours to move (never yank it from a new dialog).
      const active = document.activeElement;
      if (!active || active === document.body || panel.current?.contains(active)) {
        opener.current?.focus?.();
      }
    };
  }, []);

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // preventDefault too: Escape has native meanings (cancelling an open <select>
      // popup, reverting an input) that must not also fire as the dialog closes.
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) {
      e.preventDefault(); // nothing to move to — Tab must not escape the dialog
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    // Wrap at both ends; also pull focus back in if it somehow sits outside.
    if (e.shiftKey && (active === first || !panel.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="adm-dialog__backdrop" onClick={onClose}>
      <div
        className="adm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        ref={panel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
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
