// The crop card's one structural CSS rule, as a tripwire — the sibling of
// bundle-boundary.test.ts, and it exists for the same reason: a regression that breaks the
// product while every behaviour test stays green.
//
// WHY THIS EXISTS. `container-type: inline-size` (and the `container:` shorthand) applies
// LAYOUT CONTAINMENT, which makes the element a containing block for `position: fixed`
// descendants. The "More details" dialog is rendered INSIDE the crop card's <li> — Modal
// does not portal, there is no createPortal anywhere in this repo — and .pf-modal__backdrop
// is position:fixed. So declaring the container on `.pf-card` traps the whole dialog inside
// one card: on the desktop grid the backdrop covers a single ~340px column instead of the
// screen, and the cards after it in the DOM paint over the open sheet. The container
// therefore lives on `.pf-card__inner`, which the dialog is a SIBLING of, so it escapes.
//
// The card tests pin the DOM half of that invariant (the dialog is not inside
// .pf-card__inner). They cannot pin the CSS half: jsdom applies no styles, so moving the
// declaration back onto `.pf-card` leaves the entire suite green — which is exactly what the
// reviewer demonstrated. This file reads the stylesheet as text and pins the CSS half.
//
// WHAT THIS IS NOT: a containment oracle. It knows one file and one declaration. If the
// dialog ever gets portalled to document.body, this rule stops being load-bearing — delete
// it deliberately, with the portal, rather than widening it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS_PATH = resolve(__dirname, '../styles/portfolio.css');

/** The element allowed to be a query container: it is not an ancestor of the dialog. */
const CONTAINER_OWNER = '.pf-card__inner';

/** `container:` / `container-type:` at the start of a declaration — not `container-name`
 *  alone (which applies no containment) and not a word inside a comment or another
 *  property. Multiline, because a rule body starts on the line after its brace. Comments
 *  are stripped before this is applied. */
const CONTAINMENT_DECL = /(?:^|;)\s*container(-type)?\s*:/m;

interface Rule {
  selectors: string[];
  body: string;
}

/**
 * Every style rule in a stylesheet, flattened out of its at-rules.
 *
 * A regex over `sel { … }` cannot do this: @container and @media nest, and this file is full
 * of both, so the naive version would read a whole at-rule body as one declaration block and
 * mistake `@container pf-card (min-width: 360px)` for a selector. This walks braces instead,
 * recursing into anything that starts with `@` and yielding only real rules.
 */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const walk = (text: string) => {
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
      if (prelude.startsWith('@')) walk(body);
      else if (prelude.length > 0) {
        out.push({ selectors: prelude.split(',').map((s) => s.trim()), body });
      }
      i = j;
    }
  };
  walk(css);
  return out;
}

const source = readFileSync(CSS_PATH, 'utf8');
// Comments carry the words this test looks for — including the explanation of why the
// container is where it is — so they go first.
const parsed = rules(source.replace(/\/\*[\s\S]*?\*\//g, ''));

describe('crop card CSS: the query container must not be an ancestor of the dialog', () => {
  it('parses the stylesheet into real rules (self-check, so a broken parser cannot pass)', () => {
    // Without this, a parser that returned [] would make every assertion below vacuously
    // true and the tripwire would be silently disarmed.
    expect(parsed.length).toBeGreaterThan(50);
    expect(parsed.some((r) => r.selectors.includes('.pf-card__top'))).toBe(true);
    expect(parsed.some((r) => r.selectors.includes(CONTAINER_OWNER))).toBe(true);
    // The at-rule walker really did descend: these only exist inside @container blocks.
    expect(parsed.some((r) => r.selectors.some((s) => s.includes(':has(')))).toBe(true);
  });

  it('declares the container on .pf-card__inner', () => {
    const owner = parsed.filter(
      (r) => r.selectors.includes(CONTAINER_OWNER) && CONTAINMENT_DECL.test(r.body),
    );
    expect(owner).toHaveLength(1);
  });

  it('declares it NOWHERE else — above all not on .pf-card, which contains the dialog', () => {
    const containers = parsed.filter((r) => CONTAINMENT_DECL.test(r.body));
    const offenders = containers
      .flatMap((r) => r.selectors)
      .filter((s) => s !== CONTAINER_OWNER);
    // Named so a failure reads as the bug it is, not as "expected 1 to be 0".
    expect({ containmentDeclaredOn: offenders }).toEqual({ containmentDeclaredOn: [] });
  });

  it('still describes a backdrop that CARES: .pf-modal__backdrop is position: fixed', () => {
    // The coupling this whole file rests on. If the backdrop stops being fixed — or the
    // dialog gets portalled out of the card — re-read the reasoning above before moving the
    // container; do not just delete this line to make the suite green.
    // It is styled in two places (base rule + a wide-screen tweak); exactly one of them
    // positions it, and that one must say `fixed`.
    const positioned = parsed
      .filter((r) => r.selectors.includes('.pf-modal__backdrop'))
      .filter((r) => /(?:^|;)\s*position\s*:/m.test(r.body));
    expect(positioned).toHaveLength(1);
    expect(positioned[0].body).toMatch(/position\s*:\s*fixed/);
  });
});
