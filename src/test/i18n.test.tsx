import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import AppShell from '../components/AppShell';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('i18n language switching', () => {
  it('changes shell strings when the language switcher is used', async () => {
    await i18n.changeLanguage('en');
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);

    // switch to Sinhala via the (first) switcher's සිං button
    const group = screen.getAllByRole('group', { name: 'Language' })[0];
    fireEvent.click(within(group).getByRole('button', { name: 'සිං' }));

    // Sinhala nav label for Overview appears; English one is gone
    expect(screen.getAllByText('දළ විශ්ලේෂණය').length).toBeGreaterThan(0);
    expect(screen.queryByText('Overview')).toBeNull();
    expect(i18n.language).toBe('si');
  });

  it('keeps the frozen confidence contract strings, translating only labels', () => {
    // Contract strings Low/Medium/High are never used as display text.
    expect(i18n.getResource('en', 'translation', 'confidence.good')).toBe('Good');
    expect(i18n.getResource('si', 'translation', 'confidence.low')).toBe('අඩුයි');
    expect(i18n.getResource('ta', 'translation', 'confidence.fair')).toBe('சராசரி');
  });
});
