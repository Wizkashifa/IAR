/**
 * Keeps the design system from eroding (docs/design-system.md): colours only
 * in tokens.css, Mantine only behind our wrappers in src/components, and no
 * one-off inline styles. Each rule has a short allowlist for the few places
 * that genuinely need an exception; anything else fails. Runs from the portal
 * folder (npm test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(process.cwd(), "src");

function files(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p, exts);
    return exts.some((e) => name.endsWith(e)) && !name.endsWith(".test.ts") ? [p] : [];
  });
}
const rel = (p: string) => relative(SRC, p).split(sep).join("/");

/**
 * Raw colours allowed outside tokens.css. Browsers read these before any CSS
 * loads, so they can't use var(--…): keep them equal to --brand-green and --bg.
 */
const COLOUR_ALLOWED = new Set(["app/layout.tsx", "app/manifest.ts"]);
/** Inline styles allowed: the style page paints each token swatch from its own variable. */
const INLINE_STYLE_ALLOWED = new Set(["app/dev/styles/page.tsx"]);
/** Files that may import Mantine: the wrappers, and the root layout for the provider and its colour-scheme script. */
const mantineAllowed = (p: string) => p.startsWith("components/") || p === "app/layout.tsx";

/** Raw colour values: hex, rgb(a) and hsl(a) in CSS; quoted hex strings in TypeScript. */
function rawColours(path: string): string[] {
  const text = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const re = path.endsWith(".css") ? /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/g : /["'`]#[0-9a-fA-F]{3,8}["'`]|\b(?:rgb|rgba|hsl|hsla)\(/g;
  return text.match(re) ?? [];
}

test("colours come from tokens.css, never raw values", () => {
  const bad = files(SRC, [".css", ".ts", ".tsx"])
    .filter((p) => !p.endsWith("styles/tokens.css") && !COLOUR_ALLOWED.has(rel(p)))
    .flatMap((p) => rawColours(p).map((c) => `${rel(p)}: ${c}`));
  assert.deepEqual(bad, [], "Add the colour to src/styles/tokens.css and use its var(--name).");
});

test("the allowed raw colours match the brand tokens", () => {
  const tokens = readFileSync(join(SRC, "styles/tokens.css"), "utf8").toLowerCase();
  for (const p of COLOUR_ALLOWED) {
    for (const c of readFileSync(join(SRC, p), "utf8").match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
      assert.ok(tokens.includes(c.toLowerCase()), `${p}: ${c} isn't a token value in tokens.css; keep it in step with the brand.`);
    }
  }
});

test("only src/components and the root layout import Mantine", () => {
  const offenders = files(SRC, [".ts", ".tsx"])
    .filter((p) => /(?:from|import)\s*\(?\s*["']@mantine\/|require\(\s*["']@mantine\//.test(readFileSync(p, "utf8")))
    .map(rel)
    .filter((p) => !mantineAllowed(p));
  assert.deepEqual(offenders, [], "Pages use the wrappers in src/components (DateField, RoomPicker, FileDrop, …), never @mantine/* directly.");
});

test("no inline styles: use the layout classes in base.css or a CSS module", () => {
  const offenders = files(SRC, [".tsx"])
    .filter((p) => !INLINE_STYLE_ALLOWED.has(rel(p)))
    .flatMap((p) => {
      const n = (readFileSync(p, "utf8").match(/\bstyle=\{/g) ?? []).length;
      return n ? [`${rel(p)}: ${n}`] : [];
    });
  assert.deepEqual(offenders, [], "Move the style into the component's .module.css (or a layout class), using tokens.");
});

/**
 * Global class names (className="stack row") must exist in base.css, the one
 * global stylesheet besides tokens.css. Anything page- or component-specific
 * belongs in a co-located .module.css, so a typo or a leftover class from an
 * old page can't quietly do nothing.
 */
test("global class names are defined in base.css", () => {
  const css = readFileSync(join(SRC, "styles/base.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const defined = new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
  const bad: string[] = [];
  for (const p of files(SRC, [".tsx"])) {
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const literal = (m[1] ?? m[2] ?? "").replace(/\$\{[^}]*\}/g, " ");
      for (const name of literal.split(/\s+/).filter(Boolean)) {
        if (!defined.has(name)) bad.push(`${rel(p)}: ${name}`);
      }
    }
  }
  assert.deepEqual(bad, [], "Use a class from src/styles/base.css, or a co-located .module.css class.");
});

/**
 * The screen widths a layout may change at (tokens.css lists them): 520px small
 * phone, 640px phone, 1000px menu beside the page, and the calendar's own
 * 760px and 1100px. Layouts inside the page use @container page instead.
 */
const BREAKPOINTS = new Set(["520px", "640px", "760px", "999.98px", "1100px"]);

test("media queries use the portal's breakpoints", () => {
  const bad = files(SRC, [".css"]).flatMap((p) =>
    [...readFileSync(p, "utf8").matchAll(/@media[^{]*?\((?:max|min)-width:\s*([\d.]+px)\)/g)]
      .map((m) => m[1]!)
      .filter((w) => !BREAKPOINTS.has(w))
      .map((w) => `${rel(p)}: ${w}`),
  );
  assert.deepEqual(bad, [], "Use 520px, 640px or 999.98px (tokens.css), or an @container page query inside the page.");
});

/**
 * Motion eases out (tokens.css --ease): it starts quickly and settles. A
 * transition or animation without a curve gets the browser's "ease", which
 * starts slowly, so each one names var(--ease); ease-in, ease-in-out, plain
 * ease and linear are never used.
 */
test("every transition and animation eases out with var(--ease)", () => {
  const bad: string[] = [];
  for (const p of files(SRC, [".css"])) {
    const css = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/(?<![-\w])(transition|animation)\s*:\s*([^;{}]+);/g)) {
      const value = m[2]!.trim();
      if (value === "none") continue;
      // Each comma-separated part (one property or one animation) names the curve.
      const parts = value.split(/,(?![^(]*\))/).map((s) => s.trim());
      for (const part of parts) {
        const other = /\b(?:ease|ease-in|ease-out|ease-in-out|linear|cubic-bezier|steps)\b/.test(part.replaceAll("var(--ease)", ""));
        if (!part.includes("var(--ease)") || other) bad.push(`${rel(p)}: ${m[1]}: ${part}`);
      }
    }
    for (const m of css.matchAll(/(?:transition|animation)-timing-function\s*:\s*([^;{}]+);/g)) {
      if (!m[1]!.includes("var(--ease)")) bad.push(`${rel(p)}: timing ${m[1]}`);
    }
  }
  assert.deepEqual(bad, [], "Add var(--ease) to each part (tokens.css): every motion in the portal eases out.");
});

test("the only global stylesheets are tokens.css and base.css", () => {
  const sheets = files(join(SRC, "styles"), [".css"]).map(rel).sort();
  assert.deepEqual(sheets, ["styles/base.css", "styles/tokens.css"], "Put page styles in a co-located .module.css.");
});

/**
 * Contrast, worked out from the tokens themselves in light and dark (WCAG 2):
 * text 4.5:1 against what it sits on, and 3:1 for the edges of controls, the
 * focus ring and icons that mean something. Card outlines and the gold heading
 * lines are decoration and aren't listed. Add a pair when you add a token that
 * colours text or a control.
 */
function themes(): { light: Map<string, string>; dark: Map<string, string> } {
  const css = readFileSync(join(SRC, "styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (sel: RegExp) => {
    const at = css.search(sel);
    const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
    return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  };
  const light = block(/:root\s*\{/);
  const dark = new Map([...light, ...block(/:root\[data-mantine-color-scheme="dark"\]\s*\{/)]);
  return { light, dark };
}

function hex(tokens: Map<string, string>, name: string): string {
  let v = tokens.get(name);
  for (let i = 0; v && v.startsWith("var(") && i < 5; i++) v = tokens.get(v.slice(4, -1).trim());
  assert.ok(v && /^#[0-9a-f]{6}$/i.test(v), `${name} isn't a plain #rrggbb colour`);
  return v!;
}

function ratio(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, b2] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b2!;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** [foreground, background, minimum]. */
const PAIRS: [string, string, number][] = [
  // Text on the page and on cards
  ...["--ink", "--ink-2", "--ink-3", "--accent-text", "--gold-text"].flatMap((t): [string, string, number][] => [
    [t, "--bg", 4.5],
    [t, "--surface", 4.5],
  ]),
  ["--ink-3", "--surface-2", 4.5],
  // Page heads and the "What's new" box
  ...["--ink", "--ink-2", "--gold-text", "--accent-text"].flatMap((t): [string, string, number][] => [
    [t, "--head-band", 4.5],
    [t, "--news-bg", 4.5],
  ]),
  ["--accent-ink", "--accent", 4.5],
  // Status pills and notes
  ["--ok", "--ok-soft", 4.5],
  ["--warn", "--warn-soft", 4.5],
  ["--bad", "--bad-soft", 4.5],
  ["--info", "--info-soft", 4.5],
  // Outlined pills in dark mode put the status colour straight on the card or the page
  ...["--ok", "--warn", "--bad", "--info", "--accent-text"].flatMap((t): [string, string, number][] => [
    [t, "--surface", 4.5],
    [t, "--bg", 4.5],
  ]),
  // The menu and the header
  ["--nav-text", "--nav-bg", 4.5],
  ["--nav-group", "--nav-bg", 4.5],
  ["--nav-on-text", "--nav-on", 4.5],
  ["--header-placeholder", "--header-input-bg", 4.5],
  // Module accents: the colour on its icon tile and page head, the page's text on the head, its icon on the menu
  ...["events", "pay", "mkt", "it"].flatMap((m): [string, string, number][] => [
    [`--mod-${m}`, `--mod-${m}-soft`, 4.5],
    [`--mod-${m}`, `--mod-${m}-tint`, 4.5],
    [`--mod-${m}`, "--surface", 4.5],
    [`--mod-${m}-tint`, `--mod-${m}`, 4.5],
    ["--ink", `--mod-${m}-tint`, 4.5],
    ["--ink-2", `--mod-${m}-tint`, 4.5],
    [`--mod-${m}-nav`, "--nav-bg", 3],
  ]),
  // Menu counts, fields and popovers (a step up from the cards in dark mode)
  ["--count-ink", "--count-bg", 4.5],
  ...["--ink", "--ink-2", "--ink-3"].flatMap((t): [string, string, number][] => [
    [t, "--field-bg", 4.5],
    [t, "--popover-bg", 4.5],
  ]),
  ["--ctl", "--field-bg", 3],
  ["--focus", "--field-bg", 3],
  ["--focus", "--popover-bg", 3],
  ["--nav-text", "--nav-on", 4.5],
  // Control edges and the focus ring
  ["--ctl", "--surface", 3],
  ["--ctl", "--bg", 3],
  ["--focus", "--surface", 3],
  ["--focus", "--bg", 3],
  ["--gold-light", "--nav-bg", 3],
  ["--gold-light", "--brand-green", 3],
  ["--empty-stroke", "--surface", 3],
  // The event timeline: a booked time's label sits on its block; a requested time's outline on the card
  ["--surface", "--hold-booking", 4.5],
  ["--hold-request", "--surface", 3],
];

test("token colours have enough contrast, light and dark", () => {
  const bad: string[] = [];
  for (const [scheme, tokens] of Object.entries(themes())) {
    for (const [fg, bg, min] of PAIRS) {
      const r = ratio(hex(tokens, fg), hex(tokens, bg));
      if (r < min) bad.push(`${scheme}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
    }
  }
  assert.deepEqual(bad, [], "Darken (light) or lighten (dark) the foreground in tokens.css.");
});
