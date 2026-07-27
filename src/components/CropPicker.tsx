// CropPicker — searchable, illustrated crop grid. Search matches EN/SI/TA names and the
// result count is announced politely; crops group by category when the data has one, else
// a single "All crops" group. Cards are aria-pressed toggle buttons (>=48px) whose selected
// state is never colour alone. Four async states: loading, success, empty search, error +
// retry. Matching and grouping logic lives in lib/crops.ts.
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Crop } from '../api/types';
import { CropArt } from './cropArt';
import ReadinessBadge from './ReadinessBadge';
import {
  categoryLabelKey,
  cropDisplayName,
  filterCrops,
  groupCropsByCategory,
} from '../lib/crops';
import { readinessFor, readinessLabelKey, type ReadinessMap } from '../lib/readiness';

export interface CropPickerProps {
  crops: Crop[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selectedId: string | null;
  /** MULTI-SELECT mode (portfolio settings). When provided it REPLACES `selectedId` as the
   *  source of selection, and `onSelect` becomes a toggle — the cards are already
   *  aria-pressed toggle buttons, so the only thing that changes is which ids read as
   *  pressed. Absent = the original single-select behaviour, unchanged. */
  selectedIds?: string[];
  onSelect: (crop: Crop) => void;
  /** Recently-picked crop ids (FE-16). Pinned in a "Recent" group when not searching. */
  recentIds?: string[];
  /** Crop-status colouring (2026-07-22): per-crop forecast readiness. null/absent
   *  = readiness unknown (fetch failed or model inactive) -> cards stay untinted. */
  readiness?: ReadinessMap | null;
}

const SKELETON_COUNT = 8;

export default function CropPicker({
  crops,
  loading,
  error,
  onRetry,
  selectedId,
  selectedIds,
  onSelect,
  recentIds,
  readiness = null,
}: CropPickerProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [query, setQuery] = useState('');
  const searchId = useId();

  const filtered = useMemo(() => filterCrops(crops, query), [crops, query]);
  const groups = useMemo(() => groupCropsByCategory(filtered), [filtered]);

  // "Recent" group: resolve remembered ids to crops still in the list (order kept).
  // Shown ONLY when not searching, and crops keep their place in the category groups.
  const recentCrops = useMemo(() => {
    if (!recentIds || recentIds.length === 0) return [];
    const byId = new Map(crops.map((c) => [c.id, c]));
    return recentIds.map((id) => byId.get(id)).filter((c): c is Crop => Boolean(c));
  }, [recentIds, crops]);

  // One card renderer shared by the Recent group and the category groups. `idPrefix` keeps
  // the readiness-description ids unique when the SAME crop renders twice.
  const renderCard = (crop: Crop, idPrefix: string) => {
    const selected = selectedIds ? selectedIds.includes(crop.id) : crop.id === selectedId;
    // Crop-status colouring: tint + glyph/word badge; a null status makes no claim. The
    // badge is aria-hidden and the status is the button's DESCRIPTION (aria-describedby ->
    // sr-only sibling) so it never joins the accessible NAME.
    const status = readinessFor(readiness, crop.id);
    const descId = status ? `${idPrefix}-rdy-${crop.id}` : undefined;
    return (
      <li key={crop.id}>
        <button
          type="button"
          className={`cp-card${selected ? ' is-selected' : ''}${status ? ` cp-card--${status}` : ''}`}
          aria-pressed={selected}
          {...(descId ? { 'aria-describedby': descId } : {})}
          onClick={() => onSelect(crop)}
        >
          <span className="cp-card__art">
            <CropArt crop={crop} />
          </span>
          <span className="cp-card__label">{cropDisplayName(crop, lang)}</span>
          <ReadinessBadge status={status} ariaHidden />
          {selected && (
            <span className="cp-card__check" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 13 4 4L19 7" />
              </svg>
            </span>
          )}
        </button>
        {descId && status && (
          <span id={descId} className="sr-only">
            {t(readinessLabelKey(status))}
          </span>
        )}
      </li>
    );
  };

  // Error state.
  if (error) {
    return (
      <div className="cp-state" role="alert">
        <p className="cp-state__title">{t('common.errorTitle')}</p>
        <p className="cp-state__body">{t('common.errorBody')}</p>
        <button type="button" className="btn-ghost cp-state__retry" onClick={onRetry}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  // Loading skeleton.
  if (loading) {
    return (
      <div className="cp" aria-busy="true">
        <div className="cp-search cp-search--skeleton" aria-hidden="true" />
        <p className="sr-only">{t('common.loading')}</p>
        <ul className="cp-grid" aria-hidden="true">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <li key={i} className="cp-card cp-card--skeleton">
              <span className="cp-skel-art" />
              <span className="cp-skel-line" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const showGroupHeadings = groups.length > 1;
  const showRecent = query.trim() === '' && recentCrops.length > 0;

  return (
    <div className="cp">
      <div className="cp-search">
        <label className="wrap-label" htmlFor={searchId}>
          {t('crop.searchLabel')}
        </label>
        <div className="cp-search__box">
          <span className="cp-search__icon" aria-hidden="true">
            {/* magnifier */}
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
          </span>
          <input
            id={searchId}
            type="search"
            className="cp-search__input"
            placeholder={t('crop.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        {/* Result count announced politely for screen-reader users. */}
        <p className="cp-count" role="status" aria-live="polite">
          {t('crop.resultCount', { count: filtered.length })}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="cp-state">
          <p className="cp-state__title">{t('crop.emptyTitle')}</p>
          <p className="cp-state__body">{t('crop.emptyBody', { query: query.trim() })}</p>
        </div>
      ) : (
        <>
          {showRecent && (
            <section className="cp-group cp-group--recent" aria-label={t('crop.recent')}>
              <h3 className="cp-group__title">
                <span aria-hidden="true">🕘 </span>
                {t('crop.recent')}
              </h3>
              <ul className="cp-grid">{recentCrops.map((c) => renderCard(c, 'recent'))}</ul>
            </section>
          )}
          {groups.map((group) => {
            const groupLabel = t(categoryLabelKey(group.code), {
              defaultValue: group.name ?? t('crop.catAll'),
            });
            return (
              <section key={group.code ?? 'all'} className="cp-group" aria-label={groupLabel}>
                {showGroupHeadings && <h3 className="cp-group__title">{groupLabel}</h3>}
                <ul className="cp-grid">{group.crops.map((c) => renderCard(c, group.code ?? 'all'))}</ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
