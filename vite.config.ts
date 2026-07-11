/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// AgriForecast Farmer App — Vite config.
// Anonymous-read R1: no proxy auth. VITE_* only for config.

/**
 * FE-9 precache injection. The service worker (public/sw.js) ships with a
 * `/*__PRECACHE_MANIFEST__*` /[] placeholder; after the bundle is written we
 * rewrite it with the real hashed asset filenames so the app shell can be
 * installed and opened fully offline. No workbox, no runtime asset discovery.
 */
function swPrecachePlugin(): Plugin {
  return {
    name: 'agri-sw-precache',
    apply: 'build',
    writeBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
        .map((f) => `/${f}`);
      // Small, always-present shell entries the app cannot boot without.
      const shell = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg'];
      const manifest = [...new Set([...shell, ...assets])];

      const swPath = resolve(__dirname, 'dist/sw.js');
      const src = readFileSync(swPath, 'utf8');
      const injected = src.replace(
        /\/\*__PRECACHE_MANIFEST__\*\/\s*\[\]/,
        JSON.stringify(manifest),
      );
      if (injected === src) {
        this.warn('sw precache placeholder not found — shell precache NOT injected');
      }
      writeFileSync(swPath, injected);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), swPrecachePlugin()],
  // Strip console/debugger from PRODUCTION bundles only (no response-body leaks).
  // Dev + test keep them so debugging and vitest assertions are unaffected.
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  server: { host: '0.0.0.0', port: 4173 },
  preview: { host: '0.0.0.0', port: 4173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: { VITE_API_MODE: 'fixtures' },
  },
}));
