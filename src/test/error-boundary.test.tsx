import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '../i18n';
import i18n from '../i18n';
import ErrorBoundary from '../components/ErrorBoundary';

function Boom(): JSX.Element {
  throw new Error('panel crashed');
}

describe('ErrorBoundary', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders a localized fallback with a reload action when a child throws', () => {
    // React logs the caught error to console.error; silence it for a clean run.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary variant="panel">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('This part could not open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('clears the error when the resetKey changes (route navigation)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <ErrorBoundary variant="panel" resetKey="/a">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(
      <ErrorBoundary variant="panel" resetKey="/b">
        <p>recovered</p>
      </ErrorBoundary>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('recovered')).toBeInTheDocument();
    spy.mockRestore();
  });
});
