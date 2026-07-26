import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '../i18n';
import { api } from '../api/client';
import { fxPipelineHealthScenarios } from '../api/fixtures';
import type { PipelineHealth } from '../api/types';
import { formatDate } from '../lib/format';
import { pipelineHealthDismissKey, presentPipelineHealth } from '../lib/pipelineHealth';
import { readPipelineHealthDismissed } from '../lib/storage';
import AdminLayout from '../admin/AdminLayout';
import PipelineHealthBanner from '../admin/PipelineHealthBanner';

const fx = fxPipelineHealthScenarios;

/** Serve one snapshot from the health endpoint and render the banner alone. */
function showing(health: PipelineHealth) {
  // mockClear (not reset) so `settle()` waits for THIS mount's fetch while the resolved
  // value stays in place — a re-render inside one test must not see a stale call count.
  vi.spyOn(api, 'getPipelineHealth').mockResolvedValue(health).mockClear();
  return render(
    <MemoryRouter>
      <PipelineHealthBanner />
    </MemoryRouter>,
  );
}

/** The banner is either an alert (red) or a status (amber) — or absent entirely. */
function banner(): HTMLElement | null {
  return screen.queryByRole('alert') ?? screen.queryByRole('status');
}

/** Let the mounted poll settle so "renders nothing" is a real absence, not a race. */
async function settle() {
  await waitFor(() => expect(api.getPipelineHealth).toHaveBeenCalled());
  // one more macrotask so a resolved promise has committed its state
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Pipeline health — presentation rules (lib)', () => {
  it('says nothing for a healthy or in-progress night', () => {
    expect(presentPipelineHealth('green')).toBeNull();
    expect(presentPipelineHealth('running')).toBeNull();
  });

  it('reserves red for "it did not happen" and amber for "it happened imperfectly"', () => {
    expect(presentPipelineHealth('missing')).toMatchObject({ tone: 'critical', role: 'alert' });
    expect(presentPipelineHealth('failed')).toMatchObject({ tone: 'critical', role: 'alert' });
    expect(presentPipelineHealth('gate_blocked')).toMatchObject({ tone: 'warn', role: 'status' });
    expect(presentPipelineHealth('partial')).toMatchObject({ tone: 'warn', role: 'status' });
  });

  it('ignores a state added to the API after this build (forward-compatible)', () => {
    expect(presentPipelineHealth('degraded_upstream')).toBeNull();
    expect(presentPipelineHealth('')).toBeNull();
    expect(presentPipelineHealth('GREEN')).toBeNull(); // wire strings are case-exact
  });

  it('keys a dismissal on state AND date, so either change is new news', () => {
    const k = pipelineHealthDismissKey({ state: 'partial', expectedForDate: '2026-07-21' });
    expect(k).toBe('partial|2026-07-21');
    expect(pipelineHealthDismissKey({ state: 'failed', expectedForDate: '2026-07-21' })).not.toBe(k);
    expect(pipelineHealthDismissKey({ state: 'partial', expectedForDate: '2026-07-22' })).not.toBe(k);
  });
});

