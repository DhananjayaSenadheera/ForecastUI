/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the .NET API (the ONLY backend). Default http://localhost:5282. */
  readonly VITE_API_BASE_URL?: string;
  /** 'fixtures' serves realistic fixture JSON instead of hitting the API. */
  readonly VITE_API_MODE?: 'fixtures' | 'live';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
