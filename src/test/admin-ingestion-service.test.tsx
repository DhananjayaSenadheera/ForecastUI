import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import { fxIngestionRuns, fxIngestionStatusObj } from '../api/fixtures';
import type { IngestionState, IngestionStatus } from '../api/types';
import IngestionRunsPage from '../admin/IngestionRunsPage';

// The control lives on the ingestion status card, so it is exercised through the real
// page: the status it reads and the refetch it triggers are the point of the feature.
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/logs/ingestion']}>
      <AuthProvider>
        <IngestionRunsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** canStop defaults to "whatever an API-owned pass would report", so a plain
 *  running/stopped case reads the way the API process's own passes do. */
function statusWith(state: IngestionState, canStop = state === 'running'): IngestionStatus {
  return { ...fxIngestionStatusObj, state, canStop };
}

const START_BTN = 'Run ingestion now';
const STOP_BTN = 'Stop ingestion';

/** Render the page with a known service state and wait for the card. */
async function showing(state: IngestionState, canStop = state === 'running') {
  const statusSpy = vi
    .spyOn(api, 'getIngestionStatus')
    .mockResolvedValue(statusWith(state, canStop));
  vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
  renderPage();
  await screen.findByText(/Ingestion service is/i);
  return statusSpy;
}

/** Open the confirmation dialog for whichever action the card is offering.
 *  The trigger is focused first because that is what a real activation does (jsdom's
 *  fireEvent.click does not move focus), and focus RESTORE depends on it. */
async function openDialog(button: string) {
  const trigger = screen.getByRole('button', { name: button });
  trigger.focus();
  fireEvent.click(trigger);
  return await screen.findByRole('dialog');
}

