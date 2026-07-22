// =============================================================================
// BestCropsPage (FE-7, ClickUp 86canmejh). "What should I plant?" — a ranked
// decision view over GET /api/forecast/best-crops.
//
// A real, semantic <table> (headers + scope) that becomes a card list under 600px
// via CSS (same data, no horizontal scroll). Each row surfaces uncertainty
// HONESTLY: verdict badge (icon+label+semantic colour; RED only for Not
// recommended), trend as an arrow GLYPH + text (never colour alone), confidence
// as pictograph dots + word, the expected price, and a SHARED-SCALE bar so crops
// are comparable at a glance (the endpoint gives only averagePrice — no fabricated
// band). "Not recommended" and "Little data" rows stay VISIBLE with a plain
// caveat. A Yala/Maha season badge renders only when the API exposes it (API-3);
// live omission degrades silently. Each row links into the FE-4 My-Harvest flow.
// Sort/scale/trend/caveat logic lives in lib/bestcrops — tested.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { BestCrop } from '../api/types';
import { formatPrice, mapConfidenceCode, mapVerdict } from '../lib/format';
import { CropArt } from '../components/cropArt';
import ReadinessBadge from '../components/ReadinessBadge';
import { buildReadinessMap, readinessFor, type ReadinessMap } from '../lib/readiness';
import TablePagination, { usePagination } from '../components/TablePagination';
import {
  ariaSortFor,
  bestCropCaveatKey,
  buildSharedScale,
  isLowConfidenceRow,
  sortBestCrops,
  trendMeta,
  type BestCropSortKey,
  type SortDir,
} from '../lib/bestcrops';

const LOOKBACKS = [3, 6, 12] as const;
const CONF_DOTS = 4; // pictograph is 4 dots; Good fills 3, Fair 2, Low 1
const SKELETON_ROWS = 5;

/** Verdict glyph — paired with the text label so colour is never the sole signal. */
const VERDICT_GLYPH: Record<string, string> = {
  good: '✓',
  neutral: '•',
  warn: '⚠',
  critical: '✕',
};

