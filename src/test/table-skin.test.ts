// The app-wide table skin, as a tripwire.
//
// WHY THIS EXISTS. jsdom applies no styles (vitest runs with `css: false`), so every component
// test in this repo would stay green if .adm-table quietly grew its own header rule again
// tomorrow — which is exactly how the product ended up with five different tables in the first
// place: .pf-table uppercased muted headers, .adm-table and .ing-table drew a 2px
// --line-strong rule under theirs, .ov-table separated its rows with --chart-grid, .bc-table
// repeated the 2px rule. Nothing was broken; they had simply drifted, one honest local edit at
// a time. This file reads the stylesheets as text and fails the build the next time it starts.
//
// WHAT THIS IS NOT: a CSS oracle, or a renderer. It knows five selector families and a short
// list of properties that decide how a table LOOKS. It cannot tell you the skin is pretty, and
// it does not try to police layout, density or breakpoints — those genuinely belong to each
// family. If a rule below ever blocks a legitimate change, move the declaration into
// styles/tables.css (which is the point) or change this file deliberately, with the reason.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rules, declares, stripComments, type Rule } from './support/cssRules';

const SRC = resolve(__dirname, '..');
const SKIN = resolve(SRC, 'styles/tables.css');

/** The stylesheets that own a skinned table family. None of them may re-decide the look. */
const FAMILY_SHEETS = {
  'styles/portfolio.css': resolve(SRC, 'styles/portfolio.css'),
  'admin/admin.css': resolve(SRC, 'admin/admin.css'),
  'styles/overview.css': resolve(SRC, 'styles/overview.css'),
  'styles/bestcrops.css': resolve(SRC, 'styles/bestcrops.css'),
} as const;

/** Every table wearing the skin. All five must be named in tables.css. */
const FAMILIES = ['.pf-table', '.adm-table', '.ing-table', '.ov-table', '.bc-table'] as const;

/**
 * The properties that decide how a table LOOKS, as opposed to how it is laid out. A family
 * stylesheet declaring one of these ON A TABLE SELECTOR is the drift this file exists to stop.
 *
 * Deliberately NOT in this list, because they are each family's own business: padding (density
 * — the sales table has to fit six columns into a 560px popup), width, white-space,
 * vertical-align, display, and everything inside a stacked-card breakpoint.
 */
const SKIN_PROPS = ['border-collapse', 'border-bottom', 'text-transform', 'letter-spacing'];

const skinRules = rules(readFileSync(SKIN, 'utf8'));

/** Selectors that address one of the skinned tables (or a cell/row inside one). */
function touchesFamily(selector: string): boolean {
  return FAMILIES.some((f) => selector.includes(f));
}

/** A rule inside a stacked-card breakpoint: below it the rows are CARDS, not rows, and the
 *  borders a card draws around and inside itself are structure rather than skin. */
function isStackedMode(rule: Rule): boolean {
  return rule.at.some((a) => /max-width/.test(a));
}