describe('Ingestion service control — which button, and its accessible name', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers START when the service is stopped', async () => {
    await showing('stopped');
    expect(screen.getByRole('button', { name: START_BTN })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: STOP_BTN })).toBeNull();
  });

  it('offers an ENABLED stop when a pass this API owns is running (canStop)', async () => {
    await showing('running', true);
    expect(screen.getByRole('button', { name: STOP_BTN })).toBeEnabled();
    expect(screen.queryByRole('button', { name: START_BTN })).toBeNull();
  });

  // The scheduler owns the pass, so stop could only ever 409. Offering an enabled
  // button whose single possible outcome is a refusal is a control that lies.
  it('DISABLES stop for a scheduler-owned pass and says why', async () => {
    await showing('running', false);
    const btn = screen.getByRole('button', { name: STOP_BTN });
    expect(btn).toBeDisabled();
    // The reason is the button's accessible description, not just nearby grey text.
    const describedBy = btn.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const reason = document.getElementById(describedBy!.split(' ')[0]);
    expect(reason?.textContent).toMatch(/scheduled nightly job, not from this screen/i);
  });

  it('does not open a dialog from the disabled scheduler-owned stop button', async () => {
    await showing('running', false);
    const stopSpy = vi.spyOn(api, 'stopIngestionService');
    fireEvent.click(screen.getByRole('button', { name: STOP_BTN }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stopSpy).not.toHaveBeenCalled();
  });

  // canStop is set the moment a start is accepted; `state` only follows once the first
  // run row commits. Trusting `state` alone would flip the button back to Start.
  it('offers stop on canStop even while state still reads stopped (the flip-back race)', async () => {
    await showing('stopped', true);
    expect(screen.getByRole('button', { name: STOP_BTN })).toBeEnabled();
    expect(screen.queryByRole('button', { name: START_BTN })).toBeNull();
  });

  // 'unknown' must not offer Stop: there is nothing we can honestly claim to stop.
  // Start is safe because the server's single-flight lock answers 409 already_running.
  it('offers START (never STOP) when the state is unknown, and says why that is safe', async () => {
    await showing('unknown');
    expect(screen.getByRole('button', { name: START_BTN })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: STOP_BTN })).toBeNull();
    expect(screen.getByText(/state could not be read/i)).toBeInTheDocument();
  });

  it('gives the button a real text name, not an icon alone', async () => {
    await showing('stopped');
    const btn = screen.getByRole('button', { name: START_BTN });
    // The accessible name comes from visible text; the glyph is aria-hidden.
    expect(btn).toHaveTextContent(START_BTN);
    expect(btn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Ingestion service control — confirmation dialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT call the API until the dialog is confirmed', async () => {
    await showing('stopped');
    const startSpy = vi.spyOn(api, 'startIngestionService');
    await openDialog(START_BTN);
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('start dialog states the honest scope: ingestion only, not the nightly pipeline', async () => {
    await showing('stopped');
    const d = await openDialog(START_BTN);
    expect(within(d).getByText(/runs one ingestion pass now on the server/i)).toBeInTheDocument();
    expect(
      within(d).getByText(
        /Verification, feature building and model training stay with the nightly pipeline/i,
      ),
    ).toBeInTheDocument();
  });

  it('stop dialog states it cannot cancel the scheduled nightly pass', async () => {
    await showing('running');
    const d = await openDialog(STOP_BTN);
    expect(
      within(d).getByText(/can only cancel a pass that was started from this screen/i),
    ).toBeInTheDocument();
    expect(within(d).getByText(/cannot be stopped here/i)).toBeInTheDocument();
  });

  it('points aria-describedby at the body copy so the caveat is read with the title', async () => {
    await showing('stopped');
    const d = await openDialog(START_BTN);
    const describedBy = d.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const body = document.getElementById(describedBy as string);
    expect(body).not.toBeNull();
    expect(body?.textContent).toMatch(/nightly pipeline/i);
  });

  it('Cancel closes the dialog and calls nothing', async () => {
    await showing('stopped');
    const startSpy = vi.spyOn(api, 'startIngestionService');
    const d = await openDialog(START_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('Escape closes the dialog and calls nothing', async () => {
    await showing('stopped');
    const startSpy = vi.spyOn(api, 'startIngestionService');
    const d = await openDialog(START_BTN);
    fireEvent.keyDown(d, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('moves focus into the dialog on open and back to the trigger on close', async () => {
    await showing('stopped');
    const trigger = screen.getByRole('button', { name: START_BTN });
    const d = await openDialog(START_BTN);
    await waitFor(() => expect(d.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(d, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Focus must not be dumped on <body> — the keyboard user goes back where they were.
    expect(document.activeElement).toBe(trigger);
  });

  it('traps Tab inside the dialog (wraps at both ends)', async () => {
    await showing('stopped');
    const d = await openDialog(START_BTN);
    const focusables = within(d).getAllByRole('button');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(d, { key: 'Tab' });
    expect(document.activeElement).toBe(first); // forward off the end wraps to the start

    first.focus();
    fireEvent.keyDown(d, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last); // backward off the start wraps to the end
  });
});

describe('Ingestion service control — requests and their outcomes', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('confirming start calls startIngestionService once and refetches the status', async () => {
    const statusSpy = await showing('stopped');
    const startSpy = vi
      .spyOn(api, 'startIngestionService')
      .mockResolvedValue({ batchId: 'b1111111-1111-4111-8111-111111111111' });
    const before = statusSpy.mock.calls.length;

    const d = await openDialog(START_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Run now' }));

    await waitFor(() => expect(startSpy).toHaveBeenCalledTimes(1));
    // The status is reread because the pass we just launched changed it.
    await waitFor(() => expect(statusSpy.mock.calls.length).toBeGreaterThan(before));
    expect(await screen.findByText(/Ingestion pass started/i)).toBeInTheDocument();
  });

  it('confirming stop calls stopIngestionService once and reports a REQUEST, not a halt', async () => {
    const statusSpy = await showing('running');
    const stopSpy = vi.spyOn(api, 'stopIngestionService').mockResolvedValue({});
    const before = statusSpy.mock.calls.length;

    const d = await openDialog(STOP_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Stop the pass' }));

    await waitFor(() => expect(stopSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(statusSpy.mock.calls.length).toBeGreaterThan(before));
    // Wording matters: the API only asks for a cancellation.
    expect(await screen.findByText(/Stop requested/i)).toBeInTheDocument();
  });

  it('disables the button and shows a pending label while the request is in flight', async () => {
    await showing('stopped');
    let release: (v: { batchId: string }) => void = () => {};
    vi.spyOn(api, 'startIngestionService').mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );

    const d = await openDialog(START_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Run now' }));

    const pending = await screen.findByRole('button', { name: 'Starting…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      release({ batchId: 'b-1' });
    });
    await waitFor(() => expect(screen.getByRole('button', { name: START_BTN })).toBeEnabled());
  });

  it('cannot double-submit: the dialog confirm is disabled while in flight', async () => {
    await showing('stopped');
    const startSpy = vi
      .spyOn(api, 'startIngestionService')
      .mockImplementation(() => new Promise(() => {})); // never settles
    const d = await openDialog(START_BTN);
    const confirm = within(d).getByRole('button', { name: 'Run now' });
    fireEvent.click(confirm);
    // The dialog closes on confirm, so the page button carries the pending state.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Starting…' }));
    expect(startSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Ingestion service control — 409s are information, not failures', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A 409 exactly as the API sends it: a code, no errors[] envelope. */
  const conflict = (code: string) => new ApiError('HTTP 409', 409, code);

  it('already_running: a polite notice, no red error, and a refreshed status', async () => {
    const statusSpy = await showing('stopped');
    vi.spyOn(api, 'startIngestionService').mockRejectedValue(conflict('already_running'));
    const before = statusSpy.mock.calls.length;

    const d = await openDialog(START_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Run now' }));

    const note = await screen.findByText(/already running, so a second one was not started/i);
    expect(note).toHaveAttribute('role', 'status'); // polite: nothing broke
    expect(note).not.toHaveClass('adm-note--error');
    // A 409 means our snapshot was wrong, so the truth is reread.
    await waitFor(() => expect(statusSpy.mock.calls.length).toBeGreaterThan(before));
  });

  it('not_running: says there was nothing to stop, and refetches', async () => {
    const statusSpy = await showing('running');
    vi.spyOn(api, 'stopIngestionService').mockRejectedValue(conflict('not_running'));
    const before = statusSpy.mock.calls.length;

    const d = await openDialog(STOP_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Stop the pass' }));

    const note = await screen.findByText(/nothing to stop/i);
    expect(note).toHaveAttribute('role', 'status');
    await waitFor(() => expect(statusSpy.mock.calls.length).toBeGreaterThan(before));
  });

  it('not_stoppable: names the scheduler as the owner instead of pretending it stopped', async () => {
    await showing('running');
    vi.spyOn(api, 'stopIngestionService').mockRejectedValue(conflict('not_stoppable'));

    const d = await openDialog(STOP_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Stop the pass' }));

    expect(
      await screen.findByText(/started by the scheduled nightly job, not from this screen/i),
    ).toBeInTheDocument();
    // No success wording anywhere — the pass is still running.
    expect(screen.queryByText(/Stop requested/i)).toBeNull();
  });

  it('a 500 uses the page error pattern (alert), not a reassuring 409 sentence', async () => {
    await showing('stopped');
    vi.spyOn(api, 'startIngestionService').mockRejectedValue(new ApiError('boom', 500));

    const d = await openDialog(START_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Run now' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    expect(alert).toHaveClass('adm-note--error');
  });

  it('a network failure is an error too, and never claims the pass started', async () => {
    await showing('stopped');
    vi.spyOn(api, 'startIngestionService').mockRejectedValue(new ApiError('network', 0));

    const d = await openDialog(START_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Run now' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/Ingestion pass started/i)).toBeNull();
  });

  it('an UNKNOWN 409 code degrades to the error pattern rather than inventing a reason', async () => {
    await showing('stopped');
    vi.spyOn(api, 'startIngestionService').mockRejectedValue(conflict('some_new_code'));

    const d = await openDialog(START_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Run now' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Ingestion service control — the status card stays the source of truth', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('swaps the button when the refetched status says the service is now running', async () => {
    const statusSpy = vi
      .spyOn(api, 'getIngestionStatus')
      .mockResolvedValueOnce(statusWith('stopped'))
      .mockResolvedValue(statusWith('running', true));
    vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
    vi.spyOn(api, 'startIngestionService').mockResolvedValue({ batchId: 'b-1' });
    renderPage();

    await screen.findByRole('button', { name: START_BTN });
    const d = await openDialog(START_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Run now' }));

    // The button follows the SERVER's state, never an optimistic local guess.
    expect(await screen.findByRole('button', { name: STOP_BTN })).toBeInTheDocument();
    expect(statusSpy.mock.calls.length).toBeGreaterThan(1);
    expect(await screen.findByText(/Ingestion service is Running/i)).toBeInTheDocument();
  });

  // The post-start refetch can land BEFORE the pass's first run row commits, so the
  // snapshot still says state='stopped'. Without canStop the button would revert to
  // Start underneath a "pass started" notice — the exact contradiction to avoid.
  it('does not flip back to Start when the post-start refetch still reads state=stopped', async () => {
    vi.spyOn(api, 'getIngestionStatus')
      .mockResolvedValueOnce(statusWith('stopped', false))
      .mockResolvedValue(statusWith('stopped', true)); // accepted, not yet recorded
    vi.spyOn(api, 'getIngestionRuns').mockResolvedValue(fxIngestionRuns(1, 25));
    vi.spyOn(api, 'startIngestionService').mockResolvedValue({ batchId: 'b-1' });
    renderPage();

    await screen.findByRole('button', { name: START_BTN });
    const d = await openDialog(START_BTN);
    fireEvent.click(within(d).getByRole('button', { name: 'Run now' }));

    expect(await screen.findByRole('button', { name: STOP_BTN })).toBeEnabled();
    expect(screen.queryByRole('button', { name: START_BTN })).toBeNull();
    // ...and the notice it sits under still says the pass started.
    expect(screen.getByText(/Ingestion pass started/i)).toBeInTheDocument();
  });

  it('keeps the control out of the polite live region that announces the state', async () => {
    await showing('stopped');
    const live = document.querySelector('[aria-live="polite"].ing-status__state');
    expect(live).not.toBeNull();
    // A button inside the live region would be re-announced on every 30s poll.
    expect(live?.querySelector('button')).toBeNull();
  });
});
