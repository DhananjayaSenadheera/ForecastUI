import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import MyHarvestPage from '../pages/MyHarvestPage';
import { ymdLocal } from '../lib/format';

const BEANS = 'c0000002-0000-0000-0000-000000000002';

function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
}

/** The date input's current value — asserted as a ymd string, never as a rendered locale
 *  date (en-LK under Node's ICU does not render what a phone renders). */
function dateField(): HTMLInputElement {
  return screen.getByLabelText('Planting date') as HTMLInputElement;
}

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

  it('resolves the summary icon from the ENGLISH name while the label is Sinhala', async () => {
    // cropIcon's keyword rules are English. This screen shows the LOCALIZED name beside the
    // glyph, so the two strings come from different places and it is easy to pass the wrong
    // one — doing so is silent, because the fallback 🌱 is a perfectly valid-looking icon.
    // Tomato is the right crop to pin it with: its fixture code (VEG000003) is not in the
    // icon map, so ONLY the English name can produce 🍅 and the code cannot mask the bug.
    await i18n.changeLanguage('si');
    renderAt('/my-harvest?crop=c0000003-0000-0000-0000-000000000003'); // Tomato

    await screen.findByRole('button', { name: 'තක්කාලි', pressed: true });
    const icon = document.querySelector('.hv-summary__icon') as HTMLElement;
    expect(icon).toHaveTextContent('🍅');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    // the label beside it is still the Sinhala one — the icon did not change the copy
    expect(document.querySelector('.hv-summary__crop')).toHaveTextContent('තක්කාලි');
  });
});

describe('MyHarvestPage — ?date= carries the farmer’s own planting from My crops', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('opens on the planting date the card was showing', async () => {
    const planted = shift(-30);
    renderAt(`/my-harvest?crop=${BEANS}&date=${planted}`);
    await screen.findByRole('button', { name: 'Beans', pressed: true });
    // The same date the card answered for, so the two screens ask one question.
    expect(dateField().value).toBe(planted);
  });

  it('IGNORES a date outside this field’s window instead of clamping it', async () => {
    // Clamping would silently forecast today's planting under a link that named a date two
    // years ago — a different question, answered without saying so.
    const tooOld = shift(-400);
    renderAt(`/my-harvest?crop=${BEANS}&date=${tooOld}`);
    await screen.findByRole('button', { name: 'Beans', pressed: true });
    expect(dateField().value).toBe(ymdLocal(new Date()));
  });

  it('ignores a malformed date and keeps the crop preselect', async () => {
    renderAt(`/my-harvest?crop=${BEANS}&date=not-a-date`);
    await screen.findByRole('button', { name: 'Beans', pressed: true });
    expect(dateField().value).toBe(ymdLocal(new Date()));
  });

  it('does nothing with a date when the crop id is unknown', async () => {
    renderAt(`/my-harvest?crop=nope&date=${shift(-10)}`);
    await screen.findByRole('button', { name: 'Beans' });
    expect(screen.queryByRole('button', { pressed: true })).toBeNull();
    expect(dateField().value).toBe(ymdLocal(new Date()));
  });
});