describe('PipelineHealthBanner — state to render matrix', () => {
  it('renders NOTHING on a clean night (green)', async () => {
    showing(fx.green);
    await settle();
    expect(banner()).toBeNull();
  });

  it('renders NOTHING while the pipeline is still running', async () => {
    showing(fx.running);
    await settle();
    expect(banner()).toBeNull();
  });

  it('renders NOTHING for an unknown future state instead of crashing', async () => {
    showing(fx.unknownFutureState);
    await settle();
    expect(banner()).toBeNull();
  });

  it('renders NOTHING when the health endpoint itself fails (we do not know, so we do not claim)', async () => {
    vi.spyOn(api, 'getPipelineHealth').mockRejectedValue(new Error('network'));
    render(
      <MemoryRouter>
        <PipelineHealthBanner />
      </MemoryRouter>,
    );
    await settle();
    expect(banner()).toBeNull();
  });

  it('missing -> RED alert saying the update did not run', async () => {
    showing(fx.missing);
    const el = await screen.findByRole('alert');
    expect(el).toHaveClass('pipe-banner--critical');
    expect(el).toHaveTextContent(/did not run/i);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('failed -> RED alert saying the update failed', async () => {
    showing(fx.failed);
    const el = await screen.findByRole('alert');
    expect(el).toHaveClass('pipe-banner--critical');
    expect(el).toHaveTextContent(/failed/i);
  });

  it('gate_blocked -> AMBER status saying it was blocked at the quality check', async () => {
    showing(fx.gate_blocked);
    const el = await screen.findByRole('status');
    expect(el).toHaveClass('pipe-banner--warn');
    expect(el).toHaveTextContent(/blocked at the quality check/i);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('partial -> AMBER status saying it ran only partly', async () => {
    showing(fx.partial);
    const el = await screen.findByRole('status');
    expect(el).toHaveClass('pipe-banner--warn');
    expect(el).toHaveTextContent(/ran only partly/i);
  });
});

describe('PipelineHealthBanner — what it tells the admin', () => {
  it('names the day it is about (expectedForDate), formatted for the locale', async () => {
    showing(fx.partial);
    const el = await screen.findByRole('status');
    // Compared against the app's own formatter, not a hard-coded string: the point is
    // that the DATE is shown and localised, not which order this runner's ICU puts it in.
    expect(el).toHaveTextContent(formatDate('2026-07-21', 'en'));
  });

  it('shows the verification + feature-build detail line when the server sent them', async () => {
    showing(fx.gate_blocked);
    const el = await screen.findByRole('status');
    // Frozen wire words are TRANSLATED for display, never printed raw.
    expect(el).toHaveTextContent('Quality check: Fail');
    expect(el).toHaveTextContent('Data preparation: Skipped');
  });

  it('omits the detail line entirely when nothing ran (all detail fields null)', async () => {
    showing(fx.missing);
    const el = await screen.findByRole('alert');
    expect(el.querySelector('.pipe-banner__detail')).toBeNull();
    expect(el).not.toHaveTextContent(/Quality check/i);
  });

  it('links to the ingestion runs log so the admin can see what happened', async () => {
    showing(fx.partial);
    await screen.findByRole('status');
    const link = screen.getByRole('link', { name: 'See what happened' });
    expect(link).toHaveAttribute('href', '/admin/logs/ingestion');
  });

  it('renders on EVERY admin page, not just Logs (it lives in the admin layout)', async () => {
    vi.spyOn(api, 'getPipelineHealth').mockResolvedValue(fx.failed);
    render(
      <MemoryRouter initialEntries={['/admin/markets']}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="markets" element={<div>MARKETS PAGE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('MARKETS PAGE')).toBeInTheDocument();
  });
});

describe('PipelineHealthBanner — dismissal', () => {
  const dismissName = 'Hide this pipeline notice';

  it('has a dismiss control with a real accessible name', async () => {
    showing(fx.partial);
    await screen.findByRole('status');
    expect(screen.getByRole('button', { name: dismissName })).toBeInTheDocument();
  });

  it('hides on dismiss and remembers it across a reload', async () => {
    const view = showing(fx.partial);
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: dismissName }));
    expect(banner()).toBeNull();
    expect(readPipelineHealthDismissed()).toBe('partial|2026-07-21');

    // A reload (fresh mount, state gone, only localStorage left) must stay quiet.
    view.unmount();
    showing(fx.partial);
    await settle();
    expect(banner()).toBeNull();
  });

  it('comes back for a NEW pipeline day even though yesterday was dismissed', async () => {
    const view = showing(fx.partial);
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: dismissName }));
    expect(banner()).toBeNull();

    view.unmount();
    showing({ ...fx.partial, expectedForDate: '2026-07-22' });
    const el = await screen.findByRole('status');
    expect(el).toHaveTextContent(formatDate('2026-07-22', 'en'));
  });

  it('comes back when the SAME day changes state (partial -> failed), without a reload', async () => {
    // The poll resumes immediately when the tab becomes visible again, which is the
    // cheapest way to drive a second fetch without faking a 5-minute timer.
    const spy = vi.spyOn(api, 'getPipelineHealth').mockResolvedValue(fx.partial);
    render(
      <MemoryRouter>
        <PipelineHealthBanner />
      </MemoryRouter>,
    );
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: dismissName }));
    expect(banner()).toBeNull();

    spy.mockResolvedValue(fx.failed);
    hideTab(true);
    hideTab(false);
    const el = await screen.findByRole('alert');
    expect(el).toHaveTextContent(/failed/i);
  });
});

/** Flip document.hidden and fire the event the poll hook listens to. */
function hideTab(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  fireEvent(document, new Event('visibilitychange'));
}
