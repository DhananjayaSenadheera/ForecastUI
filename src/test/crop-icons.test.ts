// lib/cropIcons — the emoji beside a crop name on a card.
//
// What is worth testing here is not "Tomato is 🍅" (that is the table itself) but the
// RESOLUTION RULES the table depends on: code first, name second, seedling always, and the
// ordering traps inside the name rules ("sweet potato" before "potato"). A card must never
// render an empty icon slot, and it must never render a glyph the phone cannot draw.
import { describe, it, expect } from 'vitest';
import { FALLBACK_CROP_ICON, cropIcon } from '../lib/cropIcons';

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

  it('stays inside the Emoji 12 ceiling — nothing here is a tofu box on a 2019 phone', () => {
    // The rule the file is built on: no glyph from Emoji 13/14/15, because an unsupported
    // codepoint renders as an empty box beside a crop name and looks like a bug.
    const TOO_NEW = ['🫘', '🫛', '🫚', '🫑', '🫜', '🪷'];
    const names = [
      'Beans',
      'Winged Bean',
      'Ginger',
      'Capsicum',
      'Beetroot - Nuwaraeliya',
      'Raddish',
      "Lady's Fingers",
      'Lotus Roots',
    ];
    for (const cropName of names) {
      expect(TOO_NEW).not.toContain(cropIcon({ cropName }));
    }
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
