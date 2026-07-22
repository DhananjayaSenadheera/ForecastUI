// ADM-6 — Economic indicators browser (/admin/indicators). READ-ONLY. LIVE (API-11).
// Owner directive 2026-07-12: USD/LKR is NOT shown here — the page presents the
// Colombo Consumer Price Index only. NOTE the CCPI is a MONTHLY series (CBSL
// publishes one value per month, ~3 weeks after month end) — a "daily CPI" does
// not exist, so monthly is the honest cadence. It is vintage-aware: each value
// carries TWO dates that must ALWAYS be shown together — referenceDate (the
// period described) and publishedAt (when it became knowable). Never collapse
// them. (The daily USD_LKR client method + fixtures remain in api/ for later.)
// Owner redline 2026-07-12: NO data table — charts only. Two charts, each with one
// message: LINE = the index level; GAUGE = the inflation pace. Rich aria-label
// summaries stand in for the removed table.
//
// SERIES DISCOVERY (API-11): the page reads GET /api/indicators/catalog and only
// fetches the macro series the catalog actually lists (no hardcoded assumption that a
// series exists). It pins TWO series for its two visualisations:
//   • CCPI_BASE2021 (index level)                 -> LINE chart.
//   • CCPI_HEADLINE_YOY_BASE2021 (headline YoY %)  -> GAUGE (read DIRECTLY, no
//     client-side derivation — the ready-made YoY series is the honest source).
//
// GAUGE ZONE MAPPING (owner-review flag): the gauge originally showed month-on-month
// %/mo with owner-approved zones (<0 fall · 0–0.5 mild · 0.5–0.9 elev · >0.9 high).
// Switching to the ready-made YoY series, those zones are re-expressed on a %/YEAR
// scale using the owner's own annualised equivalents (0.5%/mo≈6%/yr, 0.9%/mo≈11%/yr):
//   <0 falling (deflation) · 0–6 mild (≈ CBSL's ~5% target band) · 6–11 elevated ·
//   >11 high. Colours are unchanged (CVD-safe). See ZONES below.
//
// MULTI-VINTAGE (leakage-honest): macro-series can return several vintages of the same
// referenceDate (a later publishedAt revises an earlier estimate). For a single-value
// display the LATEST publishedAt wins, but superseded rows are NOT silently dropped —
// a revision note surfaces their count so the admin knows the figure was revised.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { CCPI_INDEX_KEY, CCPI_YOY_KEY, type MacroSeriesPoint } from '../api/types';
import { formatDate } from '../lib/format';
import { AdminError, AdminHint, AdminLoading, AdminTopbar, DemoNote } from './adminShared';

const VIEW_W = 640;
const VIEW_H = 220;
const PAD = { left: 52, right: 16, top: 12, bottom: 28 };

interface ChartPoint {
  label: string; // x-axis label (a date)
  value: number;
}

// ---------------------------------------------------------------------------
// Inflation-pace gauge. Reads the ready-made headline YoY series DIRECTLY (no MoM
// derivation). Shows the LATEST month's YoY % as a speedometer needle over four named
// zones re-mapped from the owner's %/mo zones onto a %/YEAR scale (see file header):
//   <0 falling · 0–6 mild (≈ target band) · 6–11 elevated · >11 high.
// Context stats under the dial keep last/previous/12-month-average so the trend isn't
// fully lost. Colours are the original CVD-safe zone classes (unchanged).
// ---------------------------------------------------------------------------
const G = { cx: 150, cy: 150, r: 110, min: -5, max: 20, w: 18 };
const ZONES = [
  { to: 0, cls: 'adm-gauge__zone--fall', labelKey: 'admin.indicators.zone.fall' },
  { to: 6, cls: 'adm-gauge__zone--mild', labelKey: 'admin.indicators.zone.mild' },
  { to: 11, cls: 'adm-gauge__zone--elev', labelKey: 'admin.indicators.zone.elev' },
  { to: G.max, cls: 'adm-gauge__zone--high', labelKey: 'admin.indicators.zone.high' },
];
const GAUGE_BOUNDARIES = [G.min, 0, 6, 11, G.max];

