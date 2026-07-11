import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';
import i18n from '../i18n';
import OverviewPage from '../pages/OverviewPage';

function renderOverview() {
  return render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );
}

describe('OverviewPage (honest not-built placeholders)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('labels every KPI and marks its value "Not available yet" (no fabricated data)', () => {
    renderOverview();
    expect(screen.getByText('Crops rising this week')).toBeInTheDocument();
    // sr-only "Not available yet" appears once per KPI (4).
    expect(screen.getAllByText('Not available yet')).toHaveLength(4);
  });

  it('shows an honest coming-soon panel treatment, not internal task IDs', () => {
    renderOverview();
    expect(screen.getAllByText(/coming update/i).length).toBeGreaterThan(0);
    // Internal task IDs must never leak into farmer-facing copy.
    expect(screen.queryByText(/FE-\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/API #\d/)).not.toBeInTheDocument();
  });
});