describe('the table skin is declared once, in styles/tables.css', () => {
  it('parses tables.css into real rules (self-check, so nothing below can pass vacuously)', () => {
    expect(skinRules.length).toBeGreaterThan(10);
    expect(skinRules.some((r) => r.selectors.includes('.tbl-iconbtn'))).toBe(true);
    // The at-rule walker really descended: these only exist inside @media blocks.
    expect(skinRules.some((r) => r.at.length > 0)).toBe(true);
  });

  it.each(FAMILIES)('dresses %s: border-collapse, cell hairline and header rule', (family) => {
    const forFamily = skinRules.filter((r) => r.selectors.some((s) => s.includes(family)));
    // the grid itself
    expect(forFamily.some((r) => declares(r.body, 'border-collapse'))).toBe(true);
    // the row separator
    expect(
      forFamily.some(
        (r) => r.selectors.some((s) => s === `${family} td`) && declares(r.body, 'border-bottom'),
      ),
    ).toBe(true);
    // the header row — white, dark, bold, sentence case
    const head = forFamily.filter((r) => r.selectors.includes(`${family} thead th`));
    expect(head).toHaveLength(1);
    expect(head[0].body).toMatch(/background\s*:\s*var\(--surface\)/);
    expect(head[0].body).toMatch(/color\s*:\s*var\(--text\)/);
    expect(head[0].body).toMatch(/font-weight\s*:\s*var\(--fw-bold\)/);
    expect(head[0].body).toMatch(/text-transform\s*:\s*none/);
  });

  it('uses tokens only — no hard-coded colour anywhere in the skin', () => {
    // #rrggbb / #rgb, rgb(), hsl(). The tokens file is the ONLY place a literal colour lives.
    const literals = stripComments(readFileSync(SKIN, 'utf8')).match(
      /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g,
    );
    expect({ hardCodedColours: literals ?? [] }).toEqual({ hardCodedColours: [] });
  });

  it('declares `display` for NO table, row or cell outside stacked mode (the colSpan law)', () => {
    // One grouped rule now styles every cell in the product, so a single `display: flex`
    // typed into it would discard colSpan on the sales table's spanning message rows on BOTH
    // surfaces at once — the sales-log phase-2 hard law, invisible to jsdom, and a mutation
    // that survived this whole suite in round-1 review. `display` stays out of SKIN_PROPS
    // (family sheets' stacked modes legitimately re-display their cells); it is prohibited
    // HERE, on the skin side, where no rule has any business re-displaying table guts.
    const offenders = skinRules
      .filter((r) => !isStackedMode(r))
      .filter((r) => declares(r.body, 'display'))
      .flatMap((r) =>
        r.selectors.filter((s) => touchesFamily(s) || /(^|[\s>+~])(td|th|tr)\b[^ >+~]*$/.test(s)),
      );
    expect({ displayOnTableGuts: offenders }).toEqual({ displayOnTableGuts: [] });
  });
});

describe('no family stylesheet re-decides the table look', () => {
  it('cannot go vacuous: the family map is complete and every sheet still touches its family', () => {
    // Round-1 review emptied FAMILY_SHEETS and this file silently shrank from 14 tests to 10,
    // all green — `it.each` over an empty map produces no cases, not a failure. So the map's
    // exact membership is itself an assertion, and each sheet must still parse into at least
    // one rule that addresses a family, or a renamed/unparsed sheet reports zero offenders
    // below while its drift walks straight through.
    expect(Object.keys(FAMILY_SHEETS).sort()).toEqual([
      'admin/admin.css',
      'styles/bestcrops.css',
      'styles/overview.css',
      'styles/portfolio.css',
    ]);
    for (const [name, path] of Object.entries(FAMILY_SHEETS)) {
      const familyRules = rules(readFileSync(path, 'utf8')).filter((r) =>
        r.selectors.some(touchesFamily),
      );
      expect({ sheet: name, rulesTouchingAFamily: familyRules.length }).not.toEqual({
        sheet: name,
        rulesTouchingAFamily: 0,
      });
    }
  });

  it.each(Object.entries(FAMILY_SHEETS))('%s', (_name, path) => {
    const offenders = rules(readFileSync(path, 'utf8'))
      .filter((r) => !isStackedMode(r))
      .flatMap((r) =>
        r.selectors
          .filter(touchesFamily)
          .flatMap((s) => SKIN_PROPS.filter((p) => declares(r.body, p)).map((p) => `${s} { ${p} }`)),
      );
    // Named so a failure reads as the bug it is: "move this declaration into tables.css".
    expect({ redeclaredInsteadOfSkinned: offenders }).toEqual({ redeclaredInsteadOfSkinned: [] });
  });

  it('leaves NO uppercase heading on a table anywhere (tokens.css §5 rationale: ' +
    'Sinhala and Tamil have no case, and letter-spacing only loosens them)', () => {
    const offenders = Object.entries(FAMILY_SHEETS).flatMap(([name, path]) =>
      rules(readFileSync(path, 'utf8'))
        .filter((r) => /text-transform\s*:\s*uppercase/.test(r.body))
        .flatMap((r) => r.selectors.map((s) => `${name}: ${s}`)),
    );
    expect({ uppercased: offenders }).toEqual({ uppercased: [] });
  });
});

