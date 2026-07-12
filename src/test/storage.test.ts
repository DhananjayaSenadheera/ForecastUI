import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  STORAGE_KEYS,
  readLastHarvest,
  writeLastHarvest,
  readRecentCrops,
  pushRecentCrop,
  readLargeText,
  writeLargeText,
  applyStoredTextSize,
  LARGE_TEXT_CLASS,
} from '../lib/storage';

describe('lib/storage (FE-16 namespaced localStorage helpers)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove(LARGE_TEXT_CLASS);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips the last-harvest crop + date under a versioned key', () => {
    expect(readLastHarvest()).toBeNull();
    writeLastHarvest('crop-1', '2026-07-10');
    expect(readLastHarvest()).toEqual({ cropId: 'crop-1', plantDate: '2026-07-10' });
    // stored blob carries the version marker
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.lastHarvest)!)).toMatchObject({ v: 1 });
  });

  it('rejects a wrong-version / malformed last-harvest blob', () => {
    localStorage.setItem(STORAGE_KEYS.lastHarvest, JSON.stringify({ v: 99, cropId: 'x', plantDate: '2026-01-01' }));
    expect(readLastHarvest()).toBeNull();
    localStorage.setItem(STORAGE_KEYS.lastHarvest, 'not json');
    expect(readLastHarvest()).toBeNull();
  });

  it('pushes recent crops most-recent-first, deduped and capped at 3', () => {
    expect(readRecentCrops()).toEqual([]);
    pushRecentCrop('a');
    pushRecentCrop('b');
    expect(pushRecentCrop('a')).toEqual(['a', 'b']); // re-pick moves to front, no dupe
    pushRecentCrop('c');
    expect(pushRecentCrop('d')).toEqual(['d', 'c', 'a']); // capped at 3
    expect(readRecentCrops()).toEqual(['d', 'c', 'a']);
  });

  it('round-trips the large-text preference', () => {
    expect(readLargeText()).toBe(false);
    writeLargeText(true);
    expect(readLargeText()).toBe(true);
    writeLargeText(false);
    expect(readLargeText()).toBe(false);
  });

  it('applyStoredTextSize toggles the root class from the stored value', () => {
    writeLargeText(true);
    applyStoredTextSize();
    expect(document.documentElement.classList.contains(LARGE_TEXT_CLASS)).toBe(true);
    writeLargeText(false);
    applyStoredTextSize();
    expect(document.documentElement.classList.contains(LARGE_TEXT_CLASS)).toBe(false);
  });

  it('degrades silently when localStorage throws (private mode / quota)', () => {
    const boom = () => {
      throw new Error('SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);

    // No throw on read OR write; readers fall back to safe defaults.
    expect(() => writeLastHarvest('c', '2026-07-10')).not.toThrow();
    expect(readLastHarvest()).toBeNull();
    expect(() => pushRecentCrop('c')).not.toThrow();
    expect(readRecentCrops()).toEqual([]);
    expect(() => writeLargeText(true)).not.toThrow();
    expect(readLargeText()).toBe(false);
  });
});
