// Route-driven tab strip for the Logs hub. Each tab is a NavLink, so "selected" is the
// route and a deep link or refresh lands on the right tab. WAI-ARIA tabs pattern with
// manual activation: roving tabindex (only the selected tab is tabbable), arrows/Home/
// End move focus, Enter/Space follows the link.
import { forwardRef } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRovingTabs } from '../../lib/tabs';

export interface LogsTab {
  to: string;
  labelKey: string;
  /** i18n key of the tab's one-paragraph explainer, shown as a hover/focus tooltip. */
  hintKey: string;
}

// Every tab renders into the SAME panel (LogsPage's <Outlet/>), so they all point at
// one shared tabpanel id.
export const LOGS_TABPANEL_ID = 'logs-tabpanel';

/** Stable DOM id for a tab, derived from the last route segment. */
export function logsTabId(to: string): string {
  return `logs-tab-${to.split('/').filter(Boolean).pop() ?? 'index'}`;
}

/** Stable DOM id for a tab's tooltip. */
export function logsTabTipId(to: string): string {
  return `${logsTabId(to)}-tip`;
}

/** One tab link. useMatch keeps aria-selected/tabindex in step with the route. The
 *  explainer tooltip is a SIBLING of the link, attached via aria-describedby, so it
 *  never joins the tab's accessible name. */
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
  const { refs, onKeyDown } = useRovingTabs<HTMLAnchorElement>(tabs.length);

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
