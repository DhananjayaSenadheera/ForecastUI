import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Structural sanity for the service worker source (a real SW can't run in jsdom).
// Guards the FE-9 caching contract: versioned caches, an injectable precache
// placeholder, and honest network-first API caching that stamps the staleness
// header the app reads.
const sw = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

describe('service worker source', () => {
  it('defines separate versioned shell + data caches', () => {
    expect(sw).toMatch(/agriforecast-shell-\$\{CACHE_VERSION\}/);
    expect(sw).toMatch(/agriforecast-data-\$\{CACHE_VERSION\}/);
    expect(sw).toMatch(/CACHE_VERSION = 'v2'/);
  });

  it('carries the build-time precache placeholder for asset injection', () => {
    expect(sw).toContain('/*__PRECACHE_MANIFEST__*/');
  });

  it('uses network-first for /api and stamps the staleness headers on fallback', () => {
    expect(sw).toMatch(/pathname\.startsWith\('\/api\/'\)/);
    expect(sw).toContain('X-SW-Cache');
    expect(sw).toContain('X-SW-Cached-At');
    // The offline fallback path must read cache after a failed fetch.
    expect(sw).toMatch(/catch\s*\{[\s\S]*cache\.match\(request\)/);
  });
});
