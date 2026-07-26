// Admin-wide banner for last night's pipeline outcome.
//
// Why it is app-wide and not a card on the Logs page: the failure this exists to catch is
// the SILENT one — the nightly job that did not run for eight mornings while every screen
// kept rendering confidently stale forecasts. A notice only visible to someone who already
// suspected a problem would not have caught it. So it rides the admin layout and follows
// the admin wherever they are.
//
// What it deliberately does NOT do:
//  - It says nothing on a good night (green) or a night still in progress (running). An
//    "all is well" bar teaches people to stop reading bars.
//  - It says nothing for a state this build does not recognise, and nothing while the
//    request is in flight or failing. We do not know, so we do not claim. (The ingestion
//    page owns the loud "could not read the pipeline" error; a bar that shouted about its
//    own fetch on every admin page would be noise, and a skeleton would flash on every
//    page load for a banner that is usually absent.)
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatDate, formatDateTime, mapRunStatus, mapVerificationVerdict } from '../lib/format';
import { pipelineHealthDismissKey, presentPipelineHealth } from '../lib/pipelineHealth';
import { readPipelineHealthDismissed, writePipelineHealthDismissed } from '../lib/storage';
import { usePolledSnapshot } from './usePolledSnapshot';

// Five minutes while visible, backing off to twenty while the endpoint is failing. The
// nightly pipeline moves in tens of minutes, so anything tighter is bandwidth for nothing.
const POLL_BASE_MS = 5 * 60_000;
const POLL_MAX_MS = 20 * 60_000;

export default function PipelineHealthBanner() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: health } = usePolledSnapshot(() => api.getPipelineHealth(), {
    baseMs: POLL_BASE_MS,
    maxMs: POLL_MAX_MS,
  });
  // Seeded from storage so a dismissal survives a reload; kept in state as well so the
  // banner disappears immediately on the click.
  const [dismissedKey, setDismissedKey] = useState<string | null>(readPipelineHealthDismissed);

  const dismiss = useCallback((key: string) => {
    setDismissedKey(key);
    writePipelineHealthDismissed(key);
  }, []);

  if (!health) return null;
  const look = presentPipelineHealth(health.state);
  if (!look) return null; // green, running, or a state added to the API after this build

  // Dismissal is keyed to state+date, so a new pipeline day — or the same day getting
  // worse — brings the banner back without the admin doing anything.
  const key = pipelineHealthDismissKey(health);
  if (dismissedKey === key) return null;

  const date = formatDate(health.expectedForDate, lang);
  const details = [
    health.startedUtc
      ? t('admin.pipelineHealth.startedAt', { time: formatDateTime(health.startedUtc, lang) })
      : null,
    health.verificationStatus
      ? t('admin.pipelineHealth.qualityCheck', {
          status: t(mapVerificationVerdict(health.verificationStatus).labelKey),
        })
      : null,
    health.featureBuildStatus
      ? t('admin.pipelineHealth.featureBuild', {
          status: t(mapRunStatus(health.featureBuildStatus).labelKey),
        })
      : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className={`pipe-banner pipe-banner--${look.tone}`}
      // alert for "nothing ran" (interrupts), status for "ran imperfectly" (polite).
      role={look.role}
      {...(look.role === 'status' ? { 'aria-live': 'polite' } : {})}
    >
      {/* Decoration only: the severity is carried by the title text and the role. */}
      <span className="pipe-banner__icon" aria-hidden="true">
        {look.tone === 'critical' ? '⛔' : '⚠️'}
      </span>
      <div className="pipe-banner__body">
        <p className="pipe-banner__title">{t(look.titleKey)}</p>
        <p className="pipe-banner__text">{t(look.bodyKey, { date })}</p>
        {details.length > 0 && (
          <p className="pipe-banner__detail">{details.join(' · ')}</p>
        )}
        <Link className="pipe-banner__link" to="/admin/logs/ingestion">
          {t('admin.pipelineHealth.viewRuns')}
        </Link>
      </div>
      <button
        type="button"
        className="pipe-banner__dismiss"
        onClick={() => dismiss(key)}
        // Named for what it hides, not just "Dismiss": several admin screens carry a ✕.
        aria-label={t('admin.pipelineHealth.dismiss')}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
