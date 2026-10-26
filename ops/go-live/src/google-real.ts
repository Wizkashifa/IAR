/**
 * The real Google. Workspace APIs (Directory, Groups Settings, Licensing,
 * Drive, Sheets, Calendar, Chat, Gmail) through the googleapis package with
 * the admin's own browser sign-in, kept in memory. Cloud through the gcloud
 * CLI the admin is signed in to, and a few Cloud REST APIs (Firestore
 * documents, Monitoring, Budgets) with gcloud's access token.
 *
 * Never: service account keys (the portal signs its own tokens), sending
 * email (Gmail drafts only), or anything outside the IAR project and domain.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve as dnsResolve, resolveCname } from "node:dns/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import type { OAuth2Client } from "google-auth-library";
import { admin, type admin_directory_v1 } from "googleapis/build/src/apis/admin";
import { calendar } from "googleapis/build/src/apis/calendar";
import { chat } from "googleapis/build/src/apis/chat";
import { drive } from "googleapis/build/src/apis/drive";
import { gmail } from "googleapis/build/src/apis/gmail";
import { groupssettings } from "googleapis/build/src/apis/groupssettings";
import { licensing } from "googleapis/build/src/apis/licensing";
import { sheets } from "googleapis/build/src/apis/sheets";
import { loopbackSignIn } from "./auth";
import { type FsValue, fieldPath, fromFields, toFields } from "./firestore-values";
import {
  type AdminRole, type AlertPolicy, type Bucket, type Budget, type ClientFile, type CloudService, type DeployRequest, type DnsRecord, type DomainMapping,
  type DrivePermission, type Google, type License, type Member, type MemberRole, NoFreeLicense, type Privilege, type SchedulerJob, type UptimeCheck,
  type LogMetric,
} from "./google";
import type { FirestoreIndex } from "./indexes";
import type { Tab } from "./sheet";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const status = (e: unknown) => Number((e as { code?: unknown; status?: unknown }).code ?? (e as { status?: unknown }).status ?? 0);
const notFound = (e: unknown) => status(e) === 404;

/** Retry while Google catches up with something just created. */
async function retry<T>(fn: () => Promise<T>, when: (e: unknown) => boolean, tries = 6, wait = 5000): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries || !when(e)) throw e;
      await sleep(wait * i);
    }
  }
}

/** Every page of a list call. */
async function all<T, R extends { nextPageToken?: string | null }>(call: (pageToken?: string) => Promise<{ data: R }>, items: (r: R) => T[] | null | undefined): Promise<T[]> {
  const out: T[] = [];
  let token: string | undefined;
  do {
    const { data } = await call(token);
    out.push(...(items(data) ?? []));
    token = data.nextPageToken ?? undefined;
  } while (token);
  return out;
}

// ---- gcloud ---------------------------------------------------------------

const WIN = process.platform === "win32";
const winQuote = (a: string) => (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);

export class GcloudError extends Error {
  constructor(readonly args: string[], readonly stderr: string) {
    super(`gcloud ${args.slice(0, 4).join(" ")} failed: ${stderr.trim().split("\n").slice(-3).join(" ")}`);
  }
}

function gcloud(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const full = [...args, "--quiet"];
    // gcloud is a .cmd script on Windows, which Node only runs through the shell.
    const child = spawn(WIN ? "gcloud.cmd" : "gcloud", WIN ? full.map(winQuote) : full, { shell: WIN, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: "1" } });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new GcloudError(args, err))));
    child.stdin.end(input ?? "");
  });
}
const gjson = async <T>(args: string[]): Promise<T> => JSON.parse((await gcloud([...args, "--format=json"])) || "null") as T;
const gone = (e: unknown) => e instanceof GcloudError && /NOT_FOUND|not found|does not exist|404/i.test(e.stderr);
/** Not there, or its API isn't on yet (a new project): either way, nothing exists to find. */
export const absent = (e: unknown) => gone(e) || (e instanceof GcloudError && /SERVICE_DISABLED|has not been used in project|it is disabled/i.test(e.stderr));
const orNull = async <T>(p: Promise<T>) => {
  try {
    return await p;
  } catch (e) {
    if (absent(e)) return null;
    throw e;
  }
};

/** A temporary file for flags too awkward to pass on a command line (env vars, JSON). */
function tempFile(name: string, content: string): { path: string; done: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "go-live-"));
  const path = join(dir, name);
  writeFileSync(path, content, { mode: 0o600 });
  return { path, done: () => rmSync(dir, { recursive: true, force: true }) };
}
async function withFile<T>(name: string, content: string, fn: (path: string) => Promise<T>): Promise<T> {
  const f = tempFile(name, content);
  try {
    return await fn(f.path);
  } finally {
    f.done();
  }
}

const yamlEnv = (env: Record<string, string>) => Object.entries(env).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n") + "\n";
const bindings = (policy: { bindings?: { role: string; members?: string[] }[] } | null) => (policy?.bindings ?? []).flatMap((b) => (b.members ?? []).map((m) => `${m}|${b.role}`));

// ---- The real Google --------------------------------------------------------

export class RealGoogle implements Google {
  private auth: OAuth2Client | null = null;
  private customer = "my_customer";

  constructor(private readonly packageDir: string, private readonly log: (l: string) => void) {}

  private get a() {
    if (!this.auth) throw new Error("Not signed in to Google yet.");
    return this.auth;
  }
  private dir() {
    return admin({ version: "directory_v1", auth: this.a });
  }

