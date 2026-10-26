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
    .filter((p) => /(?:from|import)\s+["']@mantine\//.test(readFileSync(p, "utf8")))
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

test("the only global stylesheets are tokens.css and base.css", () => {
  const sheets = files(join(SRC, "styles"), [".css"]).map(rel).sort();
  assert.deepEqual(sheets, ["styles/base.css", "styles/tokens.css"], "Put page styles in a co-located .module.css.");
});
