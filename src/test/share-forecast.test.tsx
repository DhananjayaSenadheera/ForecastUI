import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../i18n';
import ShareForecast from '../components/ShareForecast';
import { fxHarvestForecast } from '../api/fixtures';

// jsdom has neither navigator.share nor a reliable clipboard; we install/remove
// them per test to exercise each code path.
function setNav(prop: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, prop, { value, configurable: true, writable: true });
}
function clearNav(prop: 'share' | 'clipboard') {
  // delete via redefining to undefined then removing the descriptor
  Object.defineProperty(navigator, prop, { value: undefined, configurable: true, writable: true });
}

function renderShare() {
  return render(<ShareForecast forecast={fxHarvestForecast} cropLabel="Capsicum" />);
}

describe('ShareForecast (FE-11)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    clearNav('share');
    clearNav('clipboard');
    vi.restoreAllMocks();
  });

  it('uses navigator.share with the composed plain-text summary when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNav('share', share);

    renderShare();
    fireEvent.click(screen.getByRole('button', { name: /Share/ }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = share.mock.calls[0][0] as { text: string };
    expect(arg.text).toContain('Capsicum');
    expect(arg.text).toContain('Rs. 552');
    expect(arg.text).toContain('AgriForecast');
  });

  it('falls back to clipboard.writeText and shows a polite "Copied" confirmation', async () => {
    clearNav('share'); // no native share sheet (desktop)
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNav('clipboard', { writeText });

    renderShare();
    fireEvent.click(screen.getByRole('button', { name: /Share/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('Capsicum');
    const status = await screen.findByText('Copied');
    expect(status).toBeInTheDocument();
    expect(status.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('shows a readonly textarea to copy manually when neither share nor clipboard exist', async () => {
    clearNav('share');
    clearNav('clipboard');

    renderShare();
    fireEvent.click(screen.getByRole('button', { name: /Share/ }));

    const textarea = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute('readonly');
    expect(textarea.value).toContain('Capsicum');
    expect(textarea.value).toContain('AgriForecast');
  });
});
