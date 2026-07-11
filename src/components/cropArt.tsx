// =============================================================================
// Crop illustrations (FE-3). Semi-abstract, hand-drawn-feeling inline SVGs.
// RATIONALE (PRD §4): for low-literacy users, simple stroke illustrations beat
// photos — they read fast, scale crisply, and stay tiny. These are PLACEHOLDERS
// for commissioned art; keep each <1KB, stroke-based, drawn in `currentColor`
// so the card controls the hue via CSS (no hard-coded colors here).
//
// Lookup is keyword-based on the crop NAME (English), with a code-prefix hint and
// a guaranteed generic fallback, so a crop the map doesn't know still renders.
// =============================================================================
import type { Crop } from '../api/types';

type Art = { key: string; paths: React.ReactNode };

// Each `paths` fragment is drawn inside a 48×48 viewBox with round stroke joins.
const ART: Art[] = [
  {
    key: 'tomato',
    paths: (
      <>
        <path d="M24 15c-6 0-10 4-10 10s5 10 10 10 10-4 10-10-4-10-10-10Z" />
        <path d="M24 15c0-3-2-5-5-5M24 15c0-3 2-5 5-5M24 15v-4" />
      </>
    ),
  },
  {
    key: 'bean',
    paths: (
      <>
        <path d="M17 12c8 2 12 8 12 16s-4 8-8 6-6-8-4-14 6-8 0-8Z" />
        <path d="M20 18c3 2 5 6 5 11" />
      </>
    ),
  },
  {
    key: 'carrot',
    paths: (
      <>
        <path d="M18 20l8 16 6-14-14-2Z" />
        <path d="M22 20l-3-7M26 19l1-8M30 20l4-6" />
      </>
    ),
  },
  {
    key: 'cabbage',
    paths: (
      <>
        <circle cx="24" cy="26" r="11" />
        <path d="M24 15c-4 4-6 8-6 11M24 15c4 4 6 8 6 11M18 20c-2 3-2 6-1 9M30 20c2 3 2 6 1 9" />
      </>
    ),
  },
  {
    key: 'brinjal',
    paths: (
      <>
        <path d="M30 16c4 4 4 12-2 17s-14 4-16-1 4-13 11-16c3-1 5-2 7 0Z" />
        <path d="M30 16c1-3 3-4 6-4M30 16c-2-2-4-3-6-3" />
      </>
    ),
  },
  {
    key: 'pumpkin',
    paths: (
      <>
        <path d="M24 15c-8 0-13 5-13 11s5 9 13 9 13-3 13-9-5-11-13-11Z" />
        <path d="M18 16c-2 4-2 11 0 17M30 16c2 4 2 11 0 17M24 15v20M24 15c0-3 2-4 5-4" />
      </>
    ),
  },
  {
    key: 'leek',
    paths: (
      <>
        <path d="M22 34c0-6 0-12 2-16M26 34c0-6 0-12-2-16" />
        <path d="M24 18l-4-8M24 18l4-8M24 18v-9" />
        <path d="M20 34h8" />
      </>
    ),
  },
  {
    key: 'beetroot',
    paths: (
      <>
        <path d="M24 18c6 0 10 4 10 9s-5 10-10 10-10-4-10-9 4-10 10-10Z" />
        <path d="M24 18l-3-7M24 18l3-7M24 18v-8M24 37c3 3 6 4 9 4" />
      </>
    ),
  },
  {
    key: 'chilli',
    paths: (
      <>
        <path d="M16 20c2 8 8 14 16 14 3 0 4-3 2-5-8-1-13-6-14-13-1-3-5-2-4 4Z" />
        <path d="M16 16c0-3 3-5 6-4" />
      </>
    ),
  },
  {
    key: 'capsicum',
    paths: (
      <>
        <path d="M16 20c0 9 4 15 8 15s8-6 8-15c0-3-3-5-4-2-1 2-3 2-4 0s-3-1-4 0-3 1-4-1c-1-2-4-1-0 3Z" />
        <path d="M24 18v-5M24 13c0-2 2-3 4-3" />
      </>
    ),
  },
  {
    key: 'banana',
    paths: (
      <>
        <path d="M14 16c2 12 11 20 22 18 2 0 2-2 0-3-9-1-16-8-18-16-1-2-4-1-4 1Z" />
        <path d="M36 31c2 0 3-1 3-3" />
      </>
    ),
  },
  {
    key: 'papaya',
    paths: (
      <>
        <path d="M24 15c-7 0-11 5-11 12s5 9 11 9 11-2 11-9-4-12-11-12Z" />
        <path d="M24 15v-4M24 11c0-2 2-3 4-3" />
        <circle cx="24" cy="27" r="4" />
      </>
    ),
  },
  {
    key: 'generic', // leaf/sprout — used when no specific illustration matches
    paths: (
      <>
        <path d="M24 36V20" />
        <path d="M24 24c-3-4-8-5-12-4 0 5 3 9 8 9 2 0 3-2 4-5Z" />
        <path d="M24 20c3-4 8-5 12-4 0 5-3 9-8 9-2 0-3-2-4-5Z" />
      </>
    ),
  },
];

const ART_BY_KEY = new Map(ART.map((a) => [a.key, a]));

/** Ordered keyword rules → art key. First match wins; falls back to 'generic'. */
const KEYWORD_RULES: Array<[RegExp, string]> = [
  [/tomato|takkali/i, 'tomato'],
  [/bean|bonchi/i, 'bean'],
  [/carrot/i, 'carrot'],
  [/cabbage|gova/i, 'cabbage'],
  [/brinjal|eggplant|aubergine|wambatu/i, 'brinjal'],
  [/pumpkin|wattakka/i, 'pumpkin'],
  [/leek/i, 'leek'],
  [/beet/i, 'beetroot'],
  [/chilli|chili|chilie|miris/i, 'chilli'],
  [/capsicum|pepper|bell/i, 'capsicum'],
  [/banana|kesel|plantain/i, 'banana'],
  [/papaya|papaw|pawpaw|pepol/i, 'papaya'],
];

/** Resolve a crop to an illustration key (pure — unit-tested). */
export function cropArtKey(crop: Pick<Crop, 'name' | 'cropCode'>): string {
  const hay = `${crop.name} ${crop.cropCode ?? ''}`;
  for (const [re, key] of KEYWORD_RULES) {
    if (re.test(hay)) return key;
  }
  return 'generic';
}

/** Decorative crop illustration. aria-hidden — the crop label carries meaning. */
export function CropArt({ crop, className }: { crop: Pick<Crop, 'name' | 'cropCode'>; className?: string }) {
  const art = ART_BY_KEY.get(cropArtKey(crop)) ?? ART_BY_KEY.get('generic')!;
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      width="48"
      height="48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {art.paths}
    </svg>
  );
}
