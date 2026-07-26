import { useTranslation } from 'react-i18next';

// STUB. Persistent audio-help affordance for low-literacy users: a real, labelled,
// keyboard-reachable >=44px control that currently does nothing. Clips land later.
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
