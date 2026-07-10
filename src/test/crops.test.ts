import { describe, it, expect } from 'vitest';
import type { Crop } from '../api/types';
import {
  categoryLabelKey,
  cropDisplayName,
  filterCrops,
  groupCropsByCategory,
} from '../lib/crops';
import { cropArtKey } from '../components/cropArt';

function crop(partial: Partial<Crop> & { id: string; name: string }): Crop {
  return {
    externalProductId: null,
    source: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

const tomato = crop({ id: '1', name: 'Tomato', nameSi: 'තක්කාලි', nameTa: 'தக்காளி', category: { code: 'VEG', name: 'Vegetable' }, cropCode: 'VEG000003' });
const banana = crop({ id: '2', name: 'Banana', nameSi: 'කෙසෙල්', category: { code: 'FRT', name: 'Fruit' }, cropCode: 'FRT000002' });
const bare = crop({ id: '3', name: 'Okra' }); // no category, no localized names

describe('cropDisplayName (localized, graceful fallback)', () => {
  it('returns the localized name when present for the active language', () => {
    expect(cropDisplayName(tomato, 'si')).toBe('තක්කාලි');
    expect(cropDisplayName(tomato, 'ta')).toBe('தக்காளி');
    expect(cropDisplayName(tomato, 'en')).toBe('Tomato');
  });
  it('falls back to English name when a localized name is missing', () => {
    expect(cropDisplayName(banana, 'ta')).toBe('Banana'); // no Tamil name
    expect(cropDisplayName(bare, 'si')).toBe('Okra');
  });
});

describe('filterCrops (multi-script search)', () => {
  const list = [tomato, banana, bare];
  it('returns the full list for an empty query', () => {
    expect(filterCrops(list, '   ')).toHaveLength(3);
  });
  it('matches on the English name case-insensitively', () => {
    expect(filterCrops(list, 'toma').map((c) => c.id)).toEqual(['1']);
  });
  it('matches on a Sinhala/Tamil name too', () => {
    expect(filterCrops(list, 'කෙසෙල්').map((c) => c.id)).toEqual(['2']);
    expect(filterCrops(list, 'தக்காளி').map((c) => c.id)).toEqual(['1']);
  });
  it('returns empty when nothing matches', () => {
    expect(filterCrops(list, 'zzz')).toEqual([]);
  });
});

describe('groupCropsByCategory (graceful degradation)', () => {
  it('groups by category preserving first-seen order', () => {
    const groups = groupCropsByCategory([tomato, banana]);
    expect(groups.map((g) => g.code)).toEqual(['VEG', 'FRT']);
    expect(groups[0].crops).toHaveLength(1);
  });
  it('collapses to a single null-coded group when no crop has a category', () => {
    const groups = groupCropsByCategory([bare]);
    expect(groups).toHaveLength(1);
    expect(groups[0].code).toBeNull();
  });
  it('returns no groups for an empty list', () => {
    expect(groupCropsByCategory([])).toEqual([]);
  });
});

describe('categoryLabelKey', () => {
  it('maps veg/fruit codes to i18n keys and everything else to catAll', () => {
    expect(categoryLabelKey('VEG')).toBe('crop.catVegetables');
    expect(categoryLabelKey('VEG-UP')).toBe('crop.catVegetables');
    expect(categoryLabelKey('FRT')).toBe('crop.catFruits');
    expect(categoryLabelKey(null)).toBe('crop.catAll');
  });
});

describe('cropArtKey (illustration lookup)', () => {
  it('resolves known crops by name keyword', () => {
    expect(cropArtKey({ name: 'Tomato', cropCode: null })).toBe('tomato');
    expect(cropArtKey({ name: 'Green Chilli', cropCode: null })).toBe('chilli');
    expect(cropArtKey({ name: 'Banana', cropCode: null })).toBe('banana');
  });
  it('falls back to the generic sprout for unknown crops', () => {
    expect(cropArtKey({ name: 'Dragonfruit', cropCode: null })).toBe('generic');
  });
});
