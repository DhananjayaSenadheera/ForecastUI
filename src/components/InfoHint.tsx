// InfoHint — the small ⓘ beside a fact that needs a sentence of explanation.
//
// The farmer-side twin of the admin console's AdminHint (src/admin/adminShared.tsx), which
// cannot be reused directly: that module pulls admin.css and lives in the admin chunk, and
// this one has to travel with the portfolio. The BEHAVIOUR is deliberately identical, so a
// farmer and an operator learn one idiom:
//   • on pointer/keyboard the text is a hover/focus tooltip attached with aria-describedby,
//     and it lives OUTSIDE the button so it never joins the button's accessible name;
//   • touch has no hover, so a tap toggles the same sentence as an inline note;
//   • aria-controls is set only while that note exists (a dangling idref is invalid).
//
// Everything it renders is INLINE-safe (the note is a <span role="note"> with
// display:block, not a <p>), because the two places it is used sit inside paragraphs:
// "Price from 28 Jul ⓘ" and "Confidence: Good ⓘ". A <p> nested in a <p> is invalid markup
// that browsers silently repair by splitting the paragraph, which would drop the hint out
// of its own line.
//
// It explains, it never warns: no colour, no glyph beyond the ⓘ itself, and the fact it
// annotates is complete and readable with the hint closed.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function InfoHint({
  hint,
  id,
  className,
}: {
  /** The already-translated sentence to show. */
  hint: string;
  /** Unique per mounted instance — the card and the popup over it are both mounted. */
  id: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tipId = `${id}-tip`;
  return (
    <>
      <span className={`pf-hint-wrap${className ? ` ${className}` : ''}`}>
        <button
          type="button"
          className="pf-hint-btn"
          aria-label={t('common.hintLabel')}
          aria-describedby={tipId}
          aria-expanded={open}
          {...(open ? { 'aria-controls': id } : {})}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">ⓘ</span>
        </button>
        <span role="tooltip" id={tipId} className="pf-hint-tip">
          {hint}
        </span>
      </span>
      {open && (
        <span role="note" id={id} className="pf-hint-note">
          {hint}
        </span>
      )}
    </>
  );
}
