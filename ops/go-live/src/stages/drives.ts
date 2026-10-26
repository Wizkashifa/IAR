/**
 * Step 7. The four Shared Drives the portal files things in, who can open
 * each (groups, never individuals), and a top folder in each whose ID the
 * portal is deployed with.
 */
import { randomUUID } from "node:crypto";
import { DRIVES, DRIVE_ROLE_NAME, FOLDER } from "../config";
import { type Change, type Stage } from "../types";
import { runtimeSa } from "./cloud";

export const drives: Stage = {
  id: "drives",
  title: "Shared Drives for receipts, W-9s, maintenance photos and marketing files",
  async plan(ctx) {
    const { g, state, opt } = ctx;
    const out: Change[] = [];
    const sa = runtimeSa(ctx);
    for (const d of DRIVES) {
      const known = state.drives?.[d.key];
      const driveId = known?.driveId ?? (await g.findSharedDrive(d.name));
      const access = d.access(opt.domain, sa);
      if (!driveId) {
        out.push({
          kind: "create",
          text: `Create the Shared Drive "${d.name}" (${d.why}) with a "${FOLDER}" folder; ${access.map((a) => `${a.email} as ${DRIVE_ROLE_NAME[a.role]}`).join(", ")}`,
          run: async (c) => {
            const id = await c.g.createSharedDrive(d.name, randomUUID());
            const folderId = await c.g.createFolder(id, FOLDER);
            (c.state.drives ??= {})[d.key] = { driveId: id, folderId };
            await c.save();
            for (const a of access) await c.g.addDrivePermission(id, a);
            if (d.financeOnly && c.admin) await c.g.removeDrivePermission(id, c.admin.email);
          },
        });
        continue;
      }
      const perms = await g.listDrivePermissions(driveId);
      for (const a of access) {
        const cur = perms.find((p) => p.email.toLowerCase() === a.email.toLowerCase());
        if (!cur) out.push({ kind: "create", text: `Give ${a.email} ${DRIVE_ROLE_NAME[a.role]} on "${d.name}"`, run: (c) => c.g.addDrivePermission(driveId, a) });
        else if (cur.role !== a.role) out.push({ kind: "update", text: `Make ${a.email} ${DRIVE_ROLE_NAME[a.role]} on "${d.name}" (now ${DRIVE_ROLE_NAME[cur.role] ?? cur.role})`, run: (c) => c.g.addDrivePermission(driveId, a) });
      }
      const folderId = known?.folderId ?? (await g.findFolder(driveId, FOLDER));
      if (!folderId)
        out.push({
          kind: "create",
          text: `Make the "${FOLDER}" folder in "${d.name}"`,
          run: async (c) => void ((c.state.drives ??= {})[d.key] = { driveId, folderId: await c.g.createFolder(driveId, FOLDER) }),
        });
      else if (!known) out.push({ kind: "update", text: `Remember "${d.name}" and its folder for the portal (${d.env})`, run: async (c) => void ((c.state.drives ??= {})[d.key] = { driveId, folderId }) });
      if (d.financeOnly && ctx.admin && perms.some((p) => p.email.toLowerCase() === ctx.admin!.email.toLowerCase()) && !access.some((a) => a.email === ctx.admin!.email))
        out.push({ kind: "remove", text: `Take yourself off "${d.name}" so only finance can open it (super admins can still manage it from the Admin console)`, run: (c) => c.g.removeDrivePermission(driveId, c.admin!.email) });
    }
    return out;
  },
};
