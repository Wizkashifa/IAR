/**
 * Step 9. Build and deploy the portal to Cloud Run with everything it needs
 * in its settings, add its sign-in address to the Web client (by hand,
 * checked), and give it its own address, portal.<domain>: go-live maps the
 * domain and shows the DNS record to add. On later runs it checks DNS and
 * the certificate, and switches the portal over once both work.
 */
import { join } from "node:path";
import { SERVICE, console_, customHost, directoryUser, mailbox, role, runUrl } from "../config";
import type { DomainMapping } from "../google";
import { byHand } from "../run";
import { type Change, type Ctx, type Stage, Stop } from "../types";
import { ensureBuilder, runtimeSa, schedulerSa } from "./cloud";

const SECRETS = { GOOGLE_CLIENT_SECRET: "google-client-secret:latest", NEXTAUTH_SECRET: "nextauth-secret:latest" };
export const callback = (base: string) => `${base.replace(/\/$/, "")}/api/auth/callback/google`;
const isProduction = (ctx: Ctx) => ctx.opt.production || Boolean(ctx.state.production);

export function desiredEnv(ctx: Ctx, url: string, strict = false): Record<string, string> {
  const { opt, state } = ctx;
  const d = opt.domain;
  const folder = (k: string) => {
    const id = state.drives?.[k]?.folderId;
    if (!id && strict) throw new Stop("The Shared Drive folders don't exist yet. Run step 7 first.");
    return id ?? `<${k} folder, from step 7>`;
  };
  if (!state.webClientId && strict) throw new Stop("go-live doesn't know the Web client's ID. Run step 0 again.");
  const env: Record<string, string> = {
    ORG_DOMAIN: d,
    GOOGLE_CLIENT_ID: state.webClientId ?? "<Web client ID, from step 0>",
    DIRECTORY_ADMIN_SUBJECT: directoryUser(d),
    DIRECTORY_SERVICE_ACCOUNT: runtimeSa(ctx),
    NEXTAUTH_URL: url,
    PO_DRIVE_FOLDER_ID: folder("po"),
    W9_DRIVE_FOLDER_ID: folder("w9"),
    MAINTENANCE_DRIVE_FOLDER_ID: folder("photos"),
    MARKETING_DRIVE_FOLDER_ID: folder("marketing"),
    PORTAL_MAIL_FROM: mailbox(d),
    PORTAL_CALENDAR_SUBJECT: mailbox(d),
    PORTAL_CHAT: "on",
    DAILY_INVOKER: schedulerSa(ctx),
  };
  if (!isProduction(ctx)) env.PORTAL_ACCESS_GROUP = role("beta", d);
  if (state.poExecutiveThreshold) env.PO_EXECUTIVE_THRESHOLD = state.poExecutiveThreshold;
  return env;
}

function redirectSteps(ctx: Ctx, uri: string): string[] {
  const p = ctx.opt.project;
  const link = ctx.state.webClientId ? console_.client(p, ctx.state.webClientId) : console_.credentials(p);
  return [`1. Open ${link} (the "IAR Portal" Web client).`, `2. Under Authorized redirect URIs, add: ${uri}`, "   Keep any that are already there. Save."];
}

function redirectChange(ctx: Ctx, base: () => string): Change {
  return {
    kind: "manual",
    text: `Add the portal's sign-in address ${callback(base())} to the Web client`,
    detail: redirectSteps(ctx, callback(base())),
    run: async (c) => {
      const uri = callback(base());
      await byHand(c, "redirect-uri", redirectSteps(c, uri), async () =>
        (await c.g.redirectUriAccepted(c.state.webClientId!, uri)) ? null : `Google doesn't accept ${uri} for the Web client yet. Check it's saved exactly; a new URI can take 5 minutes to work.`,
      );
      (c.state.redirectsVerified ??= []).push(uri);
    },
  };
}

/** The DNS record(s) to add for the portal's address, as go-live shows them. */
function dnsLines(m: DomainMapping, domain: string): string[] {
  return [
    ...(m.records.length ? [`Add this to the DNS for ${domain}:`, ...m.records.map((r) => `  ${r.type}  ${r.name}  ${r.value}`)] : ["Google hasn't said which DNS record to add yet. Run go-live again in a few minutes."]),
    "On Cloudflare, set it to DNS only (grey cloud), not proxied.",
    `If ${domain} has CAA records, allow pki.goog and letsencrypt.org.`,
  ];
}

/**
 * Google issues the certificate only after it has seen the right DNS itself, so its word is enough. This
 * computer's own lookup can fail where DNS is fine (some networks block it), so it only adds a hint.
 */
const ready = (m: DomainMapping) => m.ready && m.certificateReady;
const seenHere = async (ctx: Ctx, m: DomainMapping) => (await Promise.all(m.records.map((r) => ctx.g.dnsMatches(customHost(ctx.opt.domain), r)))).every(Boolean);

