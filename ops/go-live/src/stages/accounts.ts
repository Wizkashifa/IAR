/**
 * Step 3. The two Workspace accounts the portal acts as: portal@ (sends the
 * alert emails, puts room holds on calendars) and portal-directory@ (reads
 * groups and rooms, nothing else). Random passwords nobody sees. A license
 * for portal@ (asked, since it costs money), and the read-only admin role
 * "Portal reader" for portal-directory@.
 */
import { randomBytes } from "node:crypto";
import { READER_ROLE, console_, directoryUser, mailbox } from "../config";
import { NoFreeLicense, type Privilege } from "../google";
import { type Change, type Ctx, type Stage, Stop } from "../types";

const password = () => randomBytes(24).toString("base64url") + "!aA1";

/**
 * The closest privileges the Directory API offers to "Groups: Read" and
 * "Calendar resources / Buildings: Read". Names differ a little between
 * tenants, so match by pattern and say what was found.
 */
export function readerPrivileges(all: Privilege[]): { picked: Privilege[]; missing: string[] } {
  const find = (want: string, tests: RegExp[]) => {
    for (const t of tests) {
      const p = all.find((x) => t.test(x.privilegeName));
      if (p) return p;
    }
    missing.push(want);
    return null;
  };
  const missing: string[] = [];
  const picked = [
    find("Groups → Read", [/^GROUPS_RETRIEVE$/, /^GROUPS?_(READ|RETRIEVE)/]),
    find("Calendar resources → Read", [/^CALENDAR_RESOURCES?_RETRIEVE$/, /RESOURCE.*(RETRIEVE|READ)/]),
    find("Buildings → Read", [/^BUILDINGS?_RETRIEVE$/, /BUILDING.*(RETRIEVE|READ)/]),
  ].filter((p): p is Privilege => Boolean(p));
  return { picked, missing };
}

export const accounts: Stage = {
  id: "accounts",
  title: "Workspace accounts the portal acts as",
  async plan(ctx) {
    const { g, opt } = ctx;
    const out: Change[] = [];
    const mail = mailbox(opt.domain), dir = directoryUser(opt.domain);
    const users = [
      { email: mail, givenName: "IAR", familyName: "Portal", why: "the portal's own mailbox: alert emails come from it, and room holds are made as it. Nobody signs in to it" },
      { email: dir, givenName: "IAR Portal", familyName: "Directory", why: "can only read groups and rooms, for the portal. Nobody signs in to it" },
    ];
    const exists: Record<string, boolean> = {};
    for (const u of users) {
      exists[u.email] = Boolean(await g.getUser(u.email));
      if (!exists[u.email])
        out.push({
          kind: "create",
          text: `Create ${u.email}: ${u.why}. Its password is random and never shown or saved`,
          run: (c) => c.g.createUser({ email: u.email, givenName: u.givenName, familyName: u.familyName, password: password() }),
        });
    }

    const lic = exists[mail] ? await g.licenseOf(mail) : null;
    if (!lic)
      out.push({
        kind: "create",
        text: `Give ${mail} a Google Workspace license (the same kind as yours), so it has a Gmail mailbox to send from`,
        ask: "license",
        run: async (c) => {
          if (await c.g.licenseOf(mail)) return; // Workspace may have given it one already.
          const mine = await c.g.licenseOf(c.admin!.email);
          if (!mine) throw new Stop(`go-live can't tell which license kind ${opt.domain} uses (you have none it can read). Assign one to ${mail} in Admin console → Directory → Users, then run again.`);
          try {
            await c.g.assignLicense(mail, mine);
            c.state.licensePending = false;
          } catch (e) {
            if (!(e instanceof NoFreeLicense)) throw e;
            c.state.licensePending = true;
            c.log(`  There's no free ${mine.skuName} license. Add one in Admin console → Billing → Subscriptions (${console_.subscriptions}).`);
            c.log("  Nonprofit plans usually include spare licenses; ask whoever manages IAR's Google subscription. Email alerts wait until it has one; everything else carries on. Run go-live again afterwards.");
          }
        },
      });
    else out.push({ kind: "check", text: `${mail} has a ${lic.skuName} license` });

    const role = (await g.listAdminRoles()).find((r) => r.name === READER_ROLE);
    if (!role) {
      const { picked, missing } = readerPrivileges(await g.listPrivileges());
      out.push({
        kind: "create",
        text: `Create the admin role "${READER_ROLE}": ${picked.map((p) => p.privilegeName).join(", ") || "(none found)"}. Read only; nothing else`,
        detail: missing.length ? [`Google's list had nothing matching: ${missing.join(", ")}. After this runs, tick those by hand in Admin console → Account → Admin roles → ${READER_ROLE} (${console_.roles}).`] : undefined,
        run: async (c) => {
          if (!picked.length) throw new Stop("Google's privilege list had no Groups read privilege. Create the role by hand in the Admin console, then run again.");
          c.state.readerRoleId = await c.g.createAdminRole({ name: READER_ROLE, description: "Read-only: groups, calendar resources and buildings, for the IAR Portal", privileges: picked });
        },
      });
    } else ctx.state.readerRoleId = role.id;
    const holders = role ? await g.listRoleHolders(role.id) : [];
    if (!holders.includes(dir))
      out.push({ kind: "create", text: `Give ${dir} the "${READER_ROLE}" role`, run: (c: Ctx) => c.g.assignAdminRole(c.state.readerRoleId!, dir) });
    return out;
  },
};
