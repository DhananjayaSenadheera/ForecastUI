// ADM-6 — Economic indicators browser (/admin/indicators). READ-ONLY.
// Owner directive 2026-07-12: USD/LKR is NOT shown here — the page presents the
// Colombo Consumer Price Index only. NOTE the CCPI is a MONTHLY series (CBSL
// publishes one value per month, ~3 weeks after month end) — a "daily CPI" does
// not exist, so monthly is the honest cadence. It is vintage-aware: each value
// carries TWO dates that must ALWAYS be shown together — referenceDate (the
// period described) and publishedAt (when it became knowable). Never collapse
// them. (The daily USD_LKR client method + fixtures remain in api/ for later.)
// Owner redline 2026-07-12: NO data table — charts only. Two charts, each with one
// message: LINE = the index level; BARS = month-on-month % change (the inflation
// pace, which is what the forecasting features actually react to). Rich aria-label
// summaries stand in for the removed table.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { MacroSeriesPoint } from '../api/types';
import { formatDate } from '../lib/format';
import { AdminError, AdminLoading, AdminTopbar, DemoNote } from './adminShared';

const VIEW_W = 640;
const VIEW_H = 220;
const PAD = { left: 52, right: 16, top: 12, bottom: 28 };

const SERIES_ID = 'CCPI_BASE2021';

interface ChartPoint {
  label: string; // x-axis label (a date)
  value: number;
}

// ---------------------------------------------------------------------------
// Inflation-pace gauge (owner-decided 2026-07-13, replaces the MoM bar chart).
// Shows the LATEST month-on-month % change as a speedometer needle over four
// named zones. Thresholds (%/month, owner-approved): <0 falling · 0–0.5 mild
// (≈0–6%/yr) · 0.5–0.9 elevated · >0.9 high (≈11%+/yr). Context stats under the
// dial keep last/previous/12-month-average so the trend isn't fully lost.
// ---------------------------------------------------------------------------
const G = { cx: 150, cy: 150, r: 110, min: -0.2, max: 1.2, w: 18 };
const ZONES = [
  { to: 0, cls: 'adm-gauge__zone--fall', labelKey: 'admin.indicators.zone.fall' },
  { to: 0.5, cls: 'adm-gauge__zone--mild', labelKey: 'admin.indicators.zone.mild' },
  { to: 0.9, cls: 'adm-gauge__zone--elev', labelKey: 'admin.indicators.zone.elev' },
  { to: G.max, cls: 'adm-gauge__zone--high', labelKey: 'admin.indicators.zone.high' },
];

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

/** Month-on-month % changes from the monthly index points (n points -> n-1 changes). */
function momChanges(points: ChartPoint[]): number[] {
  return points.slice(1).map((p, i) => ((p.value - points[i].value) / points[i].value) * 100);
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

  const [macro, setMacro] = useState<MacroSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setMacro(await api.getIndicatorMacro(SERIES_ID));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Plotted against the referenceDate (the period the value describes).
  const chartPoints: ChartPoint[] = useMemo(
    () => macro.map((p) => ({ label: formatDate(p.referenceDate, lang), value: p.value })),
    [macro, lang],
  );

  const geo = useMemo(() => buildGeometry(chartPoints), [chartPoints]);
  const changes = useMemo(() => momChanges(chartPoints), [chartPoints]);
  const nf = useMemo(() => new Intl.NumberFormat(lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-LK' : 'en-LK', { maximumFractionDigits: 2 }), [lang]);

  const summary = geo
    ? t('admin.indicators.chartAria', {
        series: t('admin.indicators.ccpi'),
        count: chartPoints.length,
        min: nf.format(Math.min(...chartPoints.map((p) => p.value))),
        max: nf.format(Math.max(...chartPoints.map((p) => p.value))),
      })
    : '';

  return (
    <>
      <AdminTopbar title={t('admin.indicators.title')} subtitle={t('admin.indicators.subtitle')} />
      <section className="panel adm" aria-label={t('admin.indicators.title')}>
        <DemoNote hasLiveEndpoint={false} />

        <h3 className="adm-title">{t('admin.indicators.ccpi')}</h3>
        <p className="adm-note" role="note">
          <span aria-hidden="true">💡 </span>
          {t('admin.indicators.explainer')}
        </p>
        <p className="adm-note" role="note">
          <span aria-hidden="true">ℹ️ </span>
          {t('admin.indicators.vintageNote')}
        </p>

        {error ? (
          <AdminError onRetry={() => void load()} />
        ) : loading ? (
          <AdminLoading rows={4} />
        ) : !geo ? (
          <p className="adm-state__body">{t('admin.indicators.noData')}</p>
        ) : (
          <div className="adm-duo">
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

            {changes.length > 0 && <InflationGauge changes={changes} nf={nf} />}
          </div>
        )}
      </section>
    </>
  );
}

/** Speedometer-style dial for the latest month's inflation pace. */
function InflationGauge({ changes, nf }: { changes: number[]; nf: Intl.NumberFormat }) {
  const { t } = useTranslation();
  const latest = changes[changes.length - 1];
  const prev = changes.length > 1 ? changes[changes.length - 2] : null;
  const avg12 = changes.reduce((s, c) => s + c, 0) / changes.length;
  const needleAngle = gaugeAngle(latest);
  const zone = t(zoneLabelKey(latest));
  const boundaries = [G.min, 0, 0.5, 0.9, G.max];
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
          {boundaries.map((b) => {
            const a = gaugeAngle(b);
            const p = polar(a, G.r + G.w / 2 + 8);
            const anchor = a < -30 ? 'end' : a > 30 ? 'start' : 'middle';
            return (
              <text key={b} className="adm-gauge__tick adm-axis" x={p.x} y={p.y + 3} textAnchor={anchor} fontSize="10">
                {b <= G.min ? `${nf.format(b)}%` : b >= G.max ? `${nf.format(b)}%+` : `${nf.format(b)}%`}
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
            {t('admin.indicators.perMonth')} · {zone}
          </text>
        </svg>
      </div>
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

