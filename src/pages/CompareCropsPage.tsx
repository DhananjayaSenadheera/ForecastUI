// =============================================================================
// CompareCropsPage (FE-14, ClickUp 86canmejq). Overlay 2–3 crops' 12-month price
// timelines on ONE shared y-scale + shared date axis so a farmer can weigh crops
// side by side before committing land.
//
// IA: the signed-off nav has exactly 4 tabs, so this is a NON-tab route
// (/best-crops/compare) reached from a "Compare crops" affordance on Best crops;
// the Best-crops NavLink stays highlighted (it is a child path). Deep-linkable via
// ?crops=id1,id2,id3.
//
// HONEST UNCERTAINTY vs CLUTTER: three full P10–P90 bands overlaid are unreadable,
// so each crop's band renders at LOW OPACITY in the crop's own colour + a caption
// stating bands are approximate ranges (chosen over a per-crop focus toggle, which
// would hide uncertainty behind a click — the opposite of surfacing it by default).
// Central lines: history solid, forecast dashed (same convention as TimelineChart).
// Colours: Okabe–Ito categorical set assigned by SELECTION ORDER (stable on-page).
// Direct labels at line ends (no legend). A <details> month×crop table is the
// mandatory text alternative. Per-crop fetches are fail-soft: one crop failing
// shows an inline retry note and never sinks the chart.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Crop, CropTimeline } from '../api/types';
import { cropDisplayName, parseCropIdList } from '../lib/crops';
import { formatDate, formatPrice, ymdLocal } from '../lib/format';
import { buildCompareGeometry, isShortHistory, type CompareSeriesInput } from '../lib/timeline';
import { marketColorVar } from '../lib/prices';
import { ChartTooltip, useChartTooltip, type TooltipPoint } from '../lib/chartTooltip';

const COMPARE_MAX = 3;
const VIEW_W = 680;
const VIEW_H = 300;

type TimelineState = { status: 'loading' | 'ok' | 'error'; timeline?: CropTimeline };

