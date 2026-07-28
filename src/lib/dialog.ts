// Modal-dialog BEHAVIOUR, shared by the admin dialog shell and the farmer "More details"
// popup. `aria-modal="true"` only PROMISES modality — the keyboard and the page have to
// deliver it — so everything that promise implies lives here, once:
//   • focus moves INTO the dialog on open (its first control, else the panel itself);
//   • Tab and Shift+Tab wrap inside it and can never walk out into the page behind;
//   • Escape closes it (with preventDefault, so the key's native meanings — cancelling an
//     open <select> popup, reverting an input — do not also fire as it closes);
//   • the page behind it does not scroll under the farmer's thumb;
//   • focus RETURNS to whatever opened the dialog when it goes away.
//
// It is deliberately a hook over a component: the two surfaces have entirely different
// chrome (an admin form card vs a farmer's full-width sheet) and share nothing visual, but
// a second copy of this keyboard contract is a second copy that can drift out of true.
import { useEffect, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

/** Everything a keyboard can land on. `[tabindex="-1"]` is excluded on purpose: it is
 *  programmatically focusable (the panel itself) but is not a stop in the Tab order. */
export const DIALOG_FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Wire one dialog panel up to the modality contract above.
 *
 * Returns the `onKeyDown` handler the panel must carry. The panel itself must be
 * `tabIndex={-1}` so focus can be sent to it when it holds no controls at all.
 */
export function useDialogBehaviour<T extends HTMLElement>(
  panel: RefObject<T | null>,
  onClose: () => void,
): { onKeyDown: (e: ReactKeyboardEvent<T>) => void } {
  useEffect(() => {
    // Captured on mount so focus can go back where it came from on close.
    const opener = document.activeElement as HTMLElement | null;
    // Focus the first control (a confirm dialog's Cancel, this popup's ✕), else the panel,
    // so a screen reader lands inside the dialog instead of behind it.
    const first = panel.current?.querySelector<HTMLElement>(DIALOG_FOCUSABLE);
    (first ?? panel.current)?.focus();

    // The page behind a modal must not scroll: on a phone the backdrop covers the screen,
    // and a thumb drag that moves the list underneath leaves the farmer somewhere else
    // entirely when the dialog closes. The PREVIOUS value is restored rather than assuming
    // "visible", so a second lock (or a page that sets its own overflow) is not clobbered.
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
      // Only restore focus if it is still ours to move — never yank it from a dialog or a
      // control that has opened since.
      const active = document.activeElement;
      if (!active || active === document.body || panel.current?.contains(active)) {
        opener?.focus?.();
      }
    };
    // Mount/unmount only: re-running this would re-capture the opener and steal focus back
    // to the top of the dialog on every render.
  }, []);

  function onKeyDown(e: ReactKeyboardEvent<T>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE) ?? []);
    if (items.length === 0) {
      e.preventDefault(); // nothing to move to — Tab must not escape the dialog
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    // Wrap at both ends; also pull focus back in if it somehow sits outside.
    if (e.shiftKey && (active === first || !panel.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  return { onKeyDown };
}
