import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../i18n';
import TextSizeToggle from '../components/TextSizeToggle';
import { LARGE_TEXT_CLASS, readLargeText } from '../lib/storage';

describe('TextSizeToggle (FE-16 large-text a11y)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    document.documentElement.classList.remove(LARGE_TEXT_CLASS);
  });
  afterEach(() => vi.restoreAllMocks());

  it('toggles the root class + aria-pressed and persists the choice', () => {
    render(<TextSizeToggle />);
    const btn = screen.getByRole('button', { name: 'Larger text' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.classList.contains(LARGE_TEXT_CLASS)).toBe(true);
    expect(readLargeText()).toBe(true);

    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.classList.contains(LARGE_TEXT_CLASS)).toBe(false);
    expect(readLargeText()).toBe(false);
  });

  it('initialises pressed when the preference was already stored', () => {
    localStorage.setItem('agriforecast.textSize', JSON.stringify({ v: 1, large: true }));
    render(<TextSizeToggle />);
    expect(screen.getByRole('button', { name: 'Larger text' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('stays harmless when storage writes throw', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(<TextSizeToggle />);
    const btn = screen.getByRole('button', { name: 'Larger text' });
    expect(() => fireEvent.click(btn)).not.toThrow();
    // the class still toggles even though persistence failed
    expect(document.documentElement.classList.contains(LARGE_TEXT_CLASS)).toBe(true);
  });
});
