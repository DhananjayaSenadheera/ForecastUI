import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../i18n';
import CropPicker from '../components/CropPicker';
import { fxCrops } from '../api/fixtures';

function renderPicker(overrides: Partial<React.ComponentProps<typeof CropPicker>> = {}) {
  const onSelect = vi.fn();
  const onRetry = vi.fn();
  const utils = render(
    <CropPicker
      crops={fxCrops}
      loading={false}
      error={false}
      onRetry={onRetry}
      selectedId={null}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { ...utils, onSelect, onRetry };
}

describe('CropPicker', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows a loading skeleton (aria-busy) while crops load', () => {
    renderPicker({ loading: true });
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders an error state with a working retry', () => {
    const { onRetry } = renderPicker({ error: true });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders category headings and a live result count', () => {
    renderPicker();
    expect(screen.getByRole('heading', { name: 'Vegetables' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fruits' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(`${fxCrops.length} crops`);
  });

  it('selects a crop as an aria-pressed toggle button', () => {
    const { onSelect } = renderPicker();
    const tomato = screen.getByRole('button', { name: /Tomato/ });
    expect(tomato).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(tomato);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tomato' }));
  });

  it('reflects the selected crop via aria-pressed', () => {
    renderPicker({ selectedId: fxCrops[0].id });
    const selected = screen.getByRole('button', { name: new RegExp(fxCrops[0].name) });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
  });

  it('filters the grid by the search box and updates the count', () => {
    renderPicker();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tomato' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 crop');
    expect(screen.getByRole('button', { name: /Tomato/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Banana/ })).not.toBeInTheDocument();
  });

  it('shows a localized empty state when nothing matches', () => {
    renderPicker();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzznope' } });
    expect(screen.getByText('No crops found')).toBeInTheDocument();
    expect(screen.getByText(/zzznope/)).toBeInTheDocument();
  });

  it('collapses to a single group when crops have no category', () => {
    const uncategorized = fxCrops.map((c) => ({ ...c, category: null }));
    renderPicker({ crops: uncategorized });
    // no group headings rendered when there is only one group
    expect(screen.queryByRole('heading', { name: 'Vegetables' })).not.toBeInTheDocument();
    const group = screen.getByRole('region', { name: 'All crops' });
    expect(within(group).getAllByRole('button').length).toBe(uncategorized.length);
  });
});
