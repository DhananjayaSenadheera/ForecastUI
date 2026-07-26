// Shared admin action icons: inline SVGs with stroke=currentColor so an icon always
// matches its button's text colour. All are aria-hidden — the button text is the label.
import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
  className: 'adm-btn-ico',
};

// Pencil — edit.
export function IconEdit() {
  return (
    <svg {...base}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

// Trash can — delete.
export function IconTrash() {
  return (
    <svg {...base}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

// Filled triangle — start / run now. Filled (not outlined) so it still reads as "play"
// at 14px and in high-contrast sunlight.
export function IconPlay() {
  return (
    <svg {...base} fill="currentColor">
      <path d="M7 4.5 19 12 7 19.5z" />
    </svg>
  );
}

// Filled square — stop. Same fill reasoning as IconPlay.
export function IconStop() {
  return (
    <svg {...base} fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

// Circular arrows — refresh / reload.
export function IconRefresh() {
  return (
    <svg {...base}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
