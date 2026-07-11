// =============================================================================
// StalenessBanner (FE-9). Honest "you are seeing SAVED data" notice. Renders only
// when the service worker had to serve the last API response from its offline
// cache (network unreachable). Amber caution (never red — this is not an error,
// the data is just old), localized, dismissible, and re-appears if a newer cached
// snapshot is shown after being dismissed.
//
// Product principle: hiding staleness is a bug. A farmer must never mistake
// yesterday's saved price for today's live one.
// =============================================================================
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCacheState, subscribeCacheSignal, type CacheState } from '../api/cacheSignal';
import { formatDate } from '../lib/format';

function useCacheSignal(): CacheState {
  const [s, setS] = useState<CacheState>(getCacheState);
  useEffect(() => subscribeCacheSignal(setS), []);
  return s;
}

export default function StalenessBanner() {
  const { t, i18n } = useTranslation();
  const { fromCache, cachedAt } = useCacheSignal();
  // Dismissal is keyed to the snapshot timestamp: a later snapshot re-shows it.
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  if (!fromCache) return null;
  if (dismissedAt !== null && dismissedAt === (cachedAt ?? '')) return null;

  const dateStr = cachedAt ? formatDate(new Date(cachedAt), i18n.language) : '';

  return (
    <div className="stale-banner" role="status">
      <span className="stale-banner__icon" aria-hidden="true">
        ⚠
      </span>
      <p className="stale-banner__text">
        {dateStr
          ? t('common.staleBanner', { date: dateStr })
          : t('common.staleBannerNoDate')}
      </p>
      <button
        type="button"
        className="stale-banner__dismiss"
        onClick={() => setDismissedAt(cachedAt ?? '')}
        aria-label={t('common.dismiss')}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