/** The chart "table view" alternates (inside <details>) are hand-aligned to the skin rather
 *  than wearing it — they are compact chart substitutes with their own max-widths, not data
 *  grids. This block pins the alignment (header colour, no uppercase) so it cannot silently
 *  drift back out, and pins that each sheet still styles its grid at all. */
const CHART_GRIDS = {
  '.cmp-table__grid': resolve(SRC, 'styles/compare.css'),
  '.fc-table__grid': resolve(SRC, 'styles/harvest.css'),
  '.tl-table__grid': resolve(SRC, 'styles/harvest.css'),
  '.pr-table__grid': resolve(SRC, 'styles/prices.css'),
} as const;

describe('the chart table-views stay aligned with the skin', () => {
  it.each(Object.entries(CHART_GRIDS))('%s', (grid, path) => {
    const rs = rules(readFileSync(path, 'utf8')).filter((r) =>
      r.selectors.some((s) => s.includes(grid)),
    );
    // The sheet really still styles this grid — a rename would otherwise pass vacuously.
    expect({ grid, rulesFound: rs.length }).not.toEqual({ grid, rulesFound: 0 });
    // Sentence case, like every other table (Sinhala and Tamil have no case).
    const uppercased = rs.filter((r) => /text-transform\s*:\s*uppercase/.test(r.body));
    expect({ grid, uppercased: uppercased.flatMap((r) => r.selectors) }).toEqual({
      grid,
      uppercased: [],
    });
    // Wherever the grid colours its header, it is the skin's header colour.
    const headerColours = rs
      .filter(
        (r) =>
          r.selectors.some((s) => s.includes(`${grid} thead th`)) &&
          /(^|[^-\w])color\s*:/.test(r.body),
      )
      .map((r) => /(?:^|[^-\w])color\s*:\s*([^;]+)/.exec(r.body)![1].trim());
    for (const c of headerColours) expect({ grid, headerColour: c }).toEqual({ grid, headerColour: 'var(--text)' });
  });
});

describe('the skin knows the difference between a row and a card', () => {
  it('only drops the last row’s hairline while the rows really ARE rows', () => {
    // Below each family's breakpoint every row becomes a card and those same cell borders are
    // the card's internal separators — dropping them there guts the last card in the list.
    const lastRow = skinRules.filter((r) => r.selectors.some((s) => s.includes(':last-child')));
    expect(lastRow.length).toBeGreaterThan(0);
    for (const r of lastRow) {
      // A real breakpoint, not merely the WORD min-width: `(min-width: 0px)` would satisfy a
      // regex and still gut the last card on every phone in the country. Every family's cards
      // start at 600px or 720px, so the guard has to open at 601px at the earliest.
      const floor = /min-width:\s*(\d+)px/.exec(r.at.join(' '));
      expect({ selector: r.selectors, floorPx: Number(floor?.[1]) }).toMatchObject({
        floorPx: expect.any(Number),
      });
      expect(Number(floor?.[1])).toBeGreaterThanOrEqual(601);
    }
  });

  it('steps the panel back in stacked mode, where each row draws its own card', () => {
    const unboxed = skinRules.filter(
      (r) => r.at.some((a) => /max-width/.test(a)) && /border\s*:\s*0/.test(r.body),
    );
    expect(unboxed.flatMap((r) => r.selectors)).toEqual(
      expect.arrayContaining(['.pf-tablewrap', '.adm-tablewrap']),
    );
  });
});
