import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../i18n';
import CropPicker from '../components/CropPicker';
import { fxCrops } from '../api/fixtures';

const BEANS = 'c0000002-0000-0000-0000-000000000002';
const CARROT = 'c0000006-0000-0000-0000-000000000006';

function renderPicker(recentIds?: string[]) {
  return render(
    <CropPicker
      crops={fxCrops}
      loading={false}
      error={false}
      onRetry={vi.fn()}
      selectedId={null}
      onSelect={vi.fn()}
      recentIds={recentIds}
    />,
  );
}

describe('CropPicker — Recent group (FE-16)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('pins a Recent group at the top without removing crops from their category', () => {
    renderPicker([BEANS, CARROT]);
    expect(screen.getByRole('heading', { name: 'Recent' })).toBeInTheDocument();
    // each recent crop appears TWICE: once under Recent, once in its category group
    expect(screen.getAllByRole('button', { name: 'Beans' }).length).toBe(2);
    expect(screen.getAllByRole('button', { name: 'Carrot' }).length).toBe(2);
  });

  it('renders no Recent group when there are no recent ids', () => {
    renderPicker([]);
    expect(screen.queryByRole('heading', { name: 'Recent' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Beans' }).length).toBe(1);
  });

  it('hides the Recent group while searching (matches only)', () => {
    renderPicker([BEANS, CARROT]);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Beans' } });
    expect(screen.queryByRole('heading', { name: 'Recent' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Beans' }).length).toBe(1);
  });

  it('ignores recent ids that are not in the loaded crop list', () => {
    renderPicker(['does-not-exist', BEANS]);
    expect(screen.getByRole('heading', { name: 'Recent' })).toBeInTheDocument();
    // only the valid recent crop is duplicated
    expect(screen.getAllByRole('button', { name: 'Beans' }).length).toBe(2);
  });
});
