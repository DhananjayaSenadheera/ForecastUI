import { useTranslation } from 'react-i18next';

// STUB (FE-2). Persistent audio-help affordance — evidence-backed for low-literacy
// autonomous use (PRD §2.3). Pre-recorded per-page clips land in FE-8; for now this
// is a real, labelled, keyboard-reachable >=44px control that no-ops.
export default function AudioHelpButton() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="audiohelp"
      aria-label={t('audio.listen')}
      title={t('audio.listen')}
      onClick={() => {
        /* FE-8: play the current page's pre-recorded audio clip */
      }}
    >
      <span aria-hidden="true">🔊</span>
      <span className="wrap-label">{t('audio.listen')}</span>
    </button>
  );
}
