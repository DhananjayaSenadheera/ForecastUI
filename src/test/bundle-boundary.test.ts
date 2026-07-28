// The first-load bundle's one structural rule, as a tripwire.
//
// WHY THIS EXISTS. `lib/portfolio` is the portfolio surface's module: watchlist caps, error
// mapping, price-age and swing rules, the dashboard predicates. That surface is lazy — it is
// a non-tab destination — but the four tab pages are NOT. So a single symbol imported from
// `lib/portfolio` by an eagerly-loaded page pulls the whole module into the chunk every
// farmer downloads on first paint, for one helper. That happened in this branch (My harvest
// needed one date check; +1.44 kB gzipped on the eager chunk) and the entire test suite
// stayed green, because nothing about it is a behaviour bug. The reviewer then proved the
// regression comes back silently: re-importing any symbol DEFINED in lib/portfolio from an
// eager page costs ~1 kB gz with the suite still fully green. On a mid-range Android over a
// rural connection that is real, and no test was watching.
//
// WHAT THIS IS NOT. It is a source-level tripwire, not a bundle oracle:
//   • It reads IMPORT PATHS, so it catches the common form of the mistake — an eager module
//     importing from lib/portfolio directly — and nothing subtler.
//   • Pure RE-EXPORTS through lib/portfolio are tree-shaken harmlessly (reviewer-verified),
//     so a bundler-truth oracle would have to allow them. This guard does not: it is
//     deliberately blunter and cheaper than the build it protects. If a legitimate re-export
//     ever needs to cross this line, move the symbol to its own leaf module (that is what
//     lib/plantDate.ts is) rather than widening the rule.
//   • The real measurement is still base-vs-tip `vite build` in identical worktrees with the
//     same VITE_API_MODE. This only stops the regression that slips past review.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SRC = resolve(__dirname, '..');
/** The module that must stay out of the first-load bundle. */
const LAZY_ONLY = resolve(SRC, 'lib/portfolio.ts');
/** Where the eager graph starts: the app's own entry and its router. */
const ENTRIES = [resolve(SRC, 'main.tsx'), resolve(SRC, 'App.tsx')];

/**
 * STATIC imports only, which is exactly the distinction that matters here: `lazy(() =>
 * import('./pages/PortfolioPage'))` is a chunk boundary, `import X from './pages/…'` is not.
 * The pattern is anchored to the start of a line, so a dynamic import — which only ever
 * appears inside an expression — is not matched.
 */
function staticImportSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /^(?:import|export)[\s\S]*?from\s+'([^']+)';/gm;
  for (const m of source.matchAll(re)) specs.push(m[1]);
  return specs;
}

/** Resolve a relative specifier to a real source file, or null for CSS/assets/packages. */
function resolveModule(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // node_modules — not ours to police
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(candidate) && !candidate.endsWith('.css')) {
      // A directory hit without an index file is not a module.
      if (candidate === base && !/\.tsx?$/.test(candidate)) continue;
      return candidate;
    }
  }
  return null;
}

/** Every module the browser must download before the first paint: the transitive closure of
 *  STATIC imports from the entry files. Everything behind `lazy()` is, by construction, not
 *  in here. */
function eagerClosure(): Map<string, string> {
  const seen = new Map<string, string>(); // file -> source
  const queue = [...ENTRIES];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    seen.set(file, source);
    for (const spec of staticImportSpecifiers(source)) {
      const target = resolveModule(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

const EAGER = eagerClosure();
const rel = (f: string) => f.slice(SRC.length + 1);

describe('first-load bundle boundary', () => {
  it('walks a graph that really contains the eager pages (the guard guards something)', () => {
    // Without this, a broken walk would make every assertion below vacuously true.
    const files = [...EAGER.keys()].map(rel);
    for (const page of [
      'App.tsx',
      'pages/OverviewPage.tsx',
      'pages/MyHarvestPage.tsx',
      'pages/BestCropsPage.tsx',
      'pages/PricesPage.tsx',
    ]) {
      expect(files).toContain(page);
    }
    // And that it does NOT drag the lazy destinations in: those are `lazy(() => import(…))`,
    // so a walk that picked them up would be matching dynamic imports too and the rule below
    // would fail for the wrong reason.
    expect(files).not.toContain('pages/PortfolioPage.tsx');
    expect(files).not.toContain('admin/AdminLayout.tsx');
  });

  it('no eagerly-loaded module imports lib/portfolio', () => {
    const offenders: string[] = [];
    for (const [file, source] of EAGER) {
      for (const spec of staticImportSpecifiers(source)) {
        if (resolveModule(file, spec) === LAZY_ONLY) offenders.push(`${rel(file)} -> ${spec}`);
      }
    }
    // Named in the failure so the fix is obvious: move the symbol to a leaf module (see
    // lib/plantDate.ts), do not relax this.
    expect(offenders).toEqual([]);
  });

  it('lib/plantDate — the leaf that exists FOR the eager side — stays free of portfolio', () => {
    // If this file ever imports lib/portfolio it becomes a second doorway to the module it
    // was created to keep out, and the guard above would still pass.
    const plantDate = resolve(SRC, 'lib/plantDate.ts');
    const specs = staticImportSpecifiers(readFileSync(plantDate, 'utf8'));
    expect(specs.map((s) => resolveModule(plantDate, s))).not.toContain(LAZY_ONLY);
  });
});
