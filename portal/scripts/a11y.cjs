/**
 * `npm run a11y`: checks every screen in scripts/screens.cjs, as its sample
 * user, at desktop and phone width (and text contrast in light and dark):
 *   - the page has its own title, not just "IAR Portal"
 *   - exactly one h1, and no skipped heading levels
 *   - every form control has a label; every image has alt text
 *   - every link and button has a name a screen reader can read
 *   - on phones: tap targets at least 24px, and no sideways scrolling
 *   - text contrast at least 4.5:1 (3:1 for large text) against its background
 * Prints what it finds. Exits non-zero only with --strict (for CI later).
 * Needs `npm run dev` running (PORT if not 3000). Also takes --only=words and
 * --json (writes .shots/a11y.json).
 */
const { chromium } = require("playwright");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { SIZES, BASE, signedIn, selected, checkServer } = require("./screens.cjs");

const argv = process.argv.slice(2);
const STRICT = argv.includes("--strict");

/** Runs in the page. Returns { check: [details…] } for one screen at one width. */
function audit({ phone, structure }) {
  const out = {};
  const add = (check, detail) => (out[check] ||= []).push(detail);
  const visible = (el) => {
    if (!(el instanceof Element)) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.closest("[aria-hidden='true'], [hidden], dialog:not([open])");
  };
  const describe = (el) => {
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : "";
    const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("name") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls}${text ? ` "${text}"` : ""}`;
  };
  const nameOf = (el) => {
    const by = el.getAttribute("aria-labelledby");
    if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ").trim();
    return (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || [...el.querySelectorAll("img[alt], svg title")].map((x) => x.getAttribute("alt") || x.textContent).join(" ") || "").trim();
  };

  if (structure) {
    if (!document.title || document.title.trim() === "IAR Portal") add("title", `"${document.title}"`);
    const hs = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible);
    const h1s = hs.filter((h) => h.tagName === "H1").length;
    if (h1s !== 1) add("one h1", `${h1s} h1 headings`);
    let last = 0;
    for (const h of hs) {
      const n = Number(h.tagName[1]);
      if (last && n > last + 1) add("heading levels", `h${last} → h${n} at ${describe(h)}`);
      last = n;
    }
    for (const el of document.querySelectorAll("input, select, textarea")) {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type) || !visible(el)) continue;
      const labelled = (el.labels && el.labels.length) || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title");
      if (!labelled) add("labels", describe(el));
    }
    for (const img of document.querySelectorAll("img")) if (!img.hasAttribute("alt")) add("image alt", img.getAttribute("src")?.slice(0, 60) || "img");
    for (const el of document.querySelectorAll("a[href], button, [role='button']")) {
      if (visible(el) && !nameOf(el)) add("names", describe(el) || el.outerHTML.slice(0, 80));
    }
    if (phone) {
      for (const el of document.querySelectorAll("a[href], button, select, input[type='checkbox'], input[type='radio'], [role='button']")) {
        if (!visible(el)) continue;
        // Links inside a sentence are exempt (WCAG 2.5.8 "inline").
        if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
        const r = el.getBoundingClientRect();
        // A small checkbox or radio is fine when its whole label is the target.
        const target = (el.type === "checkbox" || el.type === "radio") && el.closest("label") ? el.closest("label").getBoundingClientRect() : r;
        if (target.width < 24 || target.height < 24) add("tap targets", `${describe(el)} ${Math.round(target.width)}×${Math.round(target.height)}`);
      }
      const extra = document.documentElement.scrollWidth - window.innerWidth;
      if (extra > 1) add("sideways scroll", `page is ${extra}px wider than the screen`);
    }
  }

  // Contrast: elements with their own text, against the first solid background behind them.
  const rgba = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== "none" && !s.backgroundImage.startsWith("url(")) return null; // gradients: can't judge
      const c = rgba(s.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (const l of layers.reverse()) bg = over(l, bg);
    return bg;
  };
  const seen = new Set();
  let checked = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() && checked < 600) {
    const t = walker.currentNode;
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el) || !visible(el) || el.closest("[disabled], [aria-disabled='true'], .sr-only, svg, nextjs-portal")) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    if (Number(s.opacity) < 1) continue;
    const fg = rgba(s.color);
    const bg = background(el);
    if (!fg || !bg) continue;
    checked++;
    const ink = over(fg, bg);
    const [a, b] = [lum(ink), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) add("contrast", `${describe(el)} ${ratio.toFixed(2)}:1 (${s.color} on rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)}))`);
  }
  return out;
}

(async () => {
  await checkServer();
  const screens = selected(argv);
  const browser = await chromium.launch();
  const results = [];
  for (const s of screens) {
    for (const size of SIZES) {
      for (const scheme of ["light", "dark"]) {
        const ctx = await signedIn(browser, s.as, size, scheme);
        const page = await ctx.newPage();
        const res = await page.goto(BASE + s.path, { waitUntil: "networkidle" }).catch(() => null);
        if (!res || res.status() >= 400) {
          results.push({ screen: s.name, size: size.tag, scheme, found: { "page loads": [`${BASE + s.path} answered ${res ? res.status() : "nothing"}`] } });
        } else {
          // Structure doesn't change with the colour scheme, so check it once (light); contrast in both.
          const found = await page.evaluate(audit, { phone: size.tag === "phone", structure: scheme === "light" });
          results.push({ screen: s.name, size: size.tag, scheme, found });
        }
        await ctx.close();
        process.stdout.write(".");
      }
    }
  }
  await browser.close();
  console.log("\n");

  const totals = {};
  for (const r of results) {
    const checks = Object.entries(r.found);
    if (!checks.length) continue;
    console.log(`${r.screen} · ${r.size} · ${r.scheme}`);
    for (const [check, list] of checks) {
      totals[check] = (totals[check] || 0) + list.length;
      const unique = [...new Set(list)];
      console.log(`  ${check} (${list.length}): ${unique.slice(0, 4).join("; ")}${unique.length > 4 ? `; and ${unique.length - 4} more` : ""}`);
    }
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(total ? `\nFound ${total}: ${Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(", ")}` : "\nNothing found. All screens pass.");
  if (argv.includes("--json")) {
    const dir = resolve(__dirname, "..", ".shots");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a11y.json"), JSON.stringify(results, null, 2));
    console.log(`Details: ${join(dir, "a11y.json")}`);
  }
  if (STRICT && total) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
