// =============================================================================
// Crop-status colouring (2026-07-22): lib honesty rules, the ReadinessBadge
// glyph+word law, CropPicker tint wiring, and the fail-soft page fetch.
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { api } from '../api/client';
import { fxCrops, fxCropReadiness } from '../api/fixtures';
import { buildReadinessMap, readinessFor } from '../lib/readiness';
import CropPicker from '../components/CropPicker';
import ReadinessBadge from '../components/ReadinessBadge';
import MyHarvestPage from '../pages/MyHarvestPage';

describe('readiness lib (honesty rules)', () => {
  it('an inactive model yields NO map — never an all-amber claim', () => {
    expect(buildReadinessMap({ modelVersion: null, minHistoryObs: null, modelActive: false, crops: [] })).toBeNull();
    expect(buildReadinessMap(null)).toBeNull();
  });

  it('null map -> null status (no tint); active map -> ready/collecting', () => {
    expect(readinessFor(null, 'c0000001-0000-0000-0000-000000000001')).toBeNull();
    const map = buildReadinessMap(fxCropReadiness)!;
    expect(readinessFor(map, 'c0000001-0000-0000-0000-000000000001')).toBe('ready'); // Capsicum
    expect(readinessFor(map, 'c0000004-0000-0000-0000-000000000004')).toBe('collecting'); // Passion Fruit
  });

  it('a crop ABSENT from an active map is "collecting" (brand-new crop)', () => {
    const map = buildReadinessMap(fxCropReadiness)!;
    // Papaya is deliberately absent from the fixture map.
    expect(readinessFor(map, 'c0000013-0000-0000-0000-000000000013')).toBe('collecting');
  });

  it('GUID case is normalized both ways', () => {
    const map = buildReadinessMap({
      ...fxCropReadiness,
      crops: [{ cropId: 'C0000001-0000-0000-0000-000000000001', ready: true, nObs: 1 }],
    })!;
    expect(readinessFor(map, 'c0000001-0000-0000-0000-000000000001')).toBe('ready');
  });
});

describe('ReadinessBadge (colour never alone)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders glyph + word for both statuses, nothing for null', () => {
    const { rerender, container } = render(<ReadinessBadge status="ready" />);
    expect(screen.getByText('Good forecast')).toBeInTheDocument();
    expect(screen.getByText('✓')).toHaveAttribute('aria-hidden', 'true');
    rerender(<ReadinessBadge status="collecting" />);
    expect(screen.getByText('Collecting data')).toBeInTheDocument();
    expect(screen.getByText('⏳')).toHaveAttribute('aria-hidden', 'true');
    rerender(<ReadinessBadge status={null} />);
    expect(container.querySelector('.rdy-badge')).toBeNull();
  });

  it('compact mode keeps the word for screen readers (sr-only), glyph visible', () => {
    render(<ReadinessBadge status="ready" compact />);
    const label = screen.getByText('Good forecast');
    expect(label.className).toContain('sr-only');
    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});

describe('CropPicker readiness tints', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  function pickCard(name: string): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(name) });
  }

  it('tints cards per status and pairs every tint with a badge', () => {
    render(
      <CropPicker
        crops={fxCrops}
        loading={false}
        error={false}
        onRetry={() => {}}
        selectedId={null}
        onSelect={() => {}}
        readiness={buildReadinessMap(fxCropReadiness)}
      />,
    );
    const capsicum = pickCard('Capsicum');
    expect(capsicum.className).toContain('cp-card--ready');
    expect(within(capsicum).getByText('Good forecast')).toBeInTheDocument();
    // Name-vs-description split (same law as the Logs tab tooltips): the status
    // DESCRIBES the card and never joins its accessible NAME.
    expect(capsicum).toHaveAccessibleName('Capsicum');
    expect(capsicum).toHaveAccessibleDescription('Good forecast');
    const passion = pickCard('Passion Fruit');
    expect(passion.className).toContain('cp-card--collecting');
    expect(within(passion).getByText('Collecting data')).toBeInTheDocument();
    expect(passion).toHaveAccessibleName('Passion Fruit');
    expect(passion).toHaveAccessibleDescription('Collecting data');
    // Absent-from-map crop (Papaya) renders as collecting, same as explicit false.
    expect(pickCard('Papaya').className).toContain('cp-card--collecting');
  });

  it('no readiness map -> no tints, no badges (unknown makes no claim)', () => {
    render(
      <CropPicker
        crops={fxCrops}
        loading={false}
        error={false}
        onRetry={() => {}}
        selectedId={null}
        onSelect={() => {}}
        readiness={null}
      />,
    );
    expect(document.querySelector('.cp-card--ready')).toBeNull();
    expect(document.querySelector('.cp-card--collecting')).toBeNull();
    expect(document.querySelector('.rdy-badge')).toBeNull();
  });
});

describe('MyHarvestPage readiness fetch (fail-soft)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/my-harvest']}>
        <MyHarvestPage />
      </MemoryRouter>,
    );
  }

  it('tints the picker from the readiness endpoint', async () => {
    renderPage();
    await screen.findByRole('button', { name: /Capsicum/ });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Capsicum/ }).className).toContain('cp-card--ready'),
    );
  });

  it('a readiness failure leaves the picker fully usable and untinted', async () => {
    vi.spyOn(api, 'getCropReadiness').mockRejectedValueOnce(new Error('down'));
    renderPage();
    const card = await screen.findByRole('button', { name: /Capsicum/ });
    expect(card.className).not.toContain('cp-card--ready');
    expect(document.querySelector('.rdy-badge')).toBeNull();
    // The page itself is untouched by the failure — no error state anywhere.
    expect(screen.queryByText('Could not load')).toBeNull();
  });

  it('modelActive=false shows NO tint (honesty: not all-amber)', async () => {
    vi.spyOn(api, 'getCropReadiness').mockResolvedValueOnce({
      ...fxCropReadiness,
      modelActive: false,
    });
    renderPage();
    await screen.findByRole('button', { name: /Capsicum/ });
    expect(document.querySelector('.cp-card--ready')).toBeNull();
    expect(document.querySelector('.cp-card--collecting')).toBeNull();
  });
});
