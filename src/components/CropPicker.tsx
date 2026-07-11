// =============================================================================
// CropPicker (FE-3, ClickUp 86cacw5wy). Searchable, illustrated crop grid.
//   - Search across EN/SI/TA names; result count announced politely (aria-live).
//   - Category grouping when category data exists; single "All crops" group else.
//   - Cards are aria-pressed toggle buttons (>=48px), keyboard-navigable, with a
//     clear selected state (never color-alone — a check badge + label back it up).
//   - Four async states: loading skeleton, success, empty-search, error+retry.
// Presentation only — all matching/grouping logic lives in lib/crops.ts.
// =============================================================================
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Crop } from '../api/types';
import { CropArt } from './cropArt';
import {
  categoryLabelKey,
  cropDisplayName,
  filterCrops,
  groupCropsByCategory,
} from '../lib/crops';

export interface CropPickerProps {
  crops: Crop[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (crop: Crop) => void;
}

const SKELETON_COUNT = 8;

export default function CropPicker({
  crops,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
}: CropPickerProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [query, setQuery] = useState('');
  const searchId = useId();

  const filtered = useMemo(() => filterCrops(crops, query), [crops, query]);
  const groups = useMemo(() => groupCropsByCategory(filtered), [filtered]);

  // ---- error ----------------------------------------------------------------
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

  // ---- loading skeleton -----------------------------------------------------
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
        groups.map((group) => {
          const groupLabel = t(categoryLabelKey(group.code), {
            defaultValue: group.name ?? t('crop.catAll'),
          });
          return (
          <section key={group.code ?? 'all'} className="cp-group" aria-label={groupLabel}>
            {showGroupHeadings && <h3 className="cp-group__title">{groupLabel}</h3>}
            <ul className="cp-grid">
              {group.crops.map((crop) => {
                const selected = crop.id === selectedId;
                return (
                  <li key={crop.id}>
                    <button
                      type="button"
                      className={`cp-card${selected ? ' is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => onSelect(crop)}
                    >
                      <span className="cp-card__art">
                        <CropArt crop={crop} />
                      </span>
                      <span className="cp-card__label">{cropDisplayName(crop, lang)}</span>
                      {selected && (
                        <span className="cp-card__check" aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m5 13 4 4L19 7" />
                          </svg>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          );
        })
      )}
    </div>
  );
}
