/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// AgriForecast Farmer App — Vite config (FE-2 scaffold).
// Anonymous-read R1: no proxy auth. VITE_* only for config.
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 4173 },
  preview: { host: '0.0.0.0', port: 4173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: { VITE_API_MODE: 'fixtures' },
  },
});
