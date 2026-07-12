import { describe, it, expect, vi, afterEach } from 'vitest';
import { request, setAuthToken, setUnauthorizedHandler, ApiError } from '../api/client';

// A minimal fetch Response stand-in (jsdom Response is fine but this is lighter).
function fakeRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  setAuthToken(null);
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

describe('in-memory bearer token + 401 interceptor', () => {
  it('sends Authorization: Bearer once a token is set', async () => {
    setAuthToken('tok123');
    const fetchMock = vi.fn(async () => fakeRes(200, []));
    vi.stubGlobal('fetch', fetchMock);

    await request('/api/crops/get/all');

    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok123');
  });

  it('sends no Authorization header when there is no token', async () => {
    const fetchMock = vi.fn(async () => fakeRes(200, []));
    vi.stubGlobal('fetch', fetchMock);

    await request('/api/crops/get/all');

    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('fires the unauthorized handler on a 401 from a DATA route', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', vi.fn(async () => fakeRes(401, { errors: [{ message: 'x' }] })));

    await expect(request('/api/forecast/best-crops')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire the handler on a 401 from an AUTH route (wrong credentials)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes(401, { errors: [{ message: 'Invalid username or password.' }] })),
    );

    await expect(
      request('/api/auth/login', { method: 'POST', body: '{}' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });
});
