// Crop icons for the "My crops" cards — one emoji per crop, so a farmer scanning ten cards
// finds their brinjal by shape before they read a word.
//
// THE RULES THIS MAP OBEYS (they are what keep it honest and readable in the field):
//
//  1. FAMILY-LEVEL, NEVER CROP-SPECIFIC FICTION. Where no glyph exists for the exact crop,
//     the crop takes its family's glyph (every gourd is 🥒, every tree fruit 🌳) and where
//     not even that is true it takes the neutral seedling. Two crops in one family sharing
//     a glyph is fine — they are told apart by the NAME beside it. Inventing a glyph that
//     depicts the wrong plant is not.
//  2. EMOJI 12.0 (2019) CEILING. Every glyph here shipped with Android 10 or earlier. The
//     tempting newer ones — 🫘 beans (Emoji 14), 🫚 ginger root (15), 🫑 bell pepper (13) —
//     render as an empty "tofu" box on the mid-range phones this app is built for, and a
//     broken box beside a crop name looks like a bug. Beans, okra, beetroot and radish
//     therefore take the seedling rather than a box. If commissioned SVG art ever replaces
//     this file, that constraint goes away with it.
//  3. THE ICON IS DECORATIVE. It is rendered aria-hidden and is never part of an accessible
//     name (see WatchlistCard) — a screen-reader user hears "Brinjal", not "aubergine
//     Brinjal". It carries no meaning that the text does not already carry.
//
// LOOKUP ORDER: crop code -> name keywords -> seedling.
// BY_CODE was built from the LIVE crop registry (96 crops, read from /api/crops/get/all on
// 2026-07-29), so it is a snapshot of real codes and not a guess — including the registry's
// own spellings ("Avacado", "Raddish", "Nnolkhol") which the name rules would miss. It holds
// only the crops that resolve to a real glyph; everything else falls through on purpose.
// A code the map does not know (a newly registered crop, or an environment whose codes
// differ) simply falls through to the name rules, which are environment-independent.

/** Shown when nothing else matches: a young plant, which is true of every crop here. */
export const FALLBACK_CROP_ICON = '🌱';

/** Verified against the live registry — see the header. Keys are crop codes. */
const BY_CODE: Record<string, string> = {
  FRT000001: '🌳', // Ambarella
  FRT000002: '🥑', // Avacado
  FRT000003: '🍌', // Banana - Abul
  FRT000004: '🍌', // Banana - Ambun
  FRT000005: '🍌', // Banana - Kolikuttu
  FRT000006: '🍌', // Banana - Sini
  FRT000007: '🥥', // Coconut
  FRT000008: '🌳', // Gooseberry
  FRT000009: '🌳', // Guava
  FRT000010: '🌳', // Indian bael
  FRT000011: '🌳', // Jackfruit
  FRT000012: '🥥', // King Coconut
  FRT000013: '🍋', // Lime
  FRT000014: '🥭', // Mango - Karatha Kolomban
  FRT000015: '🥭', // Mango - Malu
  FRT000016: '🥭', // Mango- Other
  FRT000017: '🥭', // Mango- TJC
  FRT000018: '🍈', // Papaya
  FRT000019: '🌳', // Passion
  FRT000021: '🍍', // Pineapple
  FRT000022: '🍌', // Red Banana
  FRT000023: '🌳', // Soursop
  FRT000024: '🌳', // Tamarind
  FRT000025: '🍉', // Watermelon
  FRT000026: '🌳', // Woodapple
  VEG000001: '🍌', // Ash Plantain
  VEG000002: '🥬', // Athugowa
  VEG000007: '🧅', // Big Onion
  VEG000008: '🧅', // Big Onion Import
  VEG000009: '🧅', // Big Onion Lanka
  VEG000010: '🥒', // Bitter Gourd
  VEG000011: '🌾', // Black Pepper
  VEG000012: '🍆', // Brinjal
  VEG000013: '🎃', // Butternut Squash
  VEG000014: '🥬', // Cabbage
  VEG000015: '🌶️', // Capsicum
  VEG000016: '🥕', // Carrot - Jaffna
  VEG000017: '🥦', // Cauliflower
  VEG000018: '🥒', // Chaw - Chaw
  VEG000019: '🍈', // Cooking Melon
  VEG000020: '🌽', // Corns
  VEG000021: '🌾', // Cowpea
  VEG000022: '🥒', // Cucumber
  VEG000023: '🌿', // Curry Leaves
  VEG000024: '🌿', // Drumsticks
  VEG000025: '🌶️', // Dry Chillies
  VEG000026: '🍆', // Eggplant
  VEG000027: '🌾', // Finger Millet
  VEG000028: '🌾', // Ginger
  VEG000029: '🌿', // Gotukola
  VEG000030: '🌾', // Gram
  VEG000031: '🌶️', // Green Chili
  VEG000032: '🌾', // Green Gram
  VEG000033: '🍠', // Kiriala
  VEG000034: '🌿', // Kohila
  VEG000036: '🧅', // Leeks
  VEG000037: '🌿', // Lettuce
  VEG000039: '🥔', // Manioc
  VEG000040: '🌿', // Mukunuwenna
  VEG000041: '🌶️', // Nai Miris
  VEG000042: '🥬', // Nnolkhol
  VEG000043: '🥕', // Nuwaraeliya Carrot
  VEG000044: '🌿', // Onion Leaves
  VEG000045: '🥜', // Peanuts
  VEG000046: '🍌', // Plantain Flower
  VEG000047: '🥔', // Potatoes - Import
  VEG000048: '🥔', // Potatoes - Jaffna
  VEG000049: '🥔', // Potatoes - Nuwaraeliya
  VEG000050: '🥔', // Potatoes - Walimada
  VEG000051: '🎃', // Pumpkin - Big
  VEG000052: '🎃', // Pumpkin - Malashian
  VEG000054: '🥬', // Red Cabbage
  VEG000055: '🧅', // Red Onion Import
  VEG000056: '🧅', // Red Onion- Lanka
  VEG000057: '🥒', // Ridge Gourd
  VEG000058: '🌾', // Sesame
  VEG000059: '🥒', // Snake Gourd
  VEG000060: '🌾', // Soya Bean
  VEG000061: '🍠', // Sweet Potato
  VEG000062: '🍆', // Thai Eggplant
  VEG000063: '🍆', // Thithbatu
  VEG000064: '🍆', // Thumbakarawila
  VEG000065: '🍅', // Tomato
  VEG000066: '🌾', // Turmeric
  VEG000067: '🌿', // Water Spinach
  VEG000068: '🥔', // Wild -Baby Potato
  VEG000071: '🧄', // Garlic
};

