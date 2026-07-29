// A tiny CSS reader for the stylesheet tripwires.
//
// jsdom applies no styles, so every structural CSS invariant this app depends on — the query
// container that must not swallow the dialog, the tooltip that must not be laid out while it
// is closed — is invisible to the component tests. Those invariants are pinned by reading the
// stylesheet as text instead, and this is the reader they share.
//
// A regex over `sel { … }` cannot do the job: portfolio.css is full of nested @media and
// @container blocks, so the naive version reads a whole at-rule body as one declaration block
// and mistakes `@container pf-card (min-width: 360px)` for a selector. This walks braces,
// recurses into at-rules, and remembers which at-rules a rule was found inside — that context
// is itself load-bearing (a reveal rule inside `@media (hover: hover)` behaves differently
// from the same rule at the top level).
//
// It is not a CSS parser and must not grow into one. Extend it only when a tripwire needs it.

export interface Rule {
  selectors: string[];
  body: string;
  /** The at-rule preludes this rule sits inside, outermost first. */
  at: string[];
}

/** Comments carry the words these tripwires look for, so they always go first. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every style rule in a stylesheet, flattened out of its at-rules. */
export function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const walk = (text: string, at: string[]) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open === -1) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') depth -= 1;
        j += 1;
      }
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith('@')) walk(body, [...at, prelude]);
      else if (prelude.length > 0) {
        out.push({ selectors: prelude.split(',').map((s) => s.trim()), body, at });
      }
      i = j;
    }
  };
  walk(stripComments(css), []);
  return out;
}

/** True when `body` declares `prop` (start of a declaration, never a word inside another). */
export function declares(body: string, prop: string): boolean {
  return new RegExp(`(?:^|;)\\s*${prop}\\s*:`, 'm').test(body);
}
