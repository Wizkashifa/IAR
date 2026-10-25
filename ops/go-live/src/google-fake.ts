/**
 * An in-memory Google for the tests. Reads see earlier writes, so a second
 * run can be checked to plan nothing. Every call is recorded in `calls`;
 * `mutations` lists the ones that change something. Steps done by hand in
 * the real consoles are played by `byHand(step)`, which the tests' prompt
 * calls when go-live waits for Enter.
 */
import type { FirestoreIndex } from "./indexes";
import type { Tab } from "./sheet";
import {
  type AclRule, type AdminRole, type BillingAccount, type Bucket, type Budget, type CalendarEvent, type CalendarResource, type ChatMembership, type ClientFile,
  type CloudService, type DeployRequest, type DnsRecord, type DomainMapping, type DrivePermission, type FirestoreDb, type Google, type Group, type GroupSettings,
  type License, type Member, type MemberRole, NoFreeLicense, type Privilege, type Project, type SchedulerJob, type ServiceAccount, type UptimeCheck, type User, type AlertPolicy,
} from "./google";

export const MUTATING = /^(create|add|update|remove|assign|link|enable|deploy|put|set|merge|rename|append)(?=[A-Z])|^deploy$/;

type FakeOptions = {
  domain: string;
  project: string;
  admin?: string;
  users?: string[];
  /** The project and go-live's sign-in clients already exist (step 0 done). */
  ready?: boolean;
  resources?: CalendarResource[];
  /** Spare Workspace licenses. */
  freeLicenses?: number;
};

export class FakeGoogle implements Google {
  calls: string[] = [];
  mutations: string[] = [];
  readonly domain: string;
  readonly project: string;
  readonly admin: string;
  readonly projectNumber = "123456789012";
  readonly webClientId = "123456789012-abcdef.apps.googleusercontent.com";

  clientFile: ClientFile | null = null;
  users = new Map<string, User & { license?: License }>();
  groups = new Map<string, Group>();
  members = new Map<string, Member[]>();
  groupSettings = new Map<string, GroupSettings>();
  privileges: Privilege[] = [
    { serviceId: "00haapch16h1ysv", privilegeName: "GROUPS_RETRIEVE" },
    { serviceId: "00haapch16h1ysv", privilegeName: "GROUPS_ALL" },
    { serviceId: "00haapch16h1ysv", privilegeName: "CALENDAR_RESOURCES_RETRIEVE" },
    { serviceId: "00haapch16h1ysv", privilegeName: "BUILDINGS_RETRIEVE" },
    { serviceId: "00haapch16h1ysv", privilegeName: "USERS_RETRIEVE" },
  ];
  roles: AdminRole[] = [];
  roleHolders = new Map<string, string[]>();
  resources: CalendarResource[];
  freeLicenses: number;
  drives = new Map<string, { name: string; perms: DrivePermission[]; folders: Map<string, string> }>();
  sheets = new Map<string, { title: string; tabs: Record<string, string[][]> }>();
  acl = new Map<string, AclRule[]>();
  events = new Map<string, CalendarEvent[]>();
  spaces = new Map<string, { displayName: string; members: ChatMembership[] }>();
  drafts: { id: string; to: string; subject: string; text: string }[] = [];
  docs = new Map<string, Record<string, unknown>>();

  orgId = "555";
  projects = new Map<string, Project>();
  billingAccounts: BillingAccount[] = [{ id: "01AB23-45CD67-89EF01", name: "IAR main billing", open: true }];
  billing = new Map<string, string>();
  services = new Set<string>();
  db: FirestoreDb | null = null;
  indexes: FirestoreIndex[] = [];
  serviceAccounts = new Map<string, ServiceAccount>();
  projectBindingSet = new Set<string>();
  saBindings = new Map<string, Set<string>>();
  secrets = new Map<string, string>();
  service: CloudService | null = null;
  deploys = 0;
  domainMapping: DomainMapping | null = null;
  verified: string[] = [];
  jobs = new Map<string, SchedulerJob>();
  buckets = new Map<string, Bucket & { bindings: Set<string> }>();
  uptime: UptimeCheck[] = [];
  alerts: AlertPolicy[] = [];
  budgets: Budget[] = [];
  cleanupKeep: number | null = null;

  // Done by hand in the real consoles.
  delegation = new Map<string, string[]>();
  redirectsAccepted = false;
  chatAppConfigured = false;
  dnsDone = false;