export default function CompareCropsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const rs = t('common.rs');
  const todayStr = useMemo(() => ymdLocal(new Date()), []);

  // ---- crop list (names + selection universe) ----
  const [crops, setCrops] = useState<Crop[]>([]);
  const [cropsLoading, setCropsLoading] = useState(true);
  const [cropsError, setCropsError] = useState(false);

  const loadCrops = useCallback(async () => {
    setCropsLoading(true);
    setCropsError(false);
    try {
      setCrops(await api.getCrops());
    } catch {
      setCropsError(true);
    } finally {
      setCropsLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadCrops();
  }, [loadCrops]);

  // ---- selection (source of truth = the ?crops= deep-link) ----
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedIds = useMemo(
    () => parseCropIdList(searchParams.get('crops'), COMPARE_MAX),
    [searchParams],
  );
  const [capNote, setCapNote] = useState(false);

  const toggleCrop = useCallback(
    (id: string) => {
      let next: string[];
      if (selectedIds.includes(id)) {
        next = selectedIds.filter((x) => x !== id);
      } else if (selectedIds.length >= COMPARE_MAX) {
        setCapNote(true);
        return;
      } else {
        next = [...selectedIds, id];
      }
      setCapNote(false);
      const sp = new URLSearchParams(searchParams);
      if (next.length) sp.set('crops', next.join(','));
      else sp.delete('crops');
      setSearchParams(sp, { replace: true });
    },
    [selectedIds, searchParams, setSearchParams],
  );

  // ---- per-crop timelines (parallel, fail-soft, cached by id) ----
  const [timelines, setTimelines] = useState<Record<string, TimelineState>>({});
  const requestedRef = useRef<Set<string>>(new Set());
  const [retryNonce, setRetryNonce] = useState(0);

  // No cancelled flag here: requestedRef survives StrictMode's dev double-mount,
  // so a first-pass "cancelled" fetch would never re-run and the panel would sit
  // on "loading" forever. Late setState after unmount is a no-op in React 18.
  useEffect(() => {
    selectedIds.forEach((id) => {
      if (requestedRef.current.has(id)) return;
      requestedRef.current.add(id);
      setTimelines((prev) => ({ ...prev, [id]: { status: 'loading' } }));
      api.getCropTimeline(id, 12, todayStr).then(
        (tl) => {
          setTimelines((prev) => ({ ...prev, [id]: { status: 'ok', timeline: tl } }));
        },
        () => {
          requestedRef.current.delete(id); // allow a retry
          setTimelines((prev) => ({ ...prev, [id]: { status: 'error' } }));
        },
      );
    });
  }, [selectedIds, todayStr, retryNonce]);

  const retryCrop = useCallback((id: string) => {
    requestedRef.current.delete(id);
    setTimelines((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRetryNonce((n) => n + 1);
  }, []);

  // ---- names, colours, geometry ----
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of crops) m.set(c.id, cropDisplayName(c, lang));
    return m;
  }, [crops, lang]);
  const nameFor = useCallback(
    (id: string) => nameById.get(id) ?? timelines[id]?.timeline?.cropName ?? id,
    [nameById, timelines],
  );

  // Colour by SELECTION ORDER — stable while the crop stays selected on this page.
  const colorByCrop = useMemo(() => {
    const m = new Map<string, string>();
    selectedIds.forEach((id, i) => m.set(id, marketColorVar(i)));
    return m;
  }, [selectedIds]);

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-LK' : 'en-LK', { month: 'short' });
    return (d: Date) => fmt.format(d);
  }, [lang]);

  const okIds = selectedIds.filter((id) => timelines[id]?.status === 'ok');
  const failedIds = selectedIds.filter((id) => timelines[id]?.status === 'error');
  const anyLoading = selectedIds.some((id) => !timelines[id] || timelines[id]?.status === 'loading');

  const okSeries: CompareSeriesInput[] = useMemo(
    () =>
      okIds.map((id) => ({ cropId: id, label: nameFor(id), timeline: timelines[id]!.timeline! })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [okIds.join(','), timelines, nameFor],
  );
  const geo = useMemo(
    () => buildCompareGeometry(okSeries, { width: VIEW_W, height: VIEW_H, monthLabel }),
    [okSeries, monthLabel],
  );

  // ---- FE-20 shared tooltip: nearest point across ALL overlaid crops. Past
  // points show crop + month + price; forecast points also show the "likely" band.
  const tipPoints: TooltipPoint[] = useMemo(() => {
    if (!geo) return [];
    const out: TooltipPoint[] = [];
    for (const s of geo.series) {
      for (const p of s.histPoints) {
        const [y, m] = p.month.split('-').map(Number);
        const label = `${monthLabel(new Date(y, (m || 1) - 1, 1))} ${y}`;
        const valueText = formatPrice(p.value, lang, rs);
        out.push({ key: `${s.cropId}-h-${p.month}`, x: p.x, y: p.y, seriesName: s.label, label, valueText, announce: [s.label, label, valueText].join(' · ') });
      }
      for (const p of s.fcPoints) {
        const label = formatDate(p.date, lang);
        const valueText = formatPrice(p.value, lang, rs);
        const bandText = t('tooltip.likely', { min: formatPrice(p.lower, lang, rs), max: formatPrice(p.upper, lang, rs) });
        out.push({ key: `${s.cropId}-f-${p.date}`, x: p.x, y: p.y, seriesName: s.label, label, valueText, bandText, announce: [s.label, label, valueText, bandText].join(' · ') });
      }
    }
    return out;
  }, [geo, monthLabel, lang, rs, t]);

  const tt = useChartTooltip(tipPoints, VIEW_W, VIEW_H);

  const summary = t('pages.compare.chartAria', {
    crops: okIds.map((id) => nameFor(id)).join(', '),
    count: okIds.length,
  });

  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.compare.title')}</h1>
        <span className="topbar__updated">
          <Link className="cmp-back" to="/best-crops">
            <span aria-hidden="true">← </span>
            {t('pages.compare.backToBest')}
          </Link>
        </span>
      </div>
      <p className="cmp-sub">{t('pages.compare.subtitle')}</p>

      {/* ---- selection ---- */}
      <section className="panel cmp-pick" aria-label={t('pages.compare.pick')}>
        <h2 className="cmp-pick__title">{t('pages.compare.pick')}</h2>
        <p className="cmp-pick__hint">{t('pages.compare.pickHint', { max: COMPARE_MAX })}</p>

        {cropsError ? (
          <div className="cmp-note cmp-note--error" role="alert">
            <span>{t('common.errorBody')}</span>
            <button type="button" className="btn-ghost cmp-note__retry" onClick={() => void loadCrops()}>
              {t('common.retry')}
            </button>
          </div>
        ) : cropsLoading ? (
          <div className="cmp-chips cmp-chips--skel" aria-busy="true">
            <p className="sr-only">{t('common.loading')}</p>
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="cmp-chip cmp-chip--skel" aria-hidden="true" />
            ))}
          </div>
        ) : (
          <div className="cmp-chips" role="group" aria-label={t('pages.compare.pick')}>
            {crops.map((c) => {
              const idx = selectedIds.indexOf(c.id);
              const on = idx >= 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`cmp-chip${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggleCrop(c.id)}
                >
                  {on && (
                    <span
                      className="cmp-chip__swatch"
                      aria-hidden="true"
                      style={{ background: marketColorVar(idx) }}
                    />
                  )}
                  {cropDisplayName(c, lang)}
                </button>
              );
            })}
          </div>
        )}

        {capNote && (
          <p className="cmp-cap" role="status">
            {t('pages.compare.capNote', { max: COMPARE_MAX })}
          </p>
        )}
      </section>

      {/* ---- chart / states ---- */}
      {selectedIds.length === 0 ? (
        <section className="panel cmp-empty" aria-label={t('pages.compare.chartHeading')}>
          <p className="cmp-empty__icon" aria-hidden="true">📊</p>
          <p className="cmp-empty__title">{t('pages.compare.emptyTitle')}</p>
          <p className="cmp-empty__body">{t('pages.compare.emptyBody')}</p>
        </section>
      ) : (
        <section className="panel cmp-chart" aria-label={t('pages.compare.chartHeading')}>
          <h2 className="cmp-chart__title">{t('pages.compare.chartHeading')}</h2>

          {okIds.length > 0 && geo ? (
            <>
              <div className={`cmp-svgwrap ct-wrap${anyLoading ? ' is-busy' : ''}`} aria-busy={anyLoading || undefined}>
                <svg className="cmp-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={summary} {...tt.svgProps}>
                  {/* y gridlines + Rs. labels */}
                  {geo.yTicks.map((tk) => (
                    <g key={`y${tk.value}`}>
                      <line className="cmp-grid" x1={geo.dims.plot.left} y1={tk.y} x2={geo.dims.plot.right} y2={tk.y} />
                      <text className="cmp-axis" x={geo.dims.plot.left - 6} y={(tk.y ?? 0) + 4} textAnchor="end">
                        {tk.label}
                      </text>
                    </g>
                  ))}
                  <line
                    className="cmp-axisline"
                    x1={geo.dims.plot.left}
                    y1={geo.dims.plot.bottom}
                    x2={geo.dims.plot.right}
                    y2={geo.dims.plot.bottom}
                  />

                  {/* low-opacity per-crop bands (approximate ranges) */}
                  {geo.series.map((s, i) => {
                    const color = colorByCrop.get(s.cropId) ?? marketColorVar(i);
                    return s.bandPolygon ? (
                      <polygon key={`b${s.cropId}`} className="cmp-band" points={s.bandPolygon} style={{ fill: color }} />
                    ) : null;
                  })}

                  {/* central lines: history solid, forecast dashed */}
                  {geo.series.map((s, i) => {
                    const color = colorByCrop.get(s.cropId) ?? marketColorVar(i);
                    return (
                      <g key={`l${s.cropId}`}>
                        {s.historyPolyline && (
                          <polyline className="cmp-hist" points={s.historyPolyline} fill="none" style={{ stroke: color }} />
                        )}
                        {s.forecastPolyline && (
                          <polyline className="cmp-fc" points={s.forecastPolyline} fill="none" style={{ stroke: color }} />
                        )}
                        {s.end && (
                          <text className="cmp-endlabel" x={s.end.x + 6} y={s.end.y + 4} style={{ fill: color }}>
                            {s.label}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* x month labels */}
                  {geo.xTicks.map((tk, i) => (
                    <text key={`x${i}`} className="cmp-axis" x={tk.x} y={geo.dims.plot.bottom + 18} textAnchor="middle">
                      {tk.label}
                    </text>
                  ))}

                  {tt.active && <circle className="ct-dot" cx={tt.active.x} cy={tt.active.y} r={5} />}
                </svg>
                <ChartTooltip point={tt.active} mode={tt.mode} viewW={VIEW_W} viewH={VIEW_H} />
              </div>

              <p className="cmp-keys" aria-hidden="true">
                <span className="cmp-key cmp-key--hist">{t('pages.compare.keyHistory')}</span>
                <span className="cmp-key cmp-key--fc">{t('pages.compare.keyForecast')}</span>
              </p>
              <p className="cmp-caption">{t('pages.compare.bandCaption')}</p>

              {/* honest thin-history notes */}
              {okIds.map((id) => {
                const tl = timelines[id]!.timeline!;
                if (!isShortHistory(tl.history)) return null;
                return (
                  <p key={`thin${id}`} className="cmp-note" role="note">
                    <span aria-hidden="true">ℹ️ </span>
                    {t('pages.compare.thinNote', { crop: nameFor(id), count: tl.history.length })}
                  </p>
                );
              })}
            </>
          ) : anyLoading ? (
            <div className="cmp-skel" aria-busy="true">
              <p className="sr-only">{t('common.loading')}</p>
              <div className="cmp-skel__chart" aria-hidden="true" />
            </div>
          ) : (
            <p className="cmp-note" role="note">
              {t('pages.compare.allFailed')}
            </p>
          )}

          {/* per-crop fail-soft notes (never sink the chart) */}
          {failedIds.map((id) => (
            <div key={`err${id}`} className="cmp-note cmp-note--error" role="alert">
              <span>{t('pages.compare.failNote', { crop: nameFor(id) })}</span>
              <button type="button" className="btn-ghost cmp-note__retry" onClick={() => retryCrop(id)}>
                {t('common.retry')}
              </button>
            </div>
          ))}

          {/* mandatory table alternative (month × crop) */}
          {okSeries.length > 0 && (
            <CompareTable series={okSeries} monthLabel={monthLabel} lang={lang} rs={rs} t={t} />
          )}

          {okSeries.length > 0 && <p className="cmp-prov prov">{t('common.source')}</p>}
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Month × crop numeric table — the WCAG text alternative for the overlay chart.
// ---------------------------------------------------------------------------
function CompareTable({
  series,
  monthLabel,
  lang,
  rs,
  t,
}: {
  series: CompareSeriesInput[];
  monthLabel: (d: Date) => string;
  lang: string;
  rs: string;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const monthKeys = new Set<string>();
  const perCrop = series.map((s) => {
    const map = new Map<string, { price: number; fc: boolean }>();
    for (const h of s.timeline.history) {
      map.set(h.month, { price: h.avgPrice, fc: false });
      monthKeys.add(h.month);
    }
    for (const f of s.timeline.forecast) {
      const k = f.date.slice(0, 7);
      map.set(k, { price: f.predictedPrice, fc: true });
      monthKeys.add(k);
    }
    return { label: s.label, map };
  });
  const sortedMonths = [...monthKeys].sort();

  const labelForMonth = (mk: string): string => {
    const [yy, mm] = mk.split('-').map(Number);
    return `${monthLabel(new Date(yy, (mm || 1) - 1, 1))} ${yy}`;
  };

  return (
    <details className="cmp-table">
      <summary className="cmp-table__summary">
        <span aria-hidden="true">📋 </span>
        {t('pages.compare.tableToggle')}
      </summary>
      <table className="cmp-table__grid">
        <caption className="sr-only">{t('pages.compare.chartHeading')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('pages.compare.tableMonth')}</th>
            {perCrop.map((c, i) => (
              <th key={i} scope="col" className="cmp-table__num">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedMonths.map((mk) => (
            <tr key={mk}>
              <th scope="row">{labelForMonth(mk)}</th>
              {perCrop.map((c, i) => {
                const cell = c.map.get(mk);
                return (
                  <td key={i} className="cmp-table__num">
                    {cell ? (
                      <>
                        {cell.fc && <span aria-hidden="true">~</span>}
                        {formatPrice(cell.price, lang, rs)}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="cmp-table__note">{t('pages.compare.tableNote')}</p>
    </details>
  );
}
