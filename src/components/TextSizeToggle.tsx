import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LARGE_TEXT_CLASS, readLargeText, writeLargeText } from '../lib/storage';

// Large-text toggle beside the language switcher. It adds a root `html.a11y-large` class,
// which re-declares the --fs-* tokens larger (tokens.css) and scales the whole type ramp by
// ~18%. The preference is persisted and applied before first paint in main.tsx, so there is
// no flash. The icon is paired with an accessible label and aria-pressed exposes the state.
// px-based SVG charts keep their fixed size.
export default function TextSizeToggle() {
  const { t } = useTranslation();
  const [large, setLarge] = useState<boolean>(() => readLargeText());

  const toggle = () => {
    const next = !large;
    setLarge(next);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle(LARGE_TEXT_CLASS, next);
    }
    writeLargeText(next);
  };

  return (
    <button
      type="button"
      className={`textsize${large ? ' is-active' : ''}`}
      aria-pressed={large}
      aria-label={t('a11y.textSize')}
      title={t('a11y.textSize')}
      onClick={toggle}
    >
      <span className="textsize__glyph" aria-hidden="true">
        <span className="textsize__a-sm">A</span>
        <span className="textsize__a-lg">A</span>
      </span>
    </button>
  );
}
