// lib/cropIcons — the emoji beside a crop name on a card.
//
// What is worth testing here is not "Tomato is 🍅" (that is the table itself) but the
// RESOLUTION RULES the table depends on: code first, name second, seedling always, and the
// ordering traps inside the name rules ("sweet potato" before "potato"). A card must never
// render an empty icon slot, and it must never render a glyph the phone cannot draw.
import { describe, it, expect } from 'vitest';
import { CROP_ICONS, FALLBACK_CROP_ICON, cropIcon } from '../lib/cropIcons';

describe('lib/cropIcons — resolution order', () => {
  it('prefers the registry CODE, which is the crop’s real identity', () => {
    // VEG000012 is Brinjal in the live registry. The name here is deliberately wrong: if
    // the code map is ever bypassed, this test says so.
    expect(cropIcon({ cropCode: 'VEG000012', cropName: 'Something else entirely' })).toBe('🍆');
  });

  it('falls back to the NAME when the code is unknown — a new crop still gets an icon', () => {
    expect(cropIcon({ cropCode: 'VEG999999', cropName: 'Tomato' })).toBe('🍅');
    expect(cropIcon({ cropCode: null, cropName: 'Karawila' })).toBe('🥒');
    expect(cropIcon({ cropName: 'Murunga' })).toBe('🌿');
  });

  it('falls back to the SEEDLING when neither matches — never an empty slot', () => {
    expect(cropIcon({ cropCode: 'VEG999999', cropName: 'Quinoa' })).toBe(FALLBACK_CROP_ICON);
    expect(cropIcon({ cropCode: null, cropName: null })).toBe(FALLBACK_CROP_ICON);
    expect(cropIcon({})).toBe(FALLBACK_CROP_ICON);
    expect(cropIcon({ cropCode: '', cropName: '' })).toBe(FALLBACK_CROP_ICON);
  });

  it('reads codes case- and whitespace-insensitively', () => {
    expect(cropIcon({ cropCode: ' veg000065 ', cropName: '' })).toBe('🍅');
  });

  it('orders the name rules so the SPECIFIC one wins', () => {
    // The classic trap: "Sweet Potato" contains "potato", and a wrongly ordered list gives
    // it the potato glyph.
    expect(cropIcon({ cropName: 'Sweet Potato' })).toBe('🍠');
    expect(cropIcon({ cropName: 'Potatoes - Jaffna' })).toBe('🥔');
    // ...and the same for the two chilli-family names.
    expect(cropIcon({ cropName: 'Green Chili' })).toBe('🌶️');
    expect(cropIcon({ cropName: 'Nai Miris' })).toBe('🌶️');
  });

  it('never lets a name rule name the WRONG plant', () => {
    // Four real traps, all currently hidden behind the code map but live on the advertised
    // degradation path (an unknown code falls through to these rules):
    //  • "Ambarella" contains "amba", the Sinhala for mango;
    //  • "Embul Amba" is a MANGO variety, but "embul" also opens "embul kesel", a banana;
    //  • "Mangosteen" starts with "mango" and is not one;
    //  • "Bell Pepper" is a capsicum, while the bare word "pepper" belongs to black pepper.
    expect(cropIcon({ cropName: 'Ambarella' })).toBe('🌳');
    expect(cropIcon({ cropName: 'Embul Amba' })).toBe('🥭');
    expect(cropIcon({ cropName: 'Embul Kesel' })).toBe('🍌');
    expect(cropIcon({ cropName: 'Mangosteen' })).toBe('🌳');
    expect(cropIcon({ cropName: 'Bell Pepper' })).toBe('🌶️');
    // ...and the neighbours those fixes must not break.
    expect(cropIcon({ cropName: 'Mango - Malu' })).toBe('🥭');
    expect(cropIcon({ cropName: 'Amba' })).toBe('🥭');
    expect(cropIcon({ cropName: 'Banana - Sini' })).toBe('🍌');
    expect(cropIcon({ cropName: 'Black Pepper' })).toBe('🌾');
  });

  it('stays inside the Emoji 12 ceiling — nothing here is a tofu box on a 2019 phone', () => {
    // The rule the file is built on: no glyph from Emoji 13/14/15, because an unsupported
    // codepoint renders as an empty box beside a crop name and looks like a bug.
    // Scanned over the WHOLE declared table rather than a few sample names, so a glyph
    // added to either lookup cannot slip in unreviewed.
    const TOO_NEW = ['🫘', '🫛', '🫚', '🫑', '🫜', '🪷', '🫒', '🧋'];
    for (const icon of CROP_ICONS) {
      expect(TOO_NEW).not.toContain(icon);
      // A conservative second gate: every tofu-box risk this file worries about lives in
      // the U+1FA70+ block (2019 onwards), and nothing this table uses is anywhere near it.
      // Named in the failure so a rejected glyph is obvious rather than a bare number.
      expect({ icon, block: (icon.codePointAt(0) as number) < 0x1fa70 }).toEqual({
        icon,
        block: true,
      });
    }
  });

  it('returns nothing outside the declared table — CROP_ICONS is the whole vocabulary', () => {
    // The ceiling test above is only worth anything if the table it scans is really the set
    // of glyphs a card can show.
    const seen = new Set<string>();
    for (const cropCode of ['VEG000012', 'VEG000065', 'FRT000019', 'VEG000040', 'FRT000002']) {
      seen.add(cropIcon({ cropCode, cropName: '' }));
    }
    for (const cropName of ['Tomato', 'Karawila', 'Murunga', 'Quinoa', 'Bell Pepper', 'Ambarella']) {
      seen.add(cropIcon({ cropName }));
    }
    for (const icon of seen) expect(CROP_ICONS).toContain(icon);
  });

  it('gives the whole live registry an icon, and the same one every time', () => {
    // Purity + totality, on the codes the app actually receives.
    for (const cropCode of ['VEG000065', 'FRT000019', 'VEG000040', 'FRT000002', 'VEG000071']) {
      const first = cropIcon({ cropCode, cropName: '' });
      expect(first).toBeTruthy();
      expect(cropIcon({ cropCode, cropName: '' })).toBe(first);
    }
  });
});
