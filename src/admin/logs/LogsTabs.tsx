// Accessible route-driven tab strip for the admin Logs hub (Phase 1). Each tab is a
// react-router NavLink, so "selected" state is the ROUTE — not local state — and a
// deep-link / refresh lands on the right tab. Implements the WAI-ARIA tabs pattern
// with MANUAL activation: role="tablist"/"tab" + aria-selected, roving tabindex (only
// the selected tab is in the Tab order), and Left/Right/Home/End move focus between
// tabs. Activation (route change) happens on Enter/Space/click via the link itself.
// On mobile (<600px) the strip scrolls horizontally rather than wrapping.
import { forwardRef, useRef, type KeyboardEvent } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export interface LogsTab {
  to: string;
  labelKey: string;
  /** i18n key of the tab's one-paragraph explainer, shown as a hover/focus tooltip. */
  hintKey: string;
}

// The router renders every tab's content into the SAME panel region (LogsPage's
// <Outlet/> wrapper), so all tabs point at one shared tabpanel id.
export const LOGS_TABPANEL_ID = 'logs-tabpanel';

/** Stable DOM id for a tab, derived from the last route segment. */
export function logsTabId(to: string): string {
  return `logs-tab-${to.split('/').filter(Boolean).pop() ?? 'index'}`;
}

/** Stable DOM id for a tab's tooltip. */
export function logsTabTipId(to: string): string {
  return `${logsTabId(to)}-tip`;
}

/** One tab link. Uses useMatch (end: true) so aria-selected/tabindex track the route.
 * The tab's explainer renders as a sibling tooltip (CSS shows it on hover/focus-within;
 * hidden on touch devices, where LogsPage's ⓘ toggle carries the same text instead).
 * The tooltip lives OUTSIDE the link so it never joins the tab's accessible name —
 * it is attached as the tab's description via aria-describedby. */
const LogsTabLink = forwardRef<HTMLAnchorElement, { tab: LogsTab; label: string; hint: string }>(
  function LogsTabLink({ tab, label, hint }, ref) {
    const selected = useMatch({ path: tab.to, end: true }) !== null;
    return (
      <span className="logs-tab-wrap">
        <NavLink
          ref={ref}
          to={tab.to}
          id={logsTabId(tab.to)}
          role="tab"
          aria-selected={selected}
          aria-controls={LOGS_TABPANEL_ID}
          aria-describedby={logsTabTipId(tab.to)}
          // Roving tabindex: only the selected tab is tabbable; arrow keys reach the rest.
          tabIndex={selected ? 0 : -1}
          className={({ isActive }) => `logs-tab${isActive ? ' is-active' : ''}`}
        >
          {label}
        </NavLink>
        <span role="tooltip" id={logsTabTipId(tab.to)} className="logs-tab-tip">
          {hint}
        </span>
      </span>
    );
  },
);

export default function LogsTabs({ tabs, ariaLabel }: { tabs: LogsTab[]; ariaLabel: string }) {
  const { t } = useTranslation();
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);

  function focusTab(index: number) {
    const n = tabs.length;
    if (n === 0) return;
    const wrapped = ((index % n) + n) % n; // wrap both ends
    refs.current[wrapped]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
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
        focusTab(tabs.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="logs-tabs" role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {tabs.map((tab, i) => (
        <LogsTabLink
          key={tab.to}
          tab={tab}
          label={t(tab.labelKey)}
          hint={t(tab.hintKey)}
          ref={(el) => {
            refs.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}
