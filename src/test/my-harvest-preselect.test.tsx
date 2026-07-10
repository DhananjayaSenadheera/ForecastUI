import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import MyHarvestPage from '../pages/MyHarvestPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MyHarvestPage />
    </MemoryRouter>,
  );
}

describe('MyHarvestPage — ?crop= deep-link preselect (FE-7 cross-link)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('preselects the crop from the query param once the list loads', async () => {
    renderAt('/my-harvest?crop=c0000002-0000-0000-0000-000000000002'); // Beans
    // the Beans card becomes the pressed (selected) toggle
    const card = await screen.findByRole('button', { name: 'Beans', pressed: true });
    expect(card).toBeInTheDocument();
  });

  it('selects nothing when no ?crop= is given', async () => {
    renderAt('/my-harvest');
    await screen.findByRole('button', { name: 'Beans' }); // list loaded
    expect(screen.queryByRole('button', { pressed: true })).toBeNull();
    expect(screen.getByText('Not chosen yet')).toBeInTheDocument();
  });

  it('ignores an unknown crop id (no crash, nothing selected)', async () => {
    renderAt('/my-harvest?crop=does-not-exist');
    await screen.findByRole('button', { name: 'Beans' });
    expect(screen.queryByRole('button', { pressed: true })).toBeNull();
  });
});