  constructor(o: FakeOptions) {
    this.domain = o.domain;
    this.project = o.project;
    this.admin = o.admin ?? `admin@${o.domain}`;
    this.resources = o.resources ?? [];
    this.freeLicenses = o.freeLicenses ?? 5;
    this.users.set(this.admin, { email: this.admin, name: "Admin Person", isAdmin: true, suspended: false, license: { productId: "Google-Apps", skuId: "1010020027", skuName: "Google Workspace for Nonprofits" } });
    for (const u of (o.users ?? []).filter((x) => x.toLowerCase() !== this.admin)) this.users.set(u.toLowerCase(), { email: u.toLowerCase(), name: u, isAdmin: false, suspended: false });
    this.verified = [o.domain];
    if (o.ready) {
      this.projects.set(o.project, { projectId: o.project, projectNumber: this.projectNumber, parent: `organizations/${this.orgId}` });
      this.clientFile = { path: "client_secret.json", clientId: "123456789012-desk.apps.googleusercontent.com", clientSecret: "x", projectId: o.project, desktop: true };
      for (const s of ["admin.googleapis.com", "groupssettings.googleapis.com", "licensing.googleapis.com", "drive.googleapis.com", "sheets.googleapis.com", "gmail.googleapis.com", "calendar-json.googleapis.com", "chat.googleapis.com"]) this.services.add(s);
    }
    // Every call is recorded; the ones that change something are listed separately.
    return new Proxy(this, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (typeof v !== "function" || typeof prop !== "string" || prop === "byHand" || prop === "putSheet" || prop === "constructor") return v;
        return (...args: unknown[]) => {
          target.calls.push(prop);
          if (MUTATING.test(prop)) target.mutations.push(prop);
          return v.apply(target, args);
        };
      },
    });
  }

  /** The admin does a step by hand. */
  byHand(step?: string) {
    if (step === "oauth-clients") this.clientFile = { path: "client_secret.json", clientId: "123456789012-desk.apps.googleusercontent.com", clientSecret: "x", projectId: this.project, desktop: true };
    if (step === "delegation") {
      const sa = [...this.serviceAccounts.values()].find((s) => s.email.startsWith("portal-runtime@"));
      if (sa)
        this.delegation.set(sa.uniqueId, [
          "https://www.googleapis.com/auth/admin.directory.group.readonly",
          "https://www.googleapis.com/auth/admin.directory.resource.calendar.readonly",
          "https://www.googleapis.com/auth/admin.directory.user.readonly",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/calendar.events",
        ]);
    }
    if (step === "redirect-uri") this.redirectsAccepted = true;
    if (step === "chat-app") this.chatAppConfigured = true;
    if (step === "domain-verify") this.verified.push(this.domain);
  }

  /** The sheet as the office filled it in. */
  putSheet(id: string, title: string, tabs: Record<string, string[][]>) {
    this.sheets.set(id, { title, tabs: structuredClone(tabs) });
  }

  private n = 0;
  private id(prefix: string) {
    return `${prefix}${++this.n}`;
  }

  // ---- This computer --------------------------------------------------
  async tools() {
    return { node: "v22.1.0", gcloud: "500.0.0" };
  }
  async gcloudAccount() {
    return this.admin;
  }
  async findClientFile() {
    return this.clientFile;
  }
  async signIn() {
    return { email: this.admin, name: "Admin Person" };
  }
  async fetchStatus(url: string) {
    return this.service && url.endsWith("/signin") ? 200 : 404;
  }
  async redirectUriAccepted() {
    return this.redirectsAccepted;
  }
  async dnsMatches(_host: string, _r: DnsRecord) {
    return this.dnsDone;
  }

  // ---- Directory ---------------------------------------------------------
  async getUser(email: string) {
    const u = this.users.get(email.toLowerCase());
    return u ? { email: u.email, name: u.name, isAdmin: u.isAdmin, suspended: u.suspended } : null;
  }
  async createUser(u: { email: string; givenName: string; familyName: string; password: string }) {
    if (this.users.has(u.email)) throw new Error("exists");
    if (u.password.length < 16) throw new Error("weak password");
    this.users.set(u.email, { email: u.email, name: `${u.givenName} ${u.familyName}`, isAdmin: false, suspended: false });
  }
  async getGroup(email: string) {
    return this.groups.get(email.toLowerCase()) ?? null;
  }
  async createGroup(g: { email: string; name: string; description: string }) {
    if (this.groups.has(g.email)) throw new Error("exists");
    const group = { id: this.id("0grp"), email: g.email, name: g.name };
    this.groups.set(g.email, group);
    this.members.set(g.email, []);
    this.groupSettings.set(g.email, { whoCanModerateMembers: "OWNERS_AND_MANAGERS", whoCanPostMessage: "ALL_MEMBERS_CAN_POST" });
    return group;
  }
  async listMembers(group: string) {
    if (!this.groups.has(group)) throw new Error(`no group ${group}`);
    return structuredClone(this.members.get(group) ?? []);
  }
  async addMember(group: string, m: Member) {
    const list = this.members.get(group);
    if (!list) throw new Error(`no group ${group}`);
    if (list.some((x) => x.email === m.email)) throw new Error("member exists");
    if (m.type === "USER" && !this.users.has(m.email)) throw new Error(`no user ${m.email}`);
    if (m.type === "GROUP" && !this.groups.has(m.email)) throw new Error(`no group ${m.email}`);
    list.push({ ...m });
  }
  async updateMemberRole(group: string, email: string, role: MemberRole) {
    const m = this.members.get(group)?.find((x) => x.email === email);
    if (!m) throw new Error("no member");
    m.role = role;
  }
  async removeMember(group: string, email: string) {
    this.members.set(group, (this.members.get(group) ?? []).filter((m) => m.email !== email));
  }
  async getGroupSettings(group: string) {
    return { ...(this.groupSettings.get(group) ?? {}) };
  }
  async updateGroupSettings(group: string, s: GroupSettings) {
    this.groupSettings.set(group, { ...this.groupSettings.get(group), ...s });
  }
  async listPrivileges() {
    return this.privileges;
  }
  async listAdminRoles() {
    return structuredClone(this.roles);
  }
  async createAdminRole(r: { name: string; description: string; privileges: Privilege[] }) {
    const id = this.id("role");
    this.roles.push({ id, name: r.name, privileges: r.privileges });
    return id;
  }
  async listRoleHolders(roleId: string) {
    return [...(this.roleHolders.get(roleId) ?? [])];
  }
  async assignAdminRole(roleId: string, user: string) {
    if (!this.users.has(user)) throw new Error("no user");
    this.roleHolders.set(roleId, [...(this.roleHolders.get(roleId) ?? []), user]);
  }
  async listCalendarResources() {
    return this.resources;
  }

  // ---- Licensing ---------------------------------------------------------
  async licenseOf(email: string) {
    return this.users.get(email)?.license ?? null;
  }
  async assignLicense(email: string, l: License) {
    if (this.freeLicenses < 1) throw new NoFreeLicense("none free");
    this.freeLicenses--;
    this.users.get(email)!.license = l;
  }

  // ---- Drive and Sheets ----------------------------------------------------
  async findSharedDrive(name: string) {
    return [...this.drives.entries()].find(([, d]) => d.name === name)?.[0] ?? null;
  }
  async createSharedDrive(name: string) {
    const id = this.id("drive");
    this.drives.set(id, { name, perms: [{ email: this.admin, type: "user", role: "organizer" }], folders: new Map() });
    return id;
  }
  async listDrivePermissions(id: string) {
    return structuredClone(this.drives.get(id)!.perms);
  }
  async addDrivePermission(id: string, p: DrivePermission) {
    const d = this.drives.get(id)!;
    d.perms = d.perms.filter((x) => x.email !== p.email).concat({ ...p });
  }
  async removeDrivePermission(id: string, email: string) {
    const d = this.drives.get(id)!;
    d.perms = d.perms.filter((x) => x.email !== email);
    if (!d.perms.some((x) => x.role === "organizer")) throw new Error("a shared drive needs a manager");
  }
  async findFolder(id: string, name: string) {
    return this.drives.get(id)!.folders.get(name) ?? null;
  }
  async createFolder(id: string, name: string) {
    const f = this.id("folder");
    this.drives.get(id)!.folders.set(name, f);
    return f;
  }
  async createSpreadsheet(title: string, tabs: Tab[]) {
    const id = this.id("sheet");
    this.sheets.set(id, { title, tabs: Object.fromEntries(tabs.map((t) => [t.name, [t.header, ...t.rows]])) });
    return { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit` };
  }
  async readSpreadsheet(id: string) {
    const s = this.sheets.get(id);
    if (!s) throw new Error(`no sheet ${id}`);
    return structuredClone(s);
  }
  async renameFile(id: string, name: string) {
    this.sheets.get(id)!.title = name;
  }
  async appendRows(id: string, tab: string, rows: string[][]) {
    this.sheets.get(id)!.tabs[tab].push(...rows);
  }

  // ---- Calendar, Chat, Gmail ----------------------------------------------
  async listCalendarAcl(id: string) {
    return structuredClone(this.acl.get(id) ?? []);
  }
  async addCalendarWriter(id: string, email: string) {
    this.acl.set(id, [...(this.acl.get(id) ?? []), { scopeType: "user", email, role: "writer" }]);
  }
  async listEvents(id: string) {
    return this.events.get(id) ?? [];
  }
  async getSpace(name: string) {
    const s = this.spaces.get(name);
    return s ? { name, displayName: s.displayName } : null;
  }
  async createSpace(displayName: string) {
    const name = `spaces/${this.id("AAAA")}`;
    this.spaces.set(name, { displayName, members: [{ member: `users/${this.admin}`, type: "HUMAN" }] });
    return name;
  }
  async listSpaceMembers(space: string) {
    return structuredClone(this.spaces.get(space)!.members);
  }
  async addSpaceGroup(space: string, groupId: string) {
    this.spaces.get(space)!.members.push({ member: `groups/${groupId}`, type: "GROUP" });
  }
  async addSpaceApp(space: string) {
    if (!this.chatAppConfigured) throw new Error("The Chat app isn't configured");
    this.spaces.get(space)!.members.push({ member: "users/app", type: "BOT" });
  }
  async createDraft(m: { to: string; subject: string; text: string }) {
    const id = this.id("r-draft");
    this.drafts.push({ id, ...m });
    return { id, url: `https://mail.google.com/mail/u/0/#drafts?compose=${id}` };
  }

  // ---- Firestore -------------------------------------------------------------
  async getDoc(_p: string, path: string) {
    const d = this.docs.get(path);
    return d ? structuredClone(d) : null;
  }
  async mergeDoc(_p: string, path: string, fields: Record<string, unknown>) {
    if (!this.db) throw new Error("no database");
    this.docs.set(path, { ...(this.docs.get(path) ?? {}), ...structuredClone(fields) });
  }

  // ---- Cloud -----------------------------------------------------------------
  async findOrganization() {
    return this.orgId;
  }
  async getProject(id: string) {
    return this.projects.get(id) ?? null;
  }
  async createProject(id: string, orgId: string) {
    const p = { projectId: id, projectNumber: this.projectNumber, parent: `organizations/${orgId}` };
    this.projects.set(id, p);
    return p;
  }
  async listBillingAccounts() {
    return this.billingAccounts;
  }
  async projectBilling(p: string) {
    return this.billing.get(p) ?? null;
  }
  async linkBilling(p: string, a: string) {
    this.billing.set(p, a);
  }
  async enabledServices() {
    return [...this.services];
  }
  async enableServices(_p: string, s: string[]) {
    if (s.some((x) => x.startsWith("run.")) && !this.billing.size) throw new Error("billing required");
    for (const x of s) this.services.add(x);
  }
  async getFirestore() {
    return this.db ? { ...this.db } : null;
  }
  async createFirestore(_p: string, region: string) {
    this.db = { locationId: region, type: "FIRESTORE_NATIVE", pitr: false };
  }
  async enablePitr() {
    this.db!.pitr = true;
  }
  async listIndexes() {
    return structuredClone(this.indexes);
  }
  async createIndex(_p: string, i: FirestoreIndex) {
    this.indexes.push(structuredClone(i));
  }
  async getServiceAccount(email: string) {
    return this.serviceAccounts.get(email) ?? null;
  }
  async createServiceAccount(p: string, name: string) {
    const sa = { email: `${name}@${p}.iam.gserviceaccount.com`, uniqueId: String(100000000000000000000n + BigInt(this.serviceAccounts.size + 1)) };
    this.serviceAccounts.set(sa.email, sa);
    return sa;
  }
  async projectBindings() {
    return [...this.projectBindingSet];
  }
  async addProjectBinding(_p: string, member: string, role: string) {
    this.projectBindingSet.add(`${member}|${role}`);
  }
  async serviceAccountBindings(email: string) {
    return [...(this.saBindings.get(email) ?? [])];
  }
  async addServiceAccountBinding(email: string, member: string, role: string) {
    if (!this.serviceAccounts.has(email)) throw new Error("no service account");
    const s = this.saBindings.get(email) ?? new Set<string>();
    s.add(`${member}|${role}`);
    this.saBindings.set(email, s);
  }
  async removeServiceAccountBinding(email: string, member: string, role: string) {
    this.saBindings.get(email)?.delete(`${member}|${role}`);
  }
  async listSecrets() {
    return [...this.secrets.keys()];
  }
  async createSecret(_p: string, name: string, value: string) {
    if (this.secrets.has(name)) throw new Error("exists");
    this.secrets.set(name, value);
  }
  async testDelegation(sa: string, _subject: string, scope: string) {
    if (!this.saBindings.get(sa)?.has(`user:${this.admin}|roles/iam.serviceAccountTokenCreator`)) return { ok: false, error: "no permission to sign" };
    const id = this.serviceAccounts.get(sa)?.uniqueId ?? "";
    return this.delegation.get(id)?.includes(scope) ? { ok: true } : { ok: false, error: "unauthorized_client" };
  }
  async getService() {
    return this.service ? structuredClone(this.service) : null;
  }
  async deploy(_p: string, req: DeployRequest) {
    if (!this.services.has("run.googleapis.com")) throw new Error("Cloud Run API is off");
    for (const s of Object.values(req.secrets)) if (!this.secrets.has(s.split(":")[0])) throw new Error(`no secret ${s}`);
    this.deploys++;
    this.service = { url: `https://iar-portal-${this.projectNumber}.${req.region}.run.app`, env: { ...req.env }, serviceAccount: req.serviceAccount };
    return structuredClone(this.service);
  }
  async updateServiceEnv(_p: string, _r: string, _n: string, set: Record<string, string>, remove: string[]) {
    this.deploys++;
    const env = { ...this.service!.env, ...set };
    for (const k of remove) delete env[k];
    this.service!.env = env;
  }
  async verifiedDomains() {
    return [...this.verified];
  }
  async getDomainMapping() {
    if (!this.domainMapping) return null;
    return { ...this.domainMapping, ready: this.dnsDone, certificateReady: this.dnsDone, message: this.dnsDone ? undefined : "Waiting for DNS" };
  }
  async createDomainMapping() {
    this.domainMapping = { records: [{ type: "CNAME", name: "portal", value: "ghs.googlehosted.com.", ttl: "3600" }], ready: false, certificateReady: false };
    return this.domainMapping;
  }
  async getSchedulerJob(_p: string, _r: string, name: string) {
    const j = this.jobs.get(name);
    return j ? { ...j } : null;
  }
  async putSchedulerJob(_p: string, _r: string, job: SchedulerJob) {
    this.jobs.set(job.name, { ...job });
  }
  async getBucket(name: string) {
    const b = this.buckets.get(name);
    return b ? { name: b.name, location: b.location, deleteAfterDays: b.deleteAfterDays } : null;
  }
  async createBucket(_p: string, b: Bucket) {
    this.buckets.set(b.name, { ...b, bindings: new Set() });
  }
  async bucketBindings(name: string) {
    return [...(this.buckets.get(name)?.bindings ?? [])];
  }
  async addBucketBinding(name: string, member: string, role: string) {
    this.buckets.get(name)!.bindings.add(`${member}|${role}`);
  }
  async listUptimeChecks() {
    return structuredClone(this.uptime);
  }
  async createUptimeCheck(_p: string, c: Omit<UptimeCheck, "id">) {
    const id = this.id("uptime");
    this.uptime.push({ id, ...c });
    return id;
  }
  async listAlertPolicies() {
    return structuredClone(this.alerts);
  }
  async createAlertPolicy(_p: string, a: { displayName: string; uptimeCheckId: string; email: string }) {
    this.alerts.push({ id: this.id("policy"), displayName: a.displayName, channelEmails: [a.email] });
  }
  async listBudgets() {
    return structuredClone(this.budgets);
  }
  async createBudget(_p: string, _b: string, b: Omit<Budget, "id"> & { email: string }) {
    this.budgets.push({ id: this.id("budget"), displayName: b.displayName, amountUsd: b.amountUsd, projects: b.projects });
  }
  async imageCleanupKeeps() {
    if (!this.deploys) return "no-repo" as const;
    return this.cleanupKeep;
  }
  async setImageCleanup(_p: string, _r: string, _repo: string, keep: number) {
    this.cleanupKeep = keep;
  }
}
