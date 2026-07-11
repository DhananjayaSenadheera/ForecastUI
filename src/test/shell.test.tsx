import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';
import i18n from '../i18n';
import AppShell from '../components/AppShell';

function renderShell(path = '/overview') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell />
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the four nav destinations (Prices is now a real route, no "soon" tag)', () => {
    renderShell();
    // sidebar nav (there are duplicates in the mobile tab bar, so scope to <nav>s)
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('My harvest').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Best crops').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prices').length).toBeGreaterThan(0);
    // FE-12 promoted Prices out of the stub — the "soon" pill is gone.
    expect(screen.queryByText('soon')).not.toBeInTheDocument();
  });

  it('exposes the audio-help stub and a labelled language switcher', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Listen to this page' })).toBeInTheDocument();
    const groups = screen.getAllByRole('group', { name: 'Language' });
    expect(groups.length).toBeGreaterThan(0);
    expect(within(groups[0]).getByRole('button', { name: 'EN' })).toBeInTheDocument();
  });
});