function gaugeAngle(v: number): number {
  const c = Math.max(G.min, Math.min(G.max, v));
  return -90 + ((c - G.min) / (G.max - G.min)) * 180;
}
function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: G.cx + r * Math.sin(rad), y: G.cy - r * Math.cos(rad) };
}
function arcPath(fromV: number, toV: number): string {
  const a = polar(gaugeAngle(fromV), G.r);
  const b = polar(gaugeAngle(toV), G.r);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${G.r} ${G.r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}
function zoneLabelKey(v: number): string {
  return (ZONES.find((z) => v < z.to) ?? ZONES[ZONES.length - 1]).labelKey;
}

// Collapse vintages: keep the LATEST publishedAt per referenceDate (chronological by
// referenceDate). `superseded` counts the older vintages that were revised away — the
// UI surfaces that count rather than silently discarding them.
function collapseVintages(points: MacroSeriesPoint[]): { points: MacroSeriesPoint[]; superseded: number } {
  const byRef = new Map<string, MacroSeriesPoint>();
  let superseded = 0;
  for (const p of points) {
    const existing = byRef.get(p.referenceDate);
    if (!existing) {
      byRef.set(p.referenceDate, p);
    } else {
      superseded++;
      if (p.publishedAt > existing.publishedAt) byRef.set(p.referenceDate, p);
    }
  }
  const kept = [...byRef.values()].sort((a, b) =>
    a.referenceDate < b.referenceDate ? -1 : a.referenceDate > b.referenceDate ? 1 : 0,
  );
  return { points: kept, superseded };
}

function buildGeometry(points: ChartPoint[]) {
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const polyline = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const yTicks = [lo, (lo + hi) / 2, hi].map((v) => ({ v, y: y(v) }));
  const xTickIdx = points.length === 1 ? [0] : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  // Edge labels anchor inward (first: start, last: end) so they never clip the viewBox.
  const xTicks = xTickIdx.map((i, n) => ({
    x: x(i),
    label: points[i].label,
    anchor: (points.length === 1 ? 'middle' : n === 0 ? 'start' : n === xTickIdx.length - 1 ? 'end' : 'middle') as 'start' | 'middle' | 'end',
  }));
  return { polyline, yTicks, xTicks, bottom: PAD.top + plotH };
}

export default function IndicatorsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [index, setIndex] = useState<MacroSeriesPoint[]>([]);
  const [yoy, setYoy] = useState<MacroSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [vintageDismissed, setVintageDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Discover which macro series actually exist before fetching (no hardcoded
      // assumption a key is present); fetch only the pinned keys the catalog lists.
      const catalog = await api.getIndicatorCatalog();
      const macroKeys = new Set(catalog.filter((c) => c.kind === 'macro').map((c) => c.key));
      const [idx, y] = await Promise.all([
        macroKeys.has(CCPI_INDEX_KEY) ? api.getIndicatorMacro(CCPI_INDEX_KEY) : Promise.resolve([]),
        macroKeys.has(CCPI_YOY_KEY) ? api.getIndicatorMacro(CCPI_YOY_KEY) : Promise.resolve([]),
      ]);
      setIndex(idx);
      setYoy(y);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Vintage-collapse both series (latest publishedAt wins per referenceDate).
  const indexV = useMemo(() => collapseVintages(index), [index]);
  const yoyV = useMemo(() => collapseVintages(yoy), [yoy]);
  const supersededCount = indexV.superseded + yoyV.superseded;

  // Line: index level, plotted against the referenceDate (the period described).
  const chartPoints: ChartPoint[] = useMemo(
    () => indexV.points.map((p) => ({ label: formatDate(p.referenceDate, lang), value: p.value })),
    [indexV, lang],
  );
  const geo = useMemo(() => buildGeometry(chartPoints), [chartPoints]);

  // Gauge: the ready-made YoY values, chronological, consumed directly.
  const yoyValues = useMemo(() => yoyV.points.map((p) => p.value), [yoyV]);

  const nf = useMemo(() => new Intl.NumberFormat(lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-LK' : 'en-LK', { maximumFractionDigits: 2 }), [lang]);

  const summary = geo
    ? t('admin.indicators.chartAria', {
        series: t('admin.indicators.ccpi'),
        count: chartPoints.length,
        min: nf.format(Math.min(...chartPoints.map((p) => p.value))),
        max: nf.format(Math.max(...chartPoints.map((p) => p.value))),
      })
    : '';

  const hasAny = geo !== null || yoyValues.length > 0;

  return (
    <>
      <AdminTopbar title={t('admin.indicators.title')} subtitle={t('admin.indicators.subtitle')} />
      <section className="panel adm" aria-label={t('admin.indicators.title')}>
        <DemoNote />

        {/* The CCPI explainer lives on a ⓘ tooltip beside the section heading (owner
            request 2026-07-22 — same treatment as the Logs tab tooltips, 💡 banner gone). */}
        <div className="adm-title-row">
          <h3 className="adm-title">{t('admin.indicators.ccpi')}</h3>
          <AdminHint hint={t('admin.indicators.explainer')} id="adm-ind-hint" />
        </div>
        {!vintageDismissed && (
          <p className="adm-note adm-note--dismiss" role="note">
            <span aria-hidden="true">ℹ️ </span>
            {t('admin.indicators.vintageNote')}
            <button
              type="button"
              className="adm-note__dismiss"
              onClick={() => setVintageDismissed(true)}
              aria-label={t('common.dismiss')}
            >
              ✕
            </button>
          </p>
        )}
        {supersededCount > 0 && (
          <p className="adm-note adm-note--revision" role="note">
            <span aria-hidden="true">🔄 </span>
            {t('admin.indicators.revisionNote', { count: supersededCount })}
          </p>
        )}

        {error ? (
          <AdminError onRetry={() => void load()} />
        ) : loading ? (
          <AdminLoading rows={4} />
        ) : !hasAny ? (
          <p className="adm-state__body">{t('admin.indicators.noData')}</p>
        ) : (
          <div className="adm-duo">
            {geo && (
              <div>
                <p className="adm-title adm-chartcaption">{t('admin.indicators.lineCaption')}</p>
                <div className="adm-chart">
                  <svg className="adm-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={summary}>
                    {geo.yTicks.map((tk, i) => (
                      <g key={`y${i}`}>
                        <line className="adm-grid" x1={PAD.left} y1={tk.y} x2={VIEW_W - PAD.right} y2={tk.y} />
                        <text className="adm-axis" x={PAD.left - 6} y={tk.y + 3} textAnchor="end">
                          {nf.format(Math.round(tk.v * 10) / 10)}
                        </text>
                      </g>
                    ))}
                    <line className="adm-axisline" x1={PAD.left} y1={geo.bottom} x2={VIEW_W - PAD.right} y2={geo.bottom} />
                    <polyline className="adm-line" points={geo.polyline} />
                    {geo.xTicks.map((tk, i) => (
                      <text key={`x${i}`} className="adm-axis" x={tk.x} y={geo.bottom + 16} textAnchor={tk.anchor}>
                        {tk.label}
                      </text>
                    ))}
                  </svg>
                </div>
              </div>
            )}

            {yoyValues.length > 0 && <InflationGauge values={yoyValues} nf={nf} />}
          </div>
        )}
      </section>
    </>
  );
}

/** Speedometer-style dial for the latest month's YoY inflation pace (reads the ready-made
 *  headline YoY series directly). */
function InflationGauge({ values, nf }: { values: number[]; nf: Intl.NumberFormat }) {
  const { t } = useTranslation();
  const latest = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : null;
  const avg12 = values.reduce((s, c) => s + c, 0) / values.length;
  const needleAngle = gaugeAngle(latest);
  const zone = t(zoneLabelKey(latest));
  return (
    <div className="adm-gauge">
      <p className="adm-title adm-chartcaption">{t('admin.indicators.gaugeCaption')}</p>
      <div className="adm-chart">
        <svg
          className="adm-svg"
          viewBox="0 0 300 185"
          role="img"
          aria-label={t('admin.indicators.gaugeAria', { value: nf.format(latest), zone })}
        >
          {ZONES.map((z, i) => (
            <path
              key={z.cls}
              className={z.cls}
              d={arcPath(i === 0 ? G.min : ZONES[i - 1].to, z.to)}
              fill="none"
              strokeWidth={G.w}
            />
          ))}
          {GAUGE_BOUNDARIES.map((b) => {
            const a = gaugeAngle(b);
            const p = polar(a, G.r + G.w / 2 + 8);
            const anchor = a < -30 ? 'end' : a > 30 ? 'start' : 'middle';
            return (
              <text key={b} className="adm-gauge__tick adm-axis" x={p.x} y={p.y + 3} textAnchor={anchor} fontSize="10">
                {b >= G.max ? `${nf.format(b)}%+` : `${nf.format(b)}%`}
              </text>
            );
          })}
          <g transform={`rotate(${needleAngle.toFixed(1)} ${G.cx} ${G.cy})`}>
            <line className="adm-gauge__needle" x1={G.cx} y1={G.cy} x2={G.cx} y2={G.cy - (G.r - 16)} strokeWidth="4" strokeLinecap="round" />
          </g>
          <circle className="adm-gauge__hub" cx={G.cx} cy={G.cy} r="8" />
          {/* White halo (paint-order stroke) keeps the numerals legible where the
              near-vertical needle passes behind them. */}
          <text className="adm-gauge__value" x={G.cx} y={G.cy - 26} textAnchor="middle" fontSize="26" stroke="var(--surface)" strokeWidth="5" paintOrder="stroke">
            {nf.format(latest)}%
          </text>
          <text className="adm-gauge__zonelabel" x={G.cx} y={G.cy - 10} textAnchor="middle" fontSize="11" stroke="var(--surface)" strokeWidth="4" paintOrder="stroke">
            {t('admin.indicators.perYear')} · {zone}
          </text>
        </svg>
      </div>
      <p className="adm-gauge-note" role="note">
        {t('admin.indicators.gaugeZoneNote')}
      </p>
      <p className="adm-gauge-stats">
        <span>
          {t('admin.indicators.statLast')} <strong>{nf.format(latest)}%</strong>
        </span>
        {prev !== null && (
          <span>
            {t('admin.indicators.statPrev')} <strong>{nf.format(prev)}%</strong>
          </span>
        )}
        <span>
          {t('admin.indicators.statAvg')} <strong>{nf.format(avg12)}%</strong>
        </span>
      </p>
    </div>
  );
}