export const deploy: Stage = {
  id: "deploy",
  title: "Deploy the portal to Cloud Run, and its address",
  async plan(ctx) {
    const { g, opt, state } = ctx;
    const p = opt.project;
    const out: Change[] = [];
    const svc = await g.getService(p, opt.region, SERVICE);
    const predicted = state.projectNumber ? runUrl(state.projectNumber, opt.region) : "https://<the Cloud Run address>";
    const url = () => ctx.state.portalUrl ?? ctx.state.serviceUrl ?? svc?.url ?? predicted;
    if (svc && !state.serviceUrl) state.serviceUrl = svc.url;

    if (!svc || opt.redeploy) {
      out.push({
        kind: svc ? "update" : "create",
        text: `${svc ? "Rebuild and redeploy" : "Build and deploy"} the portal (Cloud Run service ${SERVICE} in ${opt.region}, from portal/; about 5 minutes) as ${runtimeSa(ctx)}, open to the internet so the sign-in page loads`,
        detail: Object.entries(desiredEnv(ctx, url())).map(([k, v]) => `${k}=${v}`).concat(Object.entries(SECRETS).map(([k, v]) => `${k} from Secret Manager (${v.split(":")[0]})`)),
        required: true,
        // Deploying for the first time with --production skips the beta gate, so it gets its own yes.
        ask: !svc && isProduction(ctx) ? "access" : undefined,
        run: async (c) => {
          await ensureBuilder(c);
          const first = c.state.portalUrl ?? c.state.serviceUrl ?? predicted;
          const res = await c.g.deploy(p, { service: SERVICE, source: join(c.repoRoot, "portal"), region: opt.region, serviceAccount: runtimeSa(c), env: desiredEnv(c, first, true), secrets: SECRETS });
          c.state.serviceUrl = res.url;
          c.state.portalUrl ??= res.url;
          await c.save();
          if (res.env.NEXTAUTH_URL !== c.state.portalUrl) {
            c.log(`  The service's address is ${res.url}; setting NEXTAUTH_URL to it and redeploying.`);
            await c.g.updateServiceEnv(p, opt.region, SERVICE, { NEXTAUTH_URL: c.state.portalUrl }, []);
          }
        },
      });
    } else {
      const want = desiredEnv(ctx, url());
      const set: Record<string, string> = {};
      for (const [k, v] of Object.entries(want)) if (svc.env[k] !== v) set[k] = v;
      if (Object.keys(set).length)
        out.push({
          kind: "update",
          text: `Change the portal's settings and redeploy: ${Object.keys(set).join(", ")}`,
          detail: Object.entries(set).map(([k, v]) => `${k}: ${svc.env[k] ?? "(not set)"} → ${v}`),
          run: (c) => c.g.updateServiceEnv(p, opt.region, SERVICE, desiredEnv(c, url(), true), []),
        });
    }

    if (!(state.redirectsVerified ?? []).includes(callback(url()))) out.push(redirectChange(ctx, url));

    // ---- portal.<domain> -----------------------------------------------
    const host = customHost(opt.domain);
    if (state.customDomainLive) {
      out.push({ kind: "check", text: `The portal is at https://${host}` });
      return out;
    }
    const verified = (await g.verifiedDomains()).includes(opt.domain);
    if (!verified)
      out.push({
        kind: "manual",
        text: `Prove to Google that you manage ${opt.domain}, so Cloud Run can serve ${host}`,
        ask: "later",
        detail: [`Run this in a terminal: gcloud domains verify ${opt.domain}`, `It opens Google Search Console (${console_.searchConsole}). ${opt.domain} is usually verified already through Workspace; if so, it just confirms.`],
        run: (c) =>
          byHand(c, "domain-verify", [`Run: gcloud domains verify ${opt.domain}`, "and finish the steps in Search Console."], async () =>
            (await c.g.verifiedDomains()).includes(opt.domain) ? null : `gcloud doesn't list ${opt.domain} as verified for you yet.`,
          ),
      });
    const mapping = svc ? await g.getDomainMapping(p, opt.region, host) : null;
    // portal.<domain> can wait: the beta can start on the Cloud Run address, so each of these can be put off.
    const unverified = async (c: Ctx) => !(await c.g.verifiedDomains()).includes(opt.domain) && (c.log(`  Skipped: ${opt.domain} isn't verified yet. Run go-live again once it is.`), true);
    if (!mapping)
      out.push({
        kind: "create",
        text: `Map ${host} to the portal; go-live then shows the DNS record to add`,
        ask: "later",
        run: async (c) => {
          if (await unverified(c)) return;
          const m = await c.g.createDomainMapping(p, opt.region, host, SERVICE);
          for (const l of dnsLines(m, opt.domain)) c.log(`  ${l}`);
        },
      });
    if (mapping) {
      if (ready(mapping)) {
        const custom = `https://${host}`;
        if (!(state.redirectsVerified ?? []).includes(callback(custom))) out.push(redirectChange(ctx, () => custom));
        out.push({
          kind: "update",
          text: `Switch the portal to https://${host}: NEXTAUTH_URL, then redeploy (the Cloud Run address keeps working)`,
          run: async (c) => {
            await c.g.updateServiceEnv(p, opt.region, SERVICE, { NEXTAUTH_URL: custom }, []);
            c.state.portalUrl = custom;
            c.state.customDomainLive = true;
            c.log(`  Also change the Chat app's HTTP endpoint (Google Chat API → Configuration) to ${custom}/api/chat, so the app keeps answering.`);
          },
        });
      } else
        out.push({
          kind: "check",
          text: `Waiting for ${host}: ${mapping.message ?? "the DNS records aren't in yet, or the certificate isn't ready"}. Run go-live again later; it switches over once both work.`,
          detail: [...dnsLines(mapping, opt.domain), ...((await seenHere(ctx, mapping)) ? ["The record is in; Google is issuing the certificate (usually within an hour)."] : [])],
        });
    }
    return out;
  },
};
