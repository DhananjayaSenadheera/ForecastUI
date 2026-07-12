import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import CompareCropsPage from '../pages/CompareCropsPage';
import { api, ApiError } from '../api/client';
import { fxTimelineFor } from '../api/fixtures';

const CAPSICUM = 'c0000001-0000-0000-0000-000000000001';
const TOMATO = 'c0000003-0000-0000-0000-000000000003';
const BEANS = 'c0000002-0000-0000-0000-000000000002';
const CARROT = 'c0000006-0000-0000-0000-000000000006';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CompareCropsPage />
    </MemoryRouter>,
  );
}

describe('CompareCropsPage (FE-14)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows guidance when nothing is selected', async () => {
    renderAt('/best-crops/compare');
    await screen.findByRole('button', { name: 'Capsicum' }); // chips loaded
    expect(screen.getByText('Pick crops to compare')).toBeInTheDocument();
  });

  it('renders overlaid lines + a month×crop table from a ?crops= deep-link', async () => {
    renderAt(`/best-crops/compare?crops=${CAPSICUM},${TOMATO}`);

    const chart = await screen.findByRole('img'); // the overlay svg
    expect(chart.getAttribute('aria-label')).toMatch(/Capsicum, Tomato/);

    // table alternative present with a column header per crop
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Capsicum' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Tomato' })).toBeInTheDocument();
  });

  it('enforces the 3-crop cap with an honest note', async () => {
    renderAt('/best-crops/compare');
    await screen.findByRole('button', { name: 'Capsicum' });

    fireEvent.click(screen.getByRole('button', { name: 'Capsicum' }));
    fireEvent.click(screen.getByRole('button', { name: 'Beans' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tomato' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tomato' })).toHaveAttribute('aria-pressed', 'true'));

    // fourth pick is refused
    fireEvent.click(screen.getByRole('button', { name: 'Carrot' }));
    expect(screen.getByRole('button', { name: 'Carrot' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/up to 3 crops at a time/)).toBeInTheDocument();
    void [BEANS, CARROT];
  });

  it('is fail-soft per crop — one failing timeline shows a note, the other still charts', async () => {
    vi.spyOn(api, 'getCropTimeline').mockImplementation((id: string) =>
      id === TOMATO ? Promise.reject(new ApiError('boom', 500)) : Promise.resolve(fxTimelineFor(id)),
    );

    renderAt(`/best-crops/compare?crops=${CAPSICUM},${TOMATO}`);

    // failed crop -> inline note + retry, chart still renders for Capsicum
    await screen.findByText('Could not load the price timeline for Tomato.');
    expect(screen.getByRole('img')).toBeInTheDocument();
    const note = screen.getByText('Could not load the price timeline for Tomato.').closest('.cmp-note');
    expect(within(note as HTMLElement).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