/**
 * Name keywords, FIRST MATCH WINS — so the order is part of the meaning:
 * "sweet potato" must be tested before "potato", and the leafy rule before nothing else
 * claims "leaves". These carry the local names a farmer's crop may be registered under
 * (karawila, murunga, mukunuwenna, miris, kiri ala) as well as the English ones, because a
 * renamed or newly registered crop reaches this list, not the code map.
 */
const NAME_RULES: Array<[RegExp, string]> = [
  [/tomato|takkali/i, '🍅'],
  [/brinjal|eggplant|aubergine|wambatu|thithbatu|thumbakarawila|batu/i, '🍆'],
  [/carrot/i, '🥕'],
  [/sweet ?potato|bathala|innala|kiri ?ala|kiriala/i, '🍠'],
  [/potato|manioc|cassava|artapal/i, '🥔'],
  [/cauliflower|broccoli/i, '🥦'],
  [/cabbage|gova|knol|kohl|nnolkhol|athugowa/i, '🥬'],
  [
    /gotukola|mukunuwenna|spinach|kangkung|kankun|lettuce|curry ?leaves|onion ?leaves|drumstick|murunga|kohila|leaves|nivithi/i,
    '🌿',
  ],
  // "Bell pepper" is a capsicum, NOT the spice: it has to be claimed here, because the
  // grain-and-spice rule below owns the bare word "pepper" (for black pepper).
  [/chilli|chili|chillies|miris|capsicum|bell ?pepper/i, '🌶️'],
  [/garlic|sudu ?lunu/i, '🧄'],
  [/onion|lunu|leek/i, '🧅'],
  [/cucumber|gourd|karawila|pathola|chaw|kekiri ?gourd/i, '🥒'],
  [/pumpkin|wattakka|squash/i, '🎃'],
  [/corn|maize|bada ?iringu/i, '🌽'],
  // "embul KESEL" is the banana; "embul AMBA" is a mango, so the local word cannot stand on
  // its own here.
  [/banana|plantain|kesel|embul ?kesel/i, '🍌'],
  [/pineapple|annasi/i, '🍍'],
  // TWO traps in one line: "mangosteen" is not a mango (the tree-fruit rule takes it, and
  // the lookahead keeps this rule off it), and "Ambarella" contains "amba" without being
  // one — hence the word boundaries.
  [/mango(?!steen)|\bamba\b/i, '🥭'],
  [/avocado|avacado|aligator ?pear/i, '🥑'],
  [/lime|lemon|dehi/i, '🍋'],
  [/watermelon|komadu/i, '🍉'],
  [/melon|papaya|papaw|pawpaw|pepol|kekiri/i, '🍈'],
  [/coconut|pol\b/i, '🥥'],
  [/peanut|groundnut|rata ?kaju/i, '🥜'],
  [/millet|sesame|thala\b|soya|gram|cowpea|pepper|turmeric|kaha\b|ginger|inguru/i, '🌾'],
  [/ambarella|gooseberry|nelli|guava|pera\b|bael|beli\b|jackfruit|kos\b|passion|soursop|tamarind|siyambala|wood ?apple|divul|mangosteen/i, '🌳'],
];

/**
 * Every glyph this module can return — DERIVED from the two lookups above, never listed by
 * hand. The Emoji 12.0 ceiling in the header is only a rule if something enforces it over
 * the whole vocabulary, and a parallel hand-kept list enforces nothing: a glyph added to
 * BY_CODE but missing from the list simply would not be scanned, which is exactly the case
 * the check exists for. Reading the tables means a new icon reaches the ceiling test the
 * moment it is added to either one.
 */
export const CROP_ICONS: readonly string[] = [
  ...new Set([...Object.values(BY_CODE), ...NAME_RULES.map(([, icon]) => icon), FALLBACK_CROP_ICON]),
];

/**
 * The icon for one crop. Pure and total: every crop gets something, and nothing throws on a
 * missing code or an empty name.
 */
export function cropIcon(crop: { cropCode?: string | null; cropName?: string | null }): string {
  const code = crop.cropCode?.trim().toUpperCase();
  if (code && BY_CODE[code]) return BY_CODE[code];
  const name = crop.cropName ?? '';
  for (const [re, icon] of NAME_RULES) {
    if (re.test(name)) return icon;
  }
  return FALLBACK_CROP_ICON;
}
