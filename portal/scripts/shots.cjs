/**
 * `npm run shots`: every portal screen at desktop and phone width, light and
 * dark side by side, in one page to look through: portal/.shots/report.html
 * (not committed). The live portal is the design reference: compare a changed
 * screen with the screens around it.
 *
 * Needs the portal's dev server running (`npm run dev`; set PORT if it isn't
 * 3000) and the Playwright that's installed on the machine. Options:
 *   --only=events,purchases   just the screens whose name or path has a word
 *   --light / --dark          one colour scheme instead of both
 *   --desktop / --phone       one width instead of both
 */
const { chromium } = require("playwright");
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { SIZES, BASE, signedIn, selected, checkServer } = require("./screens.cjs");

const argv = process.argv.slice(2);
const OUT = resolve(__dirname, "..", ".shots");
const schemes = argv.includes("--light") ? ["light"] : argv.includes("--dark") ? ["dark"] : ["light", "dark"];
const sizes = SIZES.filter((s) => !(argv.includes("--desktop") && s.tag !== "desktop") && !(argv.includes("--phone") && s.tag !== "phone"));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

(async () => {
  await checkServer();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "img"), { recursive: true });
  const screens = selected(argv);
  const browser = await chromium.launch();
  const rows = [];
  const problems = [];
  for (const s of screens) {
    for (const size of sizes) {
      for (const scheme of schemes) {
        const key = `${slug(s.name)}-${size.tag}-${scheme}`;
        const ctx = await signedIn(browser, s.as, size, scheme);
        const page = await ctx.newPage();
        page.on("pageerror", (e) => problems.push(`${s.name} (${size.tag}, ${scheme}): ${e.message.split("\n")[0]}`));
        const res = await page.goto(BASE + s.path, { waitUntil: "networkidle" }).catch(() => null);
        if (!res || res.status() >= 400) problems.push(`${s.name}: ${BASE + s.path} answered ${res ? res.status() : "nothing"}`);
        await page.screenshot({ path: join(OUT, "img", `${key}.png`), fullPage: true });
        await ctx.close();
        rows.push({ s, size, scheme, img: `img/${key}.png` });
        process.stdout.write(".");
      }
    }
  }
  await browser.close();

  // One section per screen and width, its colour schemes side by side.
  const groups = [];
  for (const r of rows) {
    const id = `${slug(r.s.name)}-${r.size.tag}`;
    let g = groups.find((x) => x.id === id);
    if (!g) groups.push((g = { id, s: r.s, size: r.size, shots: [] }));
    g.shots.push(r);
  }
  const section = (g) => `
  <section id="${g.id}">
    <h2>${esc(g.s.name)} <small>${g.size.tag} · as ${esc(g.s.as)} · <a href="${esc(BASE + g.s.path)}">${esc(g.s.path)}</a></small></h2>
    <div class="pair ${g.size.tag}">
      ${g.shots.map((r) => `<figure><figcaption>${r.scheme}</figcaption><img loading="lazy" src="${r.img}" alt="${esc(g.s.name)}, ${r.scheme}"></figure>`).join("")}
    </div>
  </section>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Portal screens</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 16px 24px 64px; background: #f4f1e8; color: #13241b; }
  h1 { margin: 0 0 4px; } nav { columns: 4 220px; margin: 12px 0 24px; } nav a { display: block; }
  section { margin: 0 0 40px; } h2 { font-size: 16px; margin: 0 0 8px; } h2 small { font-weight: 400; color: #4f5b53; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; } .pair.phone { grid-template-columns: repeat(2, 390px); }
  figure { margin: 0; background: #fff; border: 1px solid #e4dcc6; border-radius: 8px; overflow: hidden; } figcaption { padding: 6px 10px; font-weight: 600; border-bottom: 1px solid #e4dcc6; }
  img { display: block; width: 100%; height: auto; } .problems { background: #f7e0dd; padding: 12px 16px; border-radius: 8px; }
</style></head><body>
<h1>Portal screens</h1>
<p>${rows.length} captures from ${esc(BASE)} on ${new Date().toLocaleString("en-US")}.</p>
${problems.length ? `<div class="problems"><strong>Problems while capturing</strong><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>` : ""}
<nav>${groups.map((g) => `<a href="#${g.id}">${esc(g.s.name)} · ${g.size.tag}</a>`).join("")}</nav>
${groups.map(section).join("")}
</body></html>`;
  writeFileSync(join(OUT, "report.html"), html);
  console.log(`\n${rows.length} captures. Open ${join(OUT, "report.html")}`);
  if (problems.length) console.log(`Problems:\n  ${problems.join("\n  ")}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