export default function BestCropsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const rs = t('common.rs');

  const [lookback, setLookback] = useState<number>(3);
  const [crops, setCrops] = useState<BestCrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sortKey, setSortKey] = useState<BestCropSortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = useCallback(async (months: number) => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.getBestCrops(months);
      setCrops(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(lookback);
  }, [load, lookback]);

  // Crop-status colouring (2026-07-22): a readiness badge beside each crop name,
  // consistent with the picker/chips language. Fail-soft: null map -> no badges.
  const [readiness, setReadiness] = useState<ReadinessMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .getCropReadiness()
      .then((r) => {
        if (!cancelled) setReadiness(buildReadinessMap(r));
      })
      .catch(() => {
        /* readiness unknown -> no badges */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Shared axis is built from the FULL list so the scale is stable across sorts.
  const scale = useMemo(() => buildSharedScale(crops), [crops]);
  const pctById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of scale.rows) m.set(r.cropId, r.pct);
    return m;
  }, [scale]);

  const sorted = useMemo(() => sortBestCrops(crops, sortKey, sortDir), [crops, sortKey, sortDir]);
  const pager = usePagination(sorted);

  const onSort = useCallback(
    (key: BestCropSortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    },
    [sortKey],
  );

  const axisMaxStr = formatPrice(scale.axisMax, lang, rs);

  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.bestCrops.title')}</h1>
        <span className="topbar__updated">
          <span className="prov">{t('common.source')}</span>
        </span>
      </div>

      <section className="panel bc" aria-label={t('pages.bestCrops.title')}>
        <p className="bc-sub">{t('pages.bestCrops.subtitle')}</p>

        {/* Lookback segmented control — refetch on change. */}
        <div className="bc-lookback" role="group" aria-label={t('pages.bestCrops.lookbackLabel')}>
          <span className="bc-lookback__label">{t('pages.bestCrops.lookbackLabel')}</span>
          <div className="bc-seg">
            {LOOKBACKS.map((m) => (
              <button
                key={m}
                type="button"
                className={`bc-seg__btn${lookback === m ? ' is-active' : ''}`}
                aria-pressed={lookback === m}
                onClick={() => setLookback(m)}
              >
                {t(`pages.bestCrops.lookback${m}`)}
              </button>
            ))}
          </div>
        </div>
        <p className="bc-caption">{t('pages.bestCrops.lookbackCaption', { count: lookback })}</p>

        {/* Entry to the crop-vs-crop comparison (non-tab child route). */}
        <Link className="bc-compare" to="/best-crops/compare">
          <span aria-hidden="true">⚖ </span>
          {t('pages.compare.entry')}
          <span aria-hidden="true"> →</span>
        </Link>

        {/* ---- error ---- */}
        {error ? (
          <div className="bc-state" role="alert">
            <p className="bc-state__title">{t('common.errorTitle')}</p>
            <p className="bc-state__body">{t('common.errorBody')}</p>
            <button type="button" className="btn-ghost bc-state__retry" onClick={() => void load(lookback)}>
              {t('common.retry')}
            </button>
          </div>
        ) : loading ? (
          /* ---- loading skeleton ---- */
          <div className="bc-skeleton" aria-busy="true">
            <p className="sr-only">{t('common.loading')}</p>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <div key={i} className="bc-skel-row" aria-hidden="true">
                <span className="bc-skel bc-skel--art" />
                <span className="bc-skel bc-skel--bar" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          /* ---- empty ---- */
          <div className="bc-state">
            <p className="bc-state__title">{t('pages.bestCrops.emptyTitle')}</p>
            <p className="bc-state__body">{t('pages.bestCrops.emptyBody')}</p>
          </div>
        ) : (
          /* ---- success ---- */
          <>
            <p className="bc-legend">{t('pages.bestCrops.scaleLegend', { max: axisMaxStr })}</p>
            <div className="bc-tablewrap">
              <table className="bc-table">
                <caption className="sr-only">{t('pages.bestCrops.tableCaption', { count: lookback })}</caption>
                <thead>
                  <tr>
                    <SortableTh col="rank" label={t('pages.bestCrops.colCrop')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} t={t} />
                    <th scope="col">{t('pages.bestCrops.colTake')}</th>
                    <SortableTh col="price" label={t('pages.bestCrops.colPrice')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} t={t} numeric />
                    <th scope="col">{t('pages.bestCrops.colTrend')}</th>
                    <SortableTh col="confidence" label={t('pages.bestCrops.colConfidence')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} t={t} />
                    <th scope="col">
                      <span className="sr-only">{t('pages.bestCrops.colAction')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pager.pageRows.map((c) => {
                    // best-crops payload carries no localized names (API gap #3),
                    // so the English cropName is shown — honest graceful fallback.
                    const name = c.cropName;
                    const verdict = mapVerdict(c.recommendationLevel);
                    const conf = mapConfidenceCode(c.confidence);
                    const trend = trendMeta(c.trend);
                    const caveatKey = bestCropCaveatKey(c);
                    const lowConf = isLowConfidenceRow(c);
                    const isNotRec = verdict.tone === 'critical';
                    const pct = pctById.get(c.cropId) ?? 0;
                    const priceStr = formatPrice(c.averagePrice, lang, rs);
                    const rowClass = [
                      'bc-row',
                      isNotRec ? 'is-notrec' : '',
                      lowConf ? 'is-lowconf' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <tr key={c.cropId} className={rowClass}>
                        <th scope="row" className="bc-c-crop" data-label={t('pages.bestCrops.colCrop')}>
                          <span className="bc-crop">
                            <span className="bc-crop__art">
                              <CropArt crop={{ name: c.cropName, cropCode: c.cropCode }} />
                            </span>
                            <span className="bc-crop__text">
                              <span className="bc-crop__name">{name}</span>
                              <span className="bc-crop__code">{c.cropCode}</span>
                              {/* aria-hidden: inside the row-header th the word would
                                  join every row's accessible name; the SR-facing
                                  quality signal on this table is the Confidence column. */}
                              <ReadinessBadge status={readinessFor(readiness, c.cropId)} ariaHidden />
                            </span>
                          </span>
                        </th>

                        <td className="bc-c-take" data-label={t('pages.bestCrops.colTake')}>
                          <span className={`bc-badge bc-badge--${verdict.tone}`}>
                            <span className="bc-badge__glyph" aria-hidden="true">{VERDICT_GLYPH[verdict.tone]}</span>
                            <span className="bc-badge__label">{t(verdict.labelKey)}</span>
                          </span>
                          {c.seasonFit && (
                            <span className={`bc-season${c.seasonFit.inSeason ? ' is-in' : ''}`}>
                              <span aria-hidden="true">🗓 </span>
                              {t(c.seasonFit.inSeason ? 'pages.bestCrops.inSeason' : 'pages.bestCrops.offSeason', { season: c.seasonFit.season })}
                            </span>
                          )}
                          {caveatKey && <span className="bc-caveat">{t(caveatKey)}</span>}
                        </td>

                        <td className="bc-c-price" data-label={t('pages.bestCrops.colPrice')}>
                          <span className="bc-price">
                            <span className="bc-price__num">{priceStr}</span>
                            <span className="bc-price__unit">{t('common.perKg')}</span>
                          </span>
                          <span
                            className={`bc-scale${lowConf ? ' is-low' : ''}`}
                            role="img"
                            aria-label={t('pages.bestCrops.scaleAria', { price: priceStr, max: axisMaxStr })}
                          >
                            <span className="bc-scale__track" aria-hidden="true" />
                            <span className="bc-scale__bar" style={{ width: `${pct}%` }} aria-hidden="true" />
                            <span className="bc-scale__marker" style={{ left: `${pct}%` }} aria-hidden="true" />
                          </span>
                        </td>

                        <td className="bc-c-trend" data-label={t('pages.bestCrops.colTrend')}>
                          <span className={`bc-trend bc-trend--${trend.tone}`}>
                            <span className="bc-trend__arrow" aria-hidden="true">{trend.arrow}</span>
                            <span className="bc-trend__label">{t(trend.labelKey)}</span>
                          </span>
                        </td>

                        <td className="bc-c-conf" data-label={t('pages.bestCrops.colConfidence')}>
                          <span className="bc-conf">
                            <span className="bc-dots" aria-hidden="true">
                              {Array.from({ length: CONF_DOTS }).map((_, i) => (
                                <span key={i} className={`bc-dot${i < conf.dots ? ' is-on' : ''}`} />
                              ))}
                            </span>
                            <span className="bc-conf__word">{t(conf.labelKey)}</span>
                          </span>
                        </td>

                        <td className="bc-c-action" data-label={t('pages.bestCrops.colAction')}>
                          <Link
                            className="bc-action"
                            to={`/my-harvest?crop=${encodeURIComponent(c.cropId)}`}
                            aria-label={t('pages.bestCrops.actionAria', { crop: name })}
                          >
                            {t('pages.bestCrops.action')}
                            <span aria-hidden="true"> →</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <TablePagination {...pager} />
            </div>
          </>
        )}
      </section>
    </>
  );
}

// ---- sortable column header (button-in-th + aria-sort) ----------------------
interface SortableThProps {
  col: BestCropSortKey;
  label: string;
  sortKey: BestCropSortKey;
  sortDir: SortDir;
  onSort: (key: BestCropSortKey) => void;
  t: (k: string, o?: Record<string, unknown>) => string;
  numeric?: boolean;
}
function SortableTh({ col, label, sortKey, sortDir, onSort, t, numeric }: SortableThProps) {
  const state = ariaSortFor(col, sortKey, sortDir);
  const active = col === sortKey;
  return (
    <th scope="col" aria-sort={state} className={numeric ? 'bc-th--num' : undefined}>
      <button
        type="button"
        className={`bc-sort${active ? ' is-active' : ''}`}
        onClick={() => onSort(col)}
        aria-label={t('pages.bestCrops.sortBy', { col: label })}
      >
        <span className="bc-sort__label">{label}</span>
        <span className="bc-sort__caret" aria-hidden="true">
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
