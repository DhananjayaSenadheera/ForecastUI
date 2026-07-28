// The WAI-ARIA tabs keyboard pattern, once. Three strips were carrying byte-identical
// copies of it (the Logs hub, the System-log group filter, and now the market tabs on a
// crop card), which is three places for the same arrow key to stop working.
//
// Manual activation, roving tabindex: only the selected tab is in the Tab order, arrows and
// Home/End MOVE FOCUS between tabs, and selecting is the tab's own onClick (a link follow,
// or a state change). Focus wraps at both ends — a farmer holding "right" on a two-tab strip
// should not get stuck.
//
// This owns the keys only. Each strip keeps its own markup, ids and classes, because a card
// tab and an admin route tab are the same interaction and deliberately not the same object.
import { useRef, type KeyboardEvent, type MutableRefObject } from 'react';

export interface RovingTabs<T extends HTMLElement> {
  /** Attach with `ref={(el) => { refs.current[i] = el; }}` on each tab, in strip order. */
  refs: MutableRefObject<Array<T | null>>;
  /** Put on the element carrying role="tablist". */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

export function useRovingTabs<T extends HTMLElement>(count: number): RovingTabs<T> {
  const refs = useRef<Array<T | null>>([]);

  function focusTab(index: number) {
    if (count === 0) return;
    const wrapped = ((index % count) + count) % count; // wrap both ends
    refs.current[wrapped]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    // Driven by the FOCUSED tab, not by the selected one: with manual activation those two
    // are routinely different while the farmer is arrowing along the strip.
    const current = refs.current.findIndex((el) => el === document.activeElement);
    if (current === -1) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusTab(current + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusTab(current - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusTab(0);
        break;
      case 'End':
        e.preventDefault();
        focusTab(count - 1);
        break;
      default:
        break;
    }
  }

  return { refs, onKeyDown };
}
