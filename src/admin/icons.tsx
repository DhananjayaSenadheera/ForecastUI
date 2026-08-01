// Shared action icons: inline SVGs with stroke=currentColor so an icon always matches its
// button's text colour. All are aria-hidden — the button's own name is the label, never the
// glyph.
//
// APP-WIDE, not admin-only, since the table skin: the farmer's sales table wears the same
// pencil and trash as the admin console, because one product should not have two alphabets for
// "change this" and "remove this". Rollup already emitted this module as its own shared chunk
// (assets/icons-*.js, 0.48 kB gz) before that happened, so the reuse costs the farmer nothing
// but the request they were already making on the admin side.
//
// Every icon takes SVG props and spreads them LAST, so a caller can resize or re-class one
// without touching these defaults: the admin console's 14px + .adm-btn-ico is what you get
// when you pass nothing, and the farmer's 44px row buttons ask for 20px instead (a 14px glyph
// is not legible at arm's length in sunlight, which is the farmer app's floor).
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
export function IconEdit(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

// Trash can — delete.
export function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

// Filled triangle — start / run now. Filled (not outlined) so it still reads as "play"
// at 14px and in high-contrast sunlight.
export function IconPlay(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <path d="M7 4.5 19 12 7 19.5z" />
    </svg>
  );
}

// Filled square — stop. Same fill reasoning as IconPlay.
export function IconStop(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

// Circular arrows — refresh / reload.
export function IconRefresh(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
