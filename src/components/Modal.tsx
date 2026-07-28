// Modal — the farmer-facing popup shell. One crop's card opens into it ("More details"),
// and Phase 2's selling price / fertiliser / labour sections will be more sections inside
// the same sheet: the point of the popup is that a farmer manages a crop from ONE card
// instead of walking between screens.
//
// The keyboard contract (focus in, Tab trapped, Escape out, focus back to the opener, no
// scrolling of the page behind) is NOT re-implemented here — it is useDialogBehaviour,
// shared verbatim with the admin dialog shell. What this file owns is the farmer chrome:
// a full-width sheet on a phone, a title that is the crop's name (so the dialog's
// accessible name is the thing it is about), and a ✕ that is a real 44px target.
//
// The title element is REFERENCED by id (aria-labelledby), never copied into an
// aria-label: the name a screen reader announces and the name on screen are then the same
// string by construction, and a translation can never make them disagree.
import { useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogBehaviour } from '../lib/dialog';

export interface ModalProps {
  /** The dialog's accessible name, rendered as its heading. Plain text on purpose. */
  title: string;
  onClose: () => void;
  /** Optional: a stable id for the heading (tests and callers that link to it). */
  titleId?: string;
  children: ReactNode;
}

export default function Modal({ title, onClose, titleId, children }: ModalProps) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const { onKeyDown } = useDialogBehaviour(panel, onClose);
  const autoId = useId();
  const headingId = titleId ?? `modal-title-${autoId}`;

  return (
    // A tap on the backdrop closes; a tap INSIDE must not bubble out to it and close the
    // dialog the farmer is using.
    <div className="pf-modal__backdrop" onClick={onClose}>
      <div
        className="pf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        ref={panel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pf-modal__head">
          <h2 className="pf-modal__title" id={headingId}>
            {title}
          </h2>
          <button
            type="button"
            className="pf-modal__close"
            onClick={onClose}
            aria-label={t('pages.portfolio.closeDetails')}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="pf-modal__body">{children}</div>
      </div>
    </div>
  );
}
