// System log — sub-tab strip (All / Sign-ins / User management / Content changes).
//
// Same WAI-ARIA tabs pattern as the hub's LogsTabs (role=tablist/tab, MANUAL activation,
// roving tabindex, Left/Right/Up/Down/Home/End move focus, Enter/Space activates) but a
// LOCAL-STATE control, not a router: these tabs narrow WHICH EVENTS the one page shows,
// they do not change route. The active group is mirrored into ?group= by the page so a
// deep link and a reload land on the same view.
//
// The ids are deliberately namespaced `syslog-group-*` so they can NEVER collide with
// logsTabId()'s route-segment ids (`logs-tab-user-activity`) — this strip renders INSIDE
// the hub's tabpanel, so two tab strips share one document.
//
// Visually a segmented pill control, NOT the hub's underlined route tabs: two identical
// looking strips stacked would read as "which page am I on?" twice. Pills say "filter".
import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  USER_ACTIVITY_CONTENT_EVENT_TYPES,
  USER_ACTIVITY_SIGN_IN_EVENT_TYPES,
  USER_ACTIVITY_USER_MGMT_EVENT_TYPES,
} from '../../api/types';

export interface ActivityGroup {
  /** URL-safe slug — the ?group= value and the DOM id suffix. */
  id: string;
  labelKey: string;
  /** Wire strings this group shows; null = no filter at all (everything). */
  types: readonly string[] | null;
}

/** Group -> wire strings. `all` sends NO filter, so a future event type this build has
 *  never heard of still shows up under All instead of vanishing from the log. */
export const ACTIVITY_GROUPS: readonly ActivityGroup[] = [
  { id: 'all', labelKey: 'admin.logs.userActivity.groups.all', types: null },
  {
    id: 'sign-ins',
    labelKey: 'admin.logs.userActivity.groups.signIns',
    types: USER_ACTIVITY_SIGN_IN_EVENT_TYPES,
  },
  {
    id: 'user-management',
    labelKey: 'admin.logs.userActivity.groups.userManagement',
    types: USER_ACTIVITY_USER_MGMT_EVENT_TYPES,
  },
  {
    id: 'content-changes',
    labelKey: 'admin.logs.userActivity.groups.contentChanges',
    types: USER_ACTIVITY_CONTENT_EVENT_TYPES,
  },
];

export const ACTIVITY_GROUP_PANEL_ID = 'syslog-group-panel';

/** Stable DOM id for a group tab. Namespaced away from logsTabId(). */
export function activityGroupTabId(id: string): string {
  return `syslog-group-tab-${id}`;
}

/** Resolve a raw ?group= value to a known group; anything unrecognised (typo, stale
 *  bookmark, removed group) falls back to All rather than showing an empty page. */
export function resolveActivityGroup(raw: string | null): ActivityGroup {
  return ACTIVITY_GROUPS.find((g) => g.id === raw) ?? ACTIVITY_GROUPS[0];
}

export default function ActivityGroupTabs({
  groups,
  activeId,
  onSelect,
  ariaLabel,
}: {
  groups: readonly ActivityGroup[];
  activeId: string;
  onSelect: (group: ActivityGroup) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    const n = groups.length;
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
        focusTab(groups.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="syslog-groups" role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {groups.map((group, i) => {
        const selected = group.id === activeId;
        return (
          <button
            key={group.id}
            type="button"
            id={activityGroupTabId(group.id)}
            role="tab"
            aria-selected={selected}
            aria-controls={ACTIVITY_GROUP_PANEL_ID}
            // Roving tabindex: only the selected tab is in the Tab order.
            tabIndex={selected ? 0 : -1}
            className={`syslog-group${selected ? ' is-active' : ''}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            onClick={() => onSelect(group)}
          >
            {t(group.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
