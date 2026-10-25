/**
 * Keeps the design system from eroding (docs/design-system.md):
 * colours only in tokens.css, Mantine only behind our wrappers in
 * src/components, and a count of one-off inline styles in pages.
 * Runs from the portal folder (npm test).
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

/** Raw colour values: hex, rgb(a) and hsl(a) in CSS; quoted hex strings in TypeScript. */
function rawColours(path: string): string[] {
  const text = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const re = path.endsWith(".css") ? /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/g : /["'`]#[0-9a-fA-F]{3,8}["'`]|\b(?:rgb|rgba|hsl|hsla)\(/g;
  return text.match(re) ?? [];
}

test("shared components and styles use colour tokens, never raw colours", () => {
  const checked = [...files(join(SRC, "components"), [".css", ".ts", ".tsx"]), ...files(join(SRC, "styles"), [".css"])].filter((p) => !p.endsWith("tokens.css"));
  const bad = checked.flatMap((p) => rawColours(p).map((c) => `${rel(p)}: ${c}`));
  assert.deepEqual(bad, [], "Add the colour to src/styles/tokens.css and use its var(--name).");
});

test("pages: raw colours (report only until wave 2 moves pages onto components)", () => {
  const found = files(join(SRC, "app"), [".css", ".tsx", ".ts"]).flatMap((p) => rawColours(p).map((c) => `${rel(p)}: ${c}`));
  if (found.length) console.log(`  ${found.length} raw colour(s) in src/app:\n    ${found.join("\n    ")}`);
});

test("only src/components and the root layout import Mantine", () => {
  const offenders = files(SRC, [".ts", ".tsx"])
    .filter((p) => /from\s+["']@mantine\//.test(readFileSync(p, "utf8")) || /import\s+["']@mantine\//.test(readFileSync(p, "utf8")))
    .map(rel)
    .filter((p) => !p.startsWith("components/") && p !== "app/layout.tsx");
  assert.deepEqual(offenders, [], "Pages use the wrappers in src/components (DateField, RoomPicker, FileDrop, …), never @mantine/* directly.");
});

test("pages: inline styles (report only; use the layout classes in base.css)", () => {
  const counts = files(join(SRC, "app"), [".tsx"])
    .map((p) => [rel(p), (readFileSync(p, "utf8").match(/style=\{\{/g) ?? []).length] as const)
    .filter(([, n]) => n > 0);
  const total = counts.reduce((a, [, n]) => a + n, 0);
  console.log(`  ${total} inline style(s) in src/app${total ? ":\n    " + counts.map(([p, n]) => `${p} ${n}`).join("\n    ") : ""}`);
});
