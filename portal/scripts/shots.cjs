/**
 * `npm run shots`: every portal screen next to the matching demo screen, at
 * desktop and phone width, light and dark, in one page to look through:
 * portal/.shots/report.html (not committed).
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
const { pathToFileURL } = require("node:url");
const { SIZES, BASE, signedIn, selected, checkServer } = require("./screens.cjs");

const argv = process.argv.slice(2);
const OUT = resolve(__dirname, "..", ".shots");
const DEMO = pathToFileURL(resolve(__dirname, "..", "..", "demo", "index.html")).href;
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
        await page.screenshot({ path: join(OUT, "img", `${key}-portal.png`), fullPage: true });
        let demo = null;
        if (s.demo) {
          await page.goto(DEMO);
          await page.waitForFunction(() => typeof go === "function");
          await page.evaluate(({ view, arg, as }) => {
            /* global S, go */
            S.me = as;
            S.guide = false;
            go(view, arg);
          }, s.demo);
          await page.waitForTimeout(250);
          await page.screenshot({ path: join(OUT, "img", `${key}-demo.png`), fullPage: true });
          demo = `img/${key}-demo.png`;
        }
        await ctx.close();
        rows.push({ s, size, scheme, portal: `img/${key}-portal.png`, demo });
        process.stdout.write(".");
      }
    }
  }
  await browser.close();

  const section = (r) => `
  <section id="${slug(r.s.name)}-${r.size.tag}-${r.scheme}">
    <h2>${esc(r.s.name)} <small>${r.size.tag} · ${r.scheme} · as ${esc(r.s.as)} · <a href="${esc(BASE + r.s.path)}">${esc(r.s.path)}</a></small></h2>
    <div class="pair ${r.size.tag}">
      <figure><figcaption>Portal</figcaption><img loading="lazy" src="${r.portal}" alt="Portal: ${esc(r.s.name)}"></figure>
      ${r.demo ? `<figure><figcaption>Demo: go("${esc(r.s.demo.view)}"${r.s.demo.arg ? `, "${esc(r.s.demo.arg)}"` : ""}) as ${esc(r.s.demo.as)}</figcaption><img loading="lazy" src="${r.demo}" alt="Demo: ${esc(r.s.name)}"></figure>` : `<figure class="none"><figcaption>Demo</figcaption><p>No matching demo screen.</p></figure>`}
    </div>
  </section>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Portal and demo, side by side</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 16px 24px 64px; background: #f4f1e8; color: #13241b; }
  h1 { margin: 0 0 4px; } nav { columns: 4 220px; margin: 12px 0 24px; } nav a { display: block; }
  section { margin: 0 0 40px; } h2 { font-size: 16px; margin: 0 0 8px; } h2 small { font-weight: 400; color: #4f5b53; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; } .pair.phone { grid-template-columns: repeat(2, 390px); }
  figure { margin: 0; background: #fff; border: 1px solid #e4dcc6; border-radius: 8px; overflow: hidden; } figcaption { padding: 6px 10px; font-weight: 600; border-bottom: 1px solid #e4dcc6; }
  img { display: block; width: 100%; height: auto; } .none p { padding: 24px; color: #4f5b53; } .problems { background: #f7e0dd; padding: 12px 16px; border-radius: 8px; }
</style></head><body>
<h1>Portal and demo, side by side</h1>
<p>${rows.length} captures from ${esc(BASE)} on ${new Date().toLocaleString("en-US")}. Portal on the left, demo on the right.</p>
${problems.length ? `<div class="problems"><strong>Problems while capturing</strong><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>` : ""}
<nav>${rows.map((r) => `<a href="#${slug(r.s.name)}-${r.size.tag}-${r.scheme}">${esc(r.s.name)} · ${r.size.tag} · ${r.scheme}</a>`).join("")}</nav>
${rows.map(section).join("")}
</body></html>`;
  writeFileSync(join(OUT, "report.html"), html);
  console.log(`\n${rows.length} captures. Open ${join(OUT, "report.html")}`);
  if (problems.length) console.log(`Problems:\n  ${problems.join("\n  ")}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
