/**
 * Step 4. The portal's one domain-wide delegation entry, added by hand in the
 * Admin console (Google has no API for it), then tested by go-live itself:
 * for each scope, the portal's service account signs a token for the account
 * the portal uses it as, exactly as the portal does. To run that test, you get
 * Token Creator on the service account for a minute, removed straight after.
 */
import { DELEGATION, RUNTIME_SA, console_, delegationScopes, directoryUser, mailbox } from "../config";
import { byHand, confirm } from "../run";
import { type Change, type Ctx, type Stage, Stop } from "../types";
import { runtimeSa } from "./cloud";

const TOKEN_CREATOR = "roles/iam.serviceAccountTokenCreator";

function steps(uniqueId: string, ctx: Ctx): string[] {
  return [
    `1. Open ${console_.delegation} (Security → Access and data control → API controls → Manage domain-wide delegation).`,
    "2. Add new (or, if an entry with this Client ID exists, Edit it).",
    `   Client ID: ${uniqueId}`,
    `   OAuth scopes (one line, comma-separated): ${delegationScopes()}`,
    "3. Authorize.",
    "What each scope is for:",
    ...DELEGATION.map((d) => `   ${d.scope.split("/").pop()}: ${d.why}, as ${d.as === "directory" ? directoryUser(ctx.opt.domain) : mailbox(ctx.opt.domain)}`),
    "Note: gmail.send lets the service account send as any address in the domain; the portal only ever sends as portal@, it has no key file, and only the Cloud Run service runs as it.",
  ];
}

/** Every scope works for the account the portal uses it as; null, or what failed. */
async function testAll(ctx: Ctx): Promise<string | null> {
  const sa = runtimeSa(ctx);
  const failed: string[] = [];
  for (const d of DELEGATION) {
    const subject = d.as === "directory" ? directoryUser(ctx.opt.domain) : mailbox(ctx.opt.domain);
    const r = await ctx.g.testDelegation(sa, subject, d.scope);
    if (!r.ok) failed.push(`${d.scope.split("/").pop()} as ${subject}${r.error ? ` (${r.error})` : ""}`);
  }
  return failed.length ? `Google didn't allow: ${failed.join("; ")}. Check the Client ID and that all four scopes are in one entry. A new entry can take a few minutes to work.` : null;
}

export const delegation: Stage = {
  id: "delegation",
  title: "Domain-wide delegation (by hand in the Admin console)",
  async plan(ctx) {
    const sa = await ctx.g.getServiceAccount(runtimeSa(ctx));
    const id = sa?.uniqueId ?? "(the service account's Unique ID, shown once step 2 has made it)";
    const key = `${sa?.uniqueId}|${delegationScopes()}`;
    if (sa && ctx.state.delegationVerified === key) return [{ kind: "check", text: `Delegation for ${RUNTIME_SA} (${sa.uniqueId}) was tested and works` }];
    const me = ctx.admin?.email ?? "you";
    const out: Change[] = [
      {
        kind: "manual",
        text: `Add one domain-wide delegation entry for ${RUNTIME_SA} with the portal's four scopes`,
        detail: steps(id, ctx),
        ask: "access",
        required: true,
        run: async (c) => {
          const now = await c.g.getServiceAccount(runtimeSa(c));
          if (!now) throw new Stop("The portal's service account doesn't exist yet. Run step 2 first.");
          await byHand(c, "delegation", steps(now.uniqueId, c));
        },
      },
      {
        kind: "update",
        text: `Test it: give ${me} Token Creator on ${RUNTIME_SA} for a minute, sign a test token for each scope, then remove that again`,
        run: async (c) => {
          const saEmail = runtimeSa(c);
          const member = `user:${c.admin!.email}`;
          const had = (await c.g.serviceAccountBindings(saEmail)).includes(`${member}|${TOKEN_CREATOR}`);
          if (!had) await c.g.addServiceAccountBinding(saEmail, member, TOKEN_CREATOR);
          try {
            for (;;) {
              const problem = await testAll(c);
              if (!problem) break;
              c.log(`  Not yet: ${problem}`);
              if (!(await confirm(c, "  Fix the entry if needed, or wait a few minutes. Test again?"))) throw new Stop("Stopped: the delegation entry doesn't work yet.", ["Run go-live again once it's fixed; everything before it is kept."]);
            }
          } finally {
            if (!had) await c.g.removeServiceAccountBinding(saEmail, member, TOKEN_CREATOR);
          }
          const now = await c.g.getServiceAccount(saEmail);
          c.state.delegationVerified = `${now!.uniqueId}|${delegationScopes()}`;
          c.log("  All four scopes work, and your temporary Token Creator role is removed.");
        },
      },
    ];
    return out;
  },
};