  // ---- This computer ------------------------------------------------------
  async tools() {
    let gc: string | null = null;
    try {
      gc = (JSON.parse(await gcloud(["version", "--format=json"])) as Record<string, string>)["Google Cloud SDK"] ?? "installed";
    } catch {
      gc = null;
    }
    return { node: process.version, gcloud: gc };
  }
  async gcloudAccount() {
    const v = (await gcloud(["config", "get-value", "account"]).catch(() => "")).trim();
    return v && v !== "(unset)" ? v : null;
  }
  async findClientFile(explicit?: string): Promise<ClientFile | null> {
    // A path is taken from where the admin ran npm (npm itself runs in ops/go-live).
    const path = explicit ? resolvePath(process.env.INIT_CWD ?? process.cwd(), explicit) : readdirSync(this.packageDir).filter((f) => /^client_secret.*\.json$/.test(f)).map((f) => join(this.packageDir, f))[0];
    if (!path) return null;
    let j: { installed?: Record<string, string>; web?: Record<string, string> };
    try {
      j = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
    const c = j.installed ?? j.web;
    if (!c?.client_id) return null;
    return { path, clientId: c.client_id, clientSecret: c.client_secret ?? "", projectId: c.project_id ?? "", desktop: Boolean(j.installed) };
  }
  async signIn(client: ClientFile, scopes: string[], domain: string) {
    const r = await loopbackSignIn(client, scopes, domain, this.log);
    this.auth = r.auth;
    return { email: r.email, name: r.name };
  }
  async fetchStatus(url: string) {
    try {
      return (await fetch(url, { redirect: "manual" })).status;
    } catch {
      return 0;
    }
  }
  async redirectUriAccepted(clientId: string, redirectUri: string) {
    // Google answers an unregistered redirect URI with an error before any sign-in.
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid" }).toString();
    const res = await fetch(u, { redirect: "manual" });
    const where = res.headers.get("location") ?? "";
    const body = res.status >= 400 ? await res.text() : "";
    return res.status < 400 && !/authError|\/error|redirect_uri_mismatch/.test(where) && !/redirect_uri_mismatch/.test(body);
  }
  async dnsMatches(host: string, r: DnsRecord) {
    const want = r.value.replace(/\.$/, "").toLowerCase();
    try {
      const got = r.type === "CNAME" ? await resolveCname(host) : await dnsResolve(host, r.type as "A");
      return (got as string[]).some((g) => g.replace(/\.$/, "").toLowerCase() === want);
    } catch {
      return false;
    }
  }

  // ---- Directory ------------------------------------------------------------
  async getUser(email: string) {
    try {
      const { data } = await this.dir().users.get({ userKey: email });
      return { email: (data.primaryEmail ?? email).toLowerCase(), name: data.name?.fullName ?? email, isAdmin: Boolean(data.isAdmin), suspended: Boolean(data.suspended) };
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  }
  async createUser(u: { email: string; givenName: string; familyName: string; password: string }) {
    await this.dir().users.insert({ requestBody: { primaryEmail: u.email, name: { givenName: u.givenName, familyName: u.familyName }, password: u.password, changePasswordAtNextLogin: false } });
  }
  async getGroup(email: string) {
    try {
      const { data } = await this.dir().groups.get({ groupKey: email });
      return { id: data.id!, email: data.email!.toLowerCase(), name: data.name ?? email };
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  }
  async createGroup(g: { email: string; name: string; description: string }) {
    const { data } = await this.dir().groups.insert({ requestBody: { email: g.email, name: g.name, description: g.description } });
    return { id: data.id!, email: data.email!.toLowerCase(), name: data.name ?? g.name };
  }
  async listMembers(group: string): Promise<Member[]> {
    const list = await all<admin_directory_v1.Schema$Member, admin_directory_v1.Schema$Members>((pageToken) => this.dir().members.list({ groupKey: group, maxResults: 200, pageToken }), (d) => d.members);
    return list.filter((m) => m.email).map((m) => ({ email: m.email!.toLowerCase(), role: (m.role ?? "MEMBER") as MemberRole, type: m.type === "GROUP" ? "GROUP" : "USER" }));
  }
  async addMember(group: string, m: Member) {
    await retry(() => this.dir().members.insert({ groupKey: group, requestBody: { email: m.email, role: m.role } }), notFound);
  }
  async updateMemberRole(group: string, email: string, role: MemberRole) {
    await this.dir().members.patch({ groupKey: group, memberKey: email, requestBody: { role } });
  }
  async removeMember(group: string, email: string) {
    await this.dir().members.delete({ groupKey: group, memberKey: email });
  }
  async getGroupSettings(group: string) {
    const { data } = await groupssettings({ version: "v1", auth: this.a }).groups.get({ groupUniqueId: group, alt: "json" });
    return { whoCanModerateMembers: data.whoCanModerateMembers ?? undefined, whoCanPostMessage: data.whoCanPostMessage ?? undefined };
  }
  async updateGroupSettings(group: string, s: { whoCanModerateMembers?: string; whoCanPostMessage?: string }) {
    // A group just made can take a few seconds to have settings.
    await retry(() => groupssettings({ version: "v1", auth: this.a }).groups.patch({ groupUniqueId: group, alt: "json", requestBody: s }), notFound);
  }
  async listPrivileges(): Promise<Privilege[]> {
    const { data } = await this.dir().privileges.list({ customer: this.customer });
    const flat: Privilege[] = [];
    const walk = (ps: admin_directory_v1.Schema$Privilege[] | undefined) => {
      for (const p of ps ?? []) {
        if (p.privilegeName && p.serviceId) flat.push({ privilegeName: p.privilegeName, serviceId: p.serviceId });
        walk(p.childPrivileges);
      }
    };
    walk(data.items);
    return flat;
  }
  async listAdminRoles(): Promise<AdminRole[]> {
    const roles = await all<admin_directory_v1.Schema$Role, admin_directory_v1.Schema$Roles>((pageToken) => this.dir().roles.list({ customer: this.customer, pageToken }), (d) => d.items);
    return roles.map((r) => ({ id: String(r.roleId), name: r.roleName ?? "", privileges: (r.rolePrivileges ?? []).map((p) => ({ privilegeName: p.privilegeName!, serviceId: p.serviceId! })) }));
  }
  async createAdminRole(r: { name: string; description: string; privileges: Privilege[] }) {
    const { data } = await this.dir().roles.insert({ customer: this.customer, requestBody: { roleName: r.name, roleDescription: r.description, rolePrivileges: r.privileges } });
    return String(data.roleId);
  }
  async listRoleHolders(roleId: string) {
    const items = await all<admin_directory_v1.Schema$RoleAssignment, admin_directory_v1.Schema$RoleAssignments>(
      (pageToken) => this.dir().roleAssignments.list({ customer: this.customer, roleId, pageToken }),
      (d) => d.items,
    );
    const out: string[] = [];
    for (const a of items) {
      if (!a.assignedTo) continue;
      const u = await this.dir().users.get({ userKey: a.assignedTo }).catch(() => null);
      if (u?.data.primaryEmail) out.push(u.data.primaryEmail.toLowerCase());
    }
    return out;
  }
  async assignAdminRole(roleId: string, userEmail: string) {
    const u = await retry(() => this.dir().users.get({ userKey: userEmail }), notFound);
    await this.dir().roleAssignments.insert({ customer: this.customer, requestBody: { roleId, assignedTo: u.data.id!, scopeType: "CUSTOMER" } });
  }
  async listCalendarResources() {
    const items = await all<admin_directory_v1.Schema$CalendarResource, admin_directory_v1.Schema$CalendarResources>(
      (pageToken) => this.dir().resources.calendars.list({ customer: this.customer, maxResults: 500, pageToken }),
      (d) => d.items,
    );
    return items.filter((r) => r.resourceEmail).map((r) => ({ name: r.resourceName ?? "", email: r.resourceEmail!, building: r.buildingId ?? undefined, capacity: r.capacity ?? undefined }));
  }

  // ---- Licensing ---------------------------------------------------------------
  private static PRODUCTS = ["Google-Apps", "101031", "101034", "101037", "101038", "101039", "101040"];
  async licenseOf(email: string): Promise<License | null> {
    const lic = licensing({ version: "v1", auth: this.a });
    const domain = email.split("@")[1];
    for (const productId of RealGoogle.PRODUCTS) {
      try {
        const hit = await all(
          (pageToken) => lic.licenseAssignments.listForProduct({ productId, customerId: domain, maxResults: 1000, pageToken }),
          (d) => d.items,
        ).then((items) => items.find((i) => i.userId?.toLowerCase() === email.toLowerCase()));
        if (hit) return { productId, skuId: hit.skuId!, skuName: hit.skuName ?? hit.skuId! };
      } catch (e) {
        if (status(e) !== 400 && status(e) !== 404 && status(e) !== 403) throw e;
      }
    }
    return null;
  }
  async assignLicense(email: string, l: License) {
    try {
      await licensing({ version: "v1", auth: this.a }).licenseAssignments.insert({ productId: l.productId, skuId: l.skuId, requestBody: { userId: email } });
    } catch (e) {
      const msg = String((e as Error).message);
      if (status(e) === 412 || /limit|insufficient|not enough|no (available )?licen[cs]es|seats/i.test(msg)) throw new NoFreeLicense(msg);
      throw e;
    }
  }

  // ---- Drive and Sheets --------------------------------------------------------
  private drv() {
    return drive({ version: "v3", auth: this.a });
  }
  async findSharedDrive(name: string) {
    const { data } = await this.drv().drives.list({ q: `name = '${name.replace(/'/g, "\\'")}'`, useDomainAdminAccess: true, pageSize: 10 });
    return data.drives?.[0]?.id ?? null;
  }
  async createSharedDrive(name: string, requestId: string) {
    const { data } = await this.drv().drives.create({ requestId, requestBody: { name } });
    return data.id!;
  }
  private async perms(driveId: string) {
    return all(
      (pageToken) => this.drv().permissions.list({ fileId: driveId, supportsAllDrives: true, useDomainAdminAccess: true, pageToken, fields: "nextPageToken,permissions(id,emailAddress,role,type)" }),
      (d) => d.permissions,
    );
  }
  async listDrivePermissions(driveId: string): Promise<DrivePermission[]> {
    return (await this.perms(driveId)).filter((p) => p.emailAddress).map((p) => ({ email: p.emailAddress!.toLowerCase(), type: p.type === "group" ? "group" : "user", role: p.role ?? "" }));
  }
  async addDrivePermission(driveId: string, p: DrivePermission) {
    const cur = (await this.perms(driveId)).find((x) => x.emailAddress?.toLowerCase() === p.email.toLowerCase());
    if (cur?.id) await this.drv().permissions.update({ fileId: driveId, permissionId: cur.id, supportsAllDrives: true, useDomainAdminAccess: true, requestBody: { role: p.role } });
    else await this.drv().permissions.create({ fileId: driveId, supportsAllDrives: true, useDomainAdminAccess: true, sendNotificationEmail: false, requestBody: { type: p.type, role: p.role, emailAddress: p.email } });
  }
  async removeDrivePermission(driveId: string, email: string) {
    const cur = (await this.perms(driveId)).find((x) => x.emailAddress?.toLowerCase() === email.toLowerCase());
    if (cur?.id) await this.drv().permissions.delete({ fileId: driveId, permissionId: cur.id, supportsAllDrives: true, useDomainAdminAccess: true });
  }
  async findFolder(driveId: string, name: string) {
    const { data } = await this.drv().files.list({
      q: `'${driveId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      corpora: "drive",
      driveId,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: "files(id)",
    });
    return data.files?.[0]?.id ?? null;
  }
  async createFolder(driveId: string, name: string) {
    const { data } = await this.drv().files.create({ supportsAllDrives: true, fields: "id", requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [driveId] } });
    return data.id!;
  }
  async createSpreadsheet(title: string, tabs: Tab[]) {
    const s = sheets({ version: "v4", auth: this.a });
    const { data } = await s.spreadsheets.create({
      requestBody: { properties: { title }, sheets: tabs.map((t) => ({ properties: { title: t.name, hidden: t.hidden ?? false, gridProperties: { frozenRowCount: 1 } } })) },
    });
    const id = data.spreadsheetId!;
    const sheetId = new Map((data.sheets ?? []).map((x) => [x.properties!.title!, x.properties!.sheetId!]));
    await s.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: "RAW", data: tabs.map((t) => ({ range: `'${t.name.replace(/'/g, "''")}'!A1`, values: [t.header, ...t.rows] })) },
    });
    const requests = tabs.flatMap((t) => {
      const sid = sheetId.get(t.name)!;
      return [
        { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
        ...(t.widths ?? []).map((w, i) => ({ updateDimensionProperties: { range: { sheetId: sid, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: Math.round(w * 7) }, fields: "pixelSize" } })),
        ...Object.entries(t.lists ?? {}).map(([col, values]) => ({
          setDataValidation: {
            range: { sheetId: sid, startRowIndex: 1, endRowIndex: Math.max(t.rows.length + 200, 300), startColumnIndex: Number(col), endColumnIndex: Number(col) + 1 },
            rule: { condition: { type: "ONE_OF_LIST", values: values.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: true },
          },
        })),
      ];
    });
    await s.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests } });
    return { id, url: data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}/edit` };
  }
  async readSpreadsheet(id: string) {
    const s = sheets({ version: "v4", auth: this.a });
    const { data } = await s.spreadsheets.get({ spreadsheetId: id, fields: "properties.title,sheets.properties.title" });
    const titles = (data.sheets ?? []).map((x) => x.properties!.title!);
    const { data: v } = await s.spreadsheets.values.batchGet({ spreadsheetId: id, ranges: titles.map((t) => `'${t.replace(/'/g, "''")}'`), valueRenderOption: "FORMATTED_VALUE" });
    const tabs: Record<string, string[][]> = {};
    (v.valueRanges ?? []).forEach((r, i) => (tabs[titles[i]] = (r.values ?? []).map((row) => row.map((c) => String(c ?? "")))));
    return { title: data.properties?.title ?? "", tabs };
  }
  async renameFile(id: string, name: string) {
    await this.drv().files.update({ fileId: id, supportsAllDrives: true, requestBody: { name } });
  }
  async appendRows(spreadsheetId: string, tab: string, rows: string[][]) {
    await sheets({ version: "v4", auth: this.a }).spreadsheets.values.append({ spreadsheetId, range: `'${tab.replace(/'/g, "''")}'!A1`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: rows } });
  }

  // ---- Calendar, Chat, Gmail ------------------------------------------------------
  async listCalendarAcl(calendarId: string) {
    const items = await all((pageToken) => calendar({ version: "v3", auth: this.a }).acl.list({ calendarId, pageToken }), (d) => d.items);
    return items.map((r) => ({ scopeType: r.scope?.type ?? "", email: (r.scope?.value ?? "").toLowerCase(), role: r.role ?? "" }));
  }
  async addCalendarWriter(calendarId: string, email: string) {
    await calendar({ version: "v3", auth: this.a }).acl.insert({ calendarId, sendNotifications: false, requestBody: { role: "writer", scope: { type: "user", value: email } } });
  }
  async listEvents(calendarId: string) {
    const { data } = await calendar({ version: "v3", auth: this.a }).events.list({ calendarId, singleEvents: false, maxResults: 2500, timeMin: new Date().toISOString() });
    return (data.items ?? []).map((e) => ({ summary: e.summary ?? "", recurring: Boolean(e.recurrence?.length) }));
  }
  private ch() {
    return chat({ version: "v1", auth: this.a });
  }
  async getSpace(name: string) {
    try {
      const { data } = await this.ch().spaces.get({ name });
      return { name: data.name!, displayName: data.displayName ?? "" };
    } catch (e) {
      if (notFound(e) || status(e) === 403) return null;
      throw e;
    }
  }
  async createSpace(displayName: string) {
    const { data } = await this.ch().spaces.create({ requestBody: { spaceType: "SPACE", displayName } });
    return data.name!;
  }
  async listSpaceMembers(space: string) {
    const items = await all((pageToken) => this.ch().spaces.members.list({ parent: space, showGroups: true, pageToken }), (d) => d.memberships);
    return items.map((m) =>
      m.groupMember?.name ? { member: m.groupMember.name, type: "GROUP" as const } : { member: m.member?.name ?? "", type: (m.member?.type === "BOT" ? "BOT" : "HUMAN") as "BOT" | "HUMAN" },
    );
  }
  async addSpaceGroup(space: string, groupId: string) {
    await this.ch().spaces.members.create({ parent: space, requestBody: { groupMember: { name: `groups/${groupId}` } } });
  }
  async addSpaceApp(space: string) {
    await this.ch().spaces.members.create({ parent: space, requestBody: { member: { name: "users/app", type: "BOT" } } });
  }
  async createDraft(m: { to: string; subject: string; text: string; html?: string }) {
    const boundary = `go-live-${Date.now()}`;
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
    const subject = /^[\x20-\x7e]*$/.test(m.subject) ? m.subject : `=?UTF-8?B?${Buffer.from(m.subject, "utf8").toString("base64")}?=`;
    const mime = [
      `To: ${m.to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      b64(m.text),
      ...(m.html ? [`--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(m.html)] : []),
      `--${boundary}--`,
      "",
    ].join("\r\n");
    // drafts.create only: go-live never sends mail. The admin reads the draft and sends it.
    const { data } = await gmail({ version: "v1", auth: this.a }).users.drafts.create({ userId: "me", requestBody: { message: { raw: Buffer.from(mime, "utf8").toString("base64url") } } });
    return { id: data.id!, url: `https://mail.google.com/mail/u/0/#drafts?compose=${data.message?.id ?? ""}` };
  }

  // ---- Cloud REST with gcloud's token ---------------------------------------------
  private async rest<T>(project: string, method: string, url: string, body?: unknown): Promise<T> {
    const token = (await gcloud(["auth", "print-access-token"])).trim();
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, "x-goog-user-project": project, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && method === "GET") return null as T;
    if (!res.ok) throw new Error(`${method} ${url.split("?")[0]} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }
  private docUrl = (project: string, path: string) => `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`;
  async getDoc(project: string, path: string) {
    const d = await this.rest<{ fields?: Record<string, FsValue> } | null>(project, "GET", this.docUrl(project, path));
    return d ? fromFields(d.fields ?? {}) : null;
  }
  async mergeDoc(project: string, path: string, fields: Record<string, unknown>) {
    const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(fieldPath(k))}`).join("&");
    await this.rest(project, "PATCH", `${this.docUrl(project, path)}?${mask}`, { fields: toFields(fields) });
  }

  // ---- Cloud through gcloud --------------------------------------------------------
  async findOrganization(domain: string) {
    const orgs = await gjson<{ name: string; displayName: string }[]>(["organizations", "list"]);
    return orgs.find((o) => o.displayName === domain)?.name.split("/")[1] ?? null;
  }
  async getProject(id: string) {
    try {
      const p = await gjson<{ projectId: string; projectNumber: string; parent?: { type: string; id: string } }>(["projects", "describe", id]);
      return { projectId: p.projectId, projectNumber: p.projectNumber, parent: p.parent ? `${p.parent.type}s/${p.parent.id}` : undefined };
    } catch (e) {
      if (e instanceof GcloudError && /not found|does not have permission|PERMISSION_DENIED|NOT_FOUND/i.test(e.stderr)) return null;
      throw e;
    }
  }
  async createProject(id: string, orgId: string, name: string) {
    await gcloud(["projects", "create", id, `--organization=${orgId}`, `--name=${name}`]);
    const p = await retry(() => this.getProject(id).then((x) => x ?? Promise.reject(new Error("not yet"))), () => true);
    return p;
  }
  async listBillingAccounts() {
    const list = await gjson<{ name: string; displayName: string; open: boolean }[]>(["billing", "accounts", "list"]);
    return list.map((b) => ({ id: b.name.split("/")[1], name: b.displayName, open: b.open }));
  }
  async projectBilling(project: string) {
    const b = await orNull(gjson<{ billingAccountName?: string; billingEnabled?: boolean }>(["billing", "projects", "describe", project]));
    return b?.billingEnabled && b.billingAccountName ? b.billingAccountName.split("/")[1] : null;
  }
  async linkBilling(project: string, account: string) {
    await gcloud(["billing", "projects", "link", project, `--billing-account=${account}`]);
  }
  async enabledServices(project: string) {
    return (await gcloud(["services", "list", "--enabled", `--project=${project}`, "--format=value(config.name)"])).split(/\s+/).filter(Boolean);
  }
  async enableServices(project: string, services: string[]) {
    for (let i = 0; i < services.length; i += 20) await gcloud(["services", "enable", ...services.slice(i, i + 20), `--project=${project}`]);
  }
  async getFirestore(project: string) {
    const d = await orNull(gjson<{ locationId: string; type: string; pointInTimeRecoveryEnablement?: string }>(["firestore", "databases", "describe", "--database=(default)", `--project=${project}`]));
    return d ? { locationId: d.locationId, type: d.type, pitr: d.pointInTimeRecoveryEnablement === "POINT_IN_TIME_RECOVERY_ENABLED" } : null;
  }
  async createFirestore(project: string, region: string) {
    await gcloud(["firestore", "databases", "create", `--location=${region}`, "--type=firestore-native", `--project=${project}`]);
  }
  async enablePitr(project: string) {
    await gcloud(["firestore", "databases", "update", "--database=(default)", "--enable-pitr", `--project=${project}`]);
  }
  async listIndexes(project: string): Promise<FirestoreIndex[]> {
    const list = await gjson<{ name: string; fields: { fieldPath: string; order?: string }[] }[]>(["firestore", "indexes", "composite", "list", `--project=${project}`]);
    return (list ?? []).map((i) => ({
      collectionGroup: i.name.split("/collectionGroups/")[1]?.split("/")[0] ?? "",
      fields: i.fields.filter((f) => f.fieldPath !== "__name__" && f.order).map((f) => ({ path: f.fieldPath, order: f.order as "ASCENDING" | "DESCENDING" })),
      why: "",
    }));
  }
  async createIndex(project: string, idx: FirestoreIndex) {
    await gcloud(["firestore", "indexes", "composite", "create", `--collection-group=${idx.collectionGroup}`, ...idx.fields.map((f) => `--field-config=field-path=${f.path},order=${f.order.toLowerCase()}`), "--async", `--project=${project}`]);
  }
  async getServiceAccount(email: string) {
    const sa = await orNull(gjson<{ email: string; uniqueId: string }>(["iam", "service-accounts", "describe", email]));
    return sa ? { email: sa.email, uniqueId: sa.uniqueId } : null;
  }
  async createServiceAccount(project: string, name: string, displayName: string) {
    await gcloud(["iam", "service-accounts", "create", name, `--display-name=${displayName}`, `--project=${project}`]);
    const email = `${name}@${project}.iam.gserviceaccount.com`;
    return retry(() => this.getServiceAccount(email).then((s) => s ?? Promise.reject(new Error("not yet"))), () => true);
  }
  async projectBindings(project: string) {
    return bindings(await gjson(["projects", "get-iam-policy", project]));
  }
  async addProjectBinding(project: string, member: string, role: string) {
    // A service account just made can take a minute to be usable in a policy.
    await retry(() => gcloud(["projects", "add-iam-policy-binding", project, `--member=${member}`, `--role=${role}`, "--condition=None", "--format=none"]), gone);
  }
  async serviceAccountBindings(email: string) {
    return bindings(await gjson(["iam", "service-accounts", "get-iam-policy", email]));
  }
  async addServiceAccountBinding(email: string, member: string, role: string) {
    await retry(() => gcloud(["iam", "service-accounts", "add-iam-policy-binding", email, `--member=${member}`, `--role=${role}`, "--format=none"]), gone);
  }
  async removeServiceAccountBinding(email: string, member: string, role: string) {
    await gcloud(["iam", "service-accounts", "remove-iam-policy-binding", email, `--member=${member}`, `--role=${role}`, "--format=none"]);
  }
  async listSecrets(project: string) {
    return (await gcloud(["secrets", "list", `--project=${project}`, "--format=value(name)"])).split(/\s+/).filter(Boolean).map((n) => n.split("/").pop()!);
  }
  async createSecret(project: string, name: string, value: string) {
    // The value goes in on stdin, never on the command line.
    await gcloud(["secrets", "create", name, "--data-file=-", "--replication-policy=automatic", `--project=${project}`], value);
  }
  async testDelegation(serviceAccount: string, subject: string, scope: string) {
    const now = Math.floor(Date.now() / 1000);
    const claims = JSON.stringify({ iss: serviceAccount, sub: subject, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 });
    const dir = mkdtempSync(join(tmpdir(), "go-live-"));
    try {
      writeFileSync(join(dir, "claims.json"), claims);
      // IAM Credentials signJwt: the service account signs, no key involved. A role just granted can take a minute.
      await retry(
        () => gcloud(["iam", "service-accounts", "sign-jwt", join(dir, "claims.json"), join(dir, "jwt"), `--iam-account=${serviceAccount}`]),
        (e) => e instanceof GcloudError && /PERMISSION_DENIED|403|iam.serviceAccounts.signJwt/i.test(e.stderr),
        8,
        5000,
      );
      const assertion = readFileSync(join(dir, "jwt"), "utf8").trim();
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      });
      if (res.ok) return { ok: true };
      const body = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
      return { ok: false, error: [body.error, body.error_description].filter(Boolean).join(": ") || String(res.status) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  async getService(project: string, region: string, name: string): Promise<CloudService | null> {
    type Svc = { status?: { url?: string }; spec?: { template?: { spec?: { serviceAccountName?: string; containers?: { env?: { name: string; value?: string }[] }[] } } } };
    const s = await orNull(gjson<Svc>(["run", "services", "describe", name, `--region=${region}`, `--project=${project}`]));
    if (!s?.status?.url) return null;
    const env: Record<string, string> = {};
    for (const e of s.spec?.template?.spec?.containers?.[0]?.env ?? []) if (e.value !== undefined) env[e.name] = e.value;
    return { url: s.status.url, env, serviceAccount: s.spec?.template?.spec?.serviceAccountName };
  }
  async deploy(project: string, req: DeployRequest) {
    this.log("  Building and deploying; this takes a few minutes...");
    await withFile("env.yaml", yamlEnv(req.env), (envFile) =>
      gcloud([
        "run", "deploy", req.service, `--source=${req.source}`, `--region=${req.region}`, `--project=${project}`, `--service-account=${req.serviceAccount}`,
        "--allow-unauthenticated", `--env-vars-file=${envFile}`, `--set-secrets=${Object.entries(req.secrets).map(([k, v]) => `${k}=${v}`).join(",")}`,
      ]),
    );
    const s = await this.getService(project, req.region, req.service);
    if (!s) throw new Error("The deploy finished, but Cloud Run doesn't list the service.");
    return s;
  }
  async updateServiceEnv(project: string, region: string, name: string, set: Record<string, string>, remove: string[]) {
    const args = ["run", "services", "update", name, `--region=${region}`, `--project=${project}`];
    // ^|^ makes | the separator, so values may hold commas.
    if (Object.keys(set).length) args.push(`--update-env-vars=^|^${Object.entries(set).map(([k, v]) => `${k}=${v}`).join("|")}`);
    if (remove.length) args.push(`--remove-env-vars=${remove.join(",")}`);
    await gcloud(args);
  }
  async verifiedDomains() {
    return (await gcloud(["domains", "list-user-verified", "--format=value(id)"]).catch(() => "")).split(/\s+/).filter(Boolean);
  }
  async getDomainMapping(project: string, region: string, domain: string): Promise<DomainMapping | null> {
    type DM = { status?: { resourceRecords?: { type: string; name?: string; rrdata: string }[]; conditions?: { type: string; status: string; message?: string }[] } };
    const m = await orNull(gjson<DM>(["beta", "run", "domain-mappings", "describe", `--domain=${domain}`, `--region=${region}`, `--project=${project}`]));
    if (!m) return null;
    const cond = (t: string) => m.status?.conditions?.find((c) => c.type === t);
    const waiting = m.status?.conditions?.filter((c) => c.status !== "True" && c.message).map((c) => c.message!) ?? [];
    return {
      records: (m.status?.resourceRecords ?? []).map((r) => ({ type: r.type, name: r.name ?? domain.split(".")[0], value: r.rrdata, ttl: "3600" })),
      ready: cond("Ready")?.status === "True",
      certificateReady: cond("CertificateProvisioned")?.status === "True",
      message: waiting.join(" ") || undefined,
    };
  }
  async createDomainMapping(project: string, region: string, domain: string, service: string) {
    await gcloud(["beta", "run", "domain-mappings", "create", `--service=${service}`, `--domain=${domain}`, `--region=${region}`, `--project=${project}`]);
    return (await this.getDomainMapping(project, region, domain))!;
  }
  async getSchedulerJob(project: string, region: string, name: string): Promise<SchedulerJob | null> {
    type J = { schedule: string; timeZone: string; httpTarget?: { uri: string; body?: string; oidcToken?: { serviceAccountEmail: string; audience?: string }; oauthToken?: { serviceAccountEmail: string } } };
    const j = await orNull(gjson<J>(["scheduler", "jobs", "describe", name, `--location=${region}`, `--project=${project}`]));
    if (!j?.httpTarget) return null;
    const t = j.httpTarget;
    return {
      name,
      schedule: j.schedule,
      timeZone: j.timeZone,
      uri: t.uri,
      audience: t.oidcToken?.audience,
      serviceAccount: t.oidcToken?.serviceAccountEmail ?? t.oauthToken?.serviceAccountEmail,
      body: t.body ? Buffer.from(t.body, "base64").toString("utf8") : undefined,
    };
  }
  async putSchedulerJob(project: string, region: string, job: SchedulerJob, kind: "oidc" | "oauth") {
    const exists = Boolean(await this.getSchedulerJob(project, region, job.name));
    const base = ["scheduler", "jobs", exists ? "update" : "create", "http", job.name, `--location=${region}`, `--project=${project}`, `--schedule=${job.schedule}`, `--time-zone=${job.timeZone}`, `--uri=${job.uri}`, "--http-method=POST"];
    const auth =
      kind === "oidc"
        ? [`--oidc-service-account-email=${job.serviceAccount}`, `--oidc-token-audience=${job.audience}`]
        : [`--oauth-service-account-email=${job.serviceAccount}`, "--oauth-token-scope=https://www.googleapis.com/auth/datastore"];
    if (!job.body) return void (await gcloud([...base, ...auth]));
    const headers = exists ? "--update-headers=Content-Type=application/json" : "--headers=Content-Type=application/json";
    await withFile("body.json", job.body, (f) => gcloud([...base, ...auth, `--message-body-from-file=${f}`, headers]));
  }
  async getBucket(name: string): Promise<Bucket | null> {
    type B = { name: string; location: string; lifecycle_config?: { rule?: { action: { type: string }; condition: { age?: number } }[] }; lifecycle?: { rule?: { action: { type: string }; condition: { age?: number } }[] } };
    const b = await orNull(gjson<B>(["storage", "buckets", "describe", `gs://${name}`]));
    if (!b) return null;
    const rules = b.lifecycle_config?.rule ?? b.lifecycle?.rule ?? [];
    return { name, location: b.location.toLowerCase(), deleteAfterDays: rules.find((r) => r.action.type === "Delete")?.condition.age };
  }
  async createBucket(project: string, b: Bucket) {
    await gcloud(["storage", "buckets", "create", `gs://${b.name}`, `--project=${project}`, `--location=${b.location}`, "--uniform-bucket-level-access", "--public-access-prevention"]);
    if (b.deleteAfterDays)
      await withFile("lifecycle.json", JSON.stringify({ rule: [{ action: { type: "Delete" }, condition: { age: b.deleteAfterDays } }] }), (f) =>
        gcloud(["storage", "buckets", "update", `gs://${b.name}`, `--lifecycle-file=${f}`]),
      );
  }
  async bucketBindings(name: string) {
    return bindings(await gjson(["storage", "buckets", "get-iam-policy", `gs://${name}`]));
  }
  async addBucketBinding(name: string, member: string, role: string) {
    await retry(() => gcloud(["storage", "buckets", "add-iam-policy-binding", `gs://${name}`, `--member=${member}`, `--role=${role}`, "--format=none"]), gone);
  }
  private mon = (project: string, what: string) => `https://monitoring.googleapis.com/v3/projects/${project}/${what}`;
  async listUptimeChecks(project: string): Promise<UptimeCheck[]> {
    type U = { uptimeCheckConfigs?: { name: string; displayName: string; monitoredResource?: { labels?: { host?: string } }; httpCheck?: { path?: string } }[] };
    const r = await this.rest<U | null>(project, "GET", this.mon(project, "uptimeCheckConfigs"));
    return (r?.uptimeCheckConfigs ?? []).map((u) => ({ id: u.name.split("/").pop()!, displayName: u.displayName, host: u.monitoredResource?.labels?.host ?? "", path: u.httpCheck?.path ?? "" }));
  }
  async createUptimeCheck(project: string, c: Omit<UptimeCheck, "id">) {
    const r = await this.rest<{ name: string }>(project, "POST", this.mon(project, "uptimeCheckConfigs"), {
      displayName: c.displayName,
      monitoredResource: { type: "uptime_url", labels: { project_id: project, host: c.host } },
      httpCheck: { path: c.path, port: 443, useSsl: true, validateSsl: true, requestMethod: "GET" },
      period: "300s",
      timeout: "10s",
    });
    return r.name.split("/").pop()!;
  }
  private async emailChannel(project: string, email: string): Promise<string> {
    type C = { notificationChannels?: { name: string; type: string; labels?: { email_address?: string } }[] };
    const list = await this.rest<C | null>(project, "GET", this.mon(project, "notificationChannels"));
    const hit = list?.notificationChannels?.find((c) => c.type === "email" && c.labels?.email_address === email);
    if (hit) return hit.name;
    const made = await this.rest<{ name: string }>(project, "POST", this.mon(project, "notificationChannels"), { type: "email", displayName: email, labels: { email_address: email } });
    return made.name;
  }
  async listAlertPolicies(project: string): Promise<AlertPolicy[]> {
    type P = { alertPolicies?: { name: string; displayName: string; notificationChannels?: string[] }[] };
    type C = { notificationChannels?: { name: string; labels?: { email_address?: string } }[] };
    const [p, c] = await Promise.all([this.rest<P | null>(project, "GET", this.mon(project, "alertPolicies")), this.rest<C | null>(project, "GET", this.mon(project, "notificationChannels"))]);
    const email = new Map((c?.notificationChannels ?? []).map((x) => [x.name, x.labels?.email_address ?? ""]));
    return (p?.alertPolicies ?? []).map((x) => ({ id: x.name, displayName: x.displayName, channelEmails: (x.notificationChannels ?? []).map((n) => email.get(n) ?? "") }));
  }
  async createAlertPolicy(project: string, p: { displayName: string; uptimeCheckId: string; email: string }) {
    const channel = await this.emailChannel(project, p.email);
    await this.rest(project, "POST", this.mon(project, "alertPolicies"), {
      displayName: p.displayName,
      combiner: "OR",
      conditions: [
        {
          displayName: "The sign-in page isn't answering",
          conditionThreshold: {
            filter: `metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.label.check_id="${p.uptimeCheckId}" AND resource.type="uptime_url"`,
            comparison: "COMPARISON_GT",
            thresholdValue: 1,
            duration: "300s",
            trigger: { count: 1 },
            aggregations: [{ alignmentPeriod: "1200s", perSeriesAligner: "ALIGN_NEXT_OLDER", crossSeriesReducer: "REDUCE_COUNT_FALSE", groupByFields: ["resource.label.*"] }],
          },
        },
      ],
      notificationChannels: [channel],
      documentation: { mimeType: "text/markdown", content: "The IAR Portal's sign-in page has stopped answering. Check Cloud Run logs: `gcloud run services logs read iar-portal`." },
    });
  }
  private logMetricsUrl = (project: string) => `https://logging.googleapis.com/v2/projects/${project}/metrics`;
  async listLogMetrics(project: string): Promise<LogMetric[]> {
    type M = { metrics?: { name: string; description?: string; filter: string }[] };
    const r = await this.rest<M | null>(project, "GET", `${this.logMetricsUrl(project)}?pageSize=200`);
    return (r?.metrics ?? []).map((m) => ({ name: m.name, description: m.description ?? "", filter: m.filter }));
  }
  async createLogMetric(project: string, m: LogMetric) {
    await this.rest(project, "POST", this.logMetricsUrl(project), { name: m.name, description: m.description, filter: m.filter });
  }
  async createLogAlertPolicy(project: string, p: { displayName: string; metric: string; above: number; email: string; doc: string }) {
    const channel = await this.emailChannel(project, p.email);
    const body = {
      displayName: p.displayName,
      combiner: "OR",
      conditions: [
        {
          displayName: p.displayName,
          conditionThreshold: {
            filter: `metric.type="logging.googleapis.com/user/${p.metric}" AND resource.type="cloud_run_revision"`,
            comparison: "COMPARISON_GT",
            thresholdValue: p.above,
            duration: "0s",
            trigger: { count: 1 },
            aggregations: [{ alignmentPeriod: "300s", perSeriesAligner: "ALIGN_SUM", crossSeriesReducer: "REDUCE_SUM" }],
          },
        },
      ],
      alertStrategy: { autoClose: "1800s" },
      notificationChannels: [channel],
      documentation: { mimeType: "text/markdown", content: p.doc },
    };
    // A log metric made a moment ago can take a minute before Monitoring knows it.
    for (let i = 1; ; i++) {
      try {
        await this.rest(project, "POST", this.mon(project, "alertPolicies"), body);
        return;
      } catch (err) {
        if (i >= 6 || !/failed: (400|404)/.test(String(err))) throw err;
        await sleep(10_000);
      }
    }
  }
  // Budgets calls are charged to the portal's project (x-goog-user-project).
  async listBudgets(project: string, billingAccount: string): Promise<Budget[]> {
    type B = { budgets?: { name: string; displayName?: string; amount?: { specifiedAmount?: { units?: string } }; budgetFilter?: { projects?: string[] } }[]; nextPageToken?: string };
    const r = await this.rest<B | null>(project, "GET", `https://billingbudgets.googleapis.com/v1/billingAccounts/${billingAccount}/budgets?pageSize=100`);
    return (r?.budgets ?? []).map((b) => ({ id: b.name, displayName: b.displayName ?? "", amountUsd: Number(b.amount?.specifiedAmount?.units ?? 0), projects: b.budgetFilter?.projects ?? [] }));
  }
  async createBudget(project: string, billingAccount: string, b: Omit<Budget, "id"> & { email: string }) {
    const p = await this.getProject(project);
    const channel = await this.emailChannel(project, b.email);
    await this.rest(project, "POST", `https://billingbudgets.googleapis.com/v1/billingAccounts/${billingAccount}/budgets`, {
      displayName: b.displayName,
      budgetFilter: { projects: b.projects.map((x) => `projects/${x === project && p ? p.projectNumber : x}`) },
      amount: { specifiedAmount: { currencyCode: "USD", units: String(b.amountUsd) } },
      thresholdRules: [{ thresholdPercent: 0.5 }, { thresholdPercent: 0.9 }, { thresholdPercent: 1.0 }],
      notificationsRule: { monitoringNotificationChannels: [channel], disableDefaultIamRecipients: false },
    });
  }
  async imageCleanupKeeps(project: string, region: string, repo: string) {
    type R = { cleanupPolicies?: Record<string, { action?: string; mostRecentVersions?: { keepCount?: number } }> };
    const r = await orNull(gjson<R>(["artifacts", "repositories", "describe", repo, `--location=${region}`, `--project=${project}`]));
    if (!r) return "no-repo" as const;
    const keep = Object.values(r.cleanupPolicies ?? {}).find((p) => p.action === "KEEP" && p.mostRecentVersions?.keepCount);
    return keep?.mostRecentVersions?.keepCount ?? null;
  }
  async setImageCleanup(project: string, region: string, repo: string, keep: number) {
    const policy = [
      { name: `keep-last-${keep}`, action: { type: "Keep" }, mostRecentVersions: { keepCount: keep } },
      { name: "delete-older-builds", action: { type: "Delete" }, condition: { tagState: "any", olderThan: "1d" } },
    ];
    await withFile("cleanup.json", JSON.stringify(policy), (f) => gcloud(["artifacts", "repositories", "set-cleanup-policies", repo, `--location=${region}`, `--project=${project}`, `--policy=${f}`, "--no-dry-run"]));
  }
}
