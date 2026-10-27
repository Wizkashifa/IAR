/**
 * Every call go-live makes to Google, as one interface. google-real.ts does
 * them for real (Workspace APIs with the admin's own sign-in, Cloud through
 * the gcloud CLI); google-fake.ts keeps everything in memory for the tests.
 *
 * There is deliberately no way here to create or download a service account
 * key, or to touch anyone's email: the portal signs its own tokens, and
 * go-live doesn't use Gmail at all.
 */
import type { FirestoreIndex } from "./indexes";
import type { Tab } from "./sheet";

export type User = { email: string; name: string; isAdmin: boolean; suspended: boolean };
export type Group = { id: string; email: string; name: string };
export type MemberRole = "OWNER" | "MANAGER" | "MEMBER";
export type Member = { email: string; role: MemberRole; type: "USER" | "GROUP" };
export type GroupSettings = { whoCanModerateMembers?: string; whoCanPostMessage?: string };
export type Privilege = { serviceId: string; privilegeName: string };
export type AdminRole = { id: string; name: string; privileges: Privilege[] };
export type License = { productId: string; skuId: string; skuName: string };
export type CalendarResource = { id?: string; name: string; email: string; building?: string; capacity?: number };
export type AclRule = { scopeType: string; email: string; role: string };
export type CalendarEvent = { summary: string; recurring: boolean };
export type DrivePermission = { email: string; type: "user" | "group"; role: string };
export type ChatSpace = { name: string; displayName: string };
export type ChatMembership = { member: string; type: "HUMAN" | "BOT" | "GROUP" };
export type ClientFile = { path: string; clientId: string; clientSecret: string; projectId: string; desktop: boolean };

export type Project = { projectId: string; projectNumber: string; parent?: string };
export type BillingAccount = { id: string; name: string; open: boolean };
export type FirestoreDb = { locationId: string; type: string; pitr: boolean };
export type ServiceAccount = { email: string; uniqueId: string };
export type CloudService = { url: string; env: Record<string, string>; serviceAccount?: string };
export type DnsRecord = { type: string; name: string; value: string; ttl?: string };
export type DomainMapping = { records: DnsRecord[]; ready: boolean; certificateReady: boolean; message?: string };
export type SchedulerJob = { name: string; schedule: string; timeZone: string; uri: string; audience?: string; serviceAccount?: string; body?: string };
export type Bucket = { name: string; location: string; deleteAfterDays?: number };
export type UptimeCheck = { id: string; displayName: string; host: string; path: string };
export type AlertPolicy = { id: string; displayName: string; channelEmails: string[] };
/** A log-based metric: counts the log lines that match a filter. */
export type LogMetric = { name: string; description: string; filter: string };
/** Cloud Build's link to GitHub. `ready` once the Cloud Build app is authorized and installed; until then `actionUri` is where to do that. */
export type BuildConnection = { ready: boolean; actionUri?: string };
export type BuildTrigger = { name: string; repository: string; branch: string; buildConfig: string; serviceAccount: string; includedFiles: string[]; substitutions: Record<string, string> };
export type Budget = { id: string; displayName: string; amountUsd: number; projects: string[] };

export type DeployRequest = {
  service: string;
  source: string;
  region: string;
  serviceAccount: string;
  env: Record<string, string>;
  secrets: Record<string, string>;
};

/** A license can't be assigned because none are free. */
export class NoFreeLicense extends Error {}

export interface Google {
  // ---- This computer --------------------------------------------------
  tools(): Promise<{ node: string; gcloud: string | null }>;
  gcloudAccount(): Promise<string | null>;
  /** The Desktop OAuth client file: the given path, or ops/go-live/client_secret*.json. */
  findClientFile(explicit?: string): Promise<ClientFile | null>;
  /** Signs the admin in through their browser (loopback, PKCE). The token stays in memory. */
  signIn(client: ClientFile, scopes: string[], domain: string): Promise<{ email: string; name: string }>;
  fetchStatus(url: string): Promise<number>;
  /** Whether Google accepts this redirect URI for the OAuth client (no sign-in needed to check). */
  redirectUriAccepted(clientId: string, redirectUri: string): Promise<boolean>;
  /** Whether the host currently resolves to the record's value. */
  dnsMatches(host: string, record: DnsRecord): Promise<boolean>;

  // ---- Workspace: Directory -------------------------------------------
  getUser(email: string): Promise<User | null>;
  /** A new account with a random password nobody sees; no password change at first sign-in. */
  createUser(u: { email: string; givenName: string; familyName: string; password: string }): Promise<void>;
  getGroup(email: string): Promise<Group | null>;
  createGroup(g: { email: string; name: string; description: string }): Promise<Group>;
  /** A new display name and description for an existing group. Its address never changes. */
  renameGroup(email: string, name: string, description: string): Promise<void>;
  listMembers(group: string): Promise<Member[]>;
  addMember(group: string, m: Member): Promise<void>;
  updateMemberRole(group: string, email: string, role: MemberRole): Promise<void>;
  removeMember(group: string, email: string): Promise<void>;
  getGroupSettings(group: string): Promise<GroupSettings>;
  updateGroupSettings(group: string, s: GroupSettings): Promise<void>;
  listPrivileges(): Promise<Privilege[]>;
  listAdminRoles(): Promise<AdminRole[]>;
  createAdminRole(r: { name: string; description: string; privileges: Privilege[] }): Promise<string>;
  /** User emails that hold the role. */
  listRoleHolders(roleId: string): Promise<string[]>;
  assignAdminRole(roleId: string, userEmail: string): Promise<void>;
  listCalendarResources(): Promise<CalendarResource[]>;

  // ---- Workspace: Licensing -------------------------------------------
  licenseOf(email: string): Promise<License | null>;
  /** Throws NoFreeLicense when the subscription has none left. */
  assignLicense(email: string, license: License): Promise<void>;

  // ---- Workspace: Drive and Sheets ------------------------------------
  findSharedDrive(name: string): Promise<string | null>;
  createSharedDrive(name: string, requestId: string): Promise<string>;
  listDrivePermissions(driveId: string): Promise<DrivePermission[]>;
  addDrivePermission(driveId: string, p: DrivePermission): Promise<void>;
  removeDrivePermission(driveId: string, email: string): Promise<void>;
  findFolder(driveId: string, name: string): Promise<string | null>;
  createFolder(driveId: string, name: string): Promise<string>;
  /** A new Sheet in the admin's Drive with bold frozen headers and dropdowns. */
  createSpreadsheet(title: string, tabs: Tab[]): Promise<{ id: string; url: string }>;
  readSpreadsheet(id: string): Promise<{ title: string; tabs: Record<string, string[][]> }>;
  renameFile(id: string, name: string): Promise<void>;
  appendRows(spreadsheetId: string, tab: string, rows: string[][]): Promise<void>;

  // ---- Workspace: Calendar, Chat, Gmail -------------------------------
  listCalendarAcl(calendarId: string): Promise<AclRule[]>;
  addCalendarWriter(calendarId: string, email: string): Promise<void>;
  listEvents(calendarId: string): Promise<CalendarEvent[]>;
  getSpace(name: string): Promise<ChatSpace | null>;
  createSpace(displayName: string): Promise<string>;
  listSpaceMembers(space: string): Promise<ChatMembership[]>;
  /** `groupId` is the group's Directory ID; Chat names it groups/<id>. */
  addSpaceGroup(space: string, groupId: string): Promise<void>;
  /** Adds the IAR Portal Chat app (users/app). Fails until the app is configured and visible to the admin. */
  addSpaceApp(space: string): Promise<void>;

  // ---- Firestore (REST, with the gcloud token) -------------------------
  getDoc(project: string, path: string): Promise<Record<string, unknown> | null>;
  /** Writes only the named top-level fields; every other field is kept. */
  mergeDoc(project: string, path: string, fields: Record<string, unknown>): Promise<void>;

  // ---- Cloud (gcloud) ---------------------------------------------------
  findOrganization(domain: string): Promise<string | null>;
  getProject(id: string): Promise<Project | null>;
  createProject(id: string, orgId: string, name: string): Promise<Project>;
  listBillingAccounts(): Promise<BillingAccount[]>;
  projectBilling(project: string): Promise<string | null>;
  linkBilling(project: string, account: string): Promise<void>;
  enabledServices(project: string): Promise<string[]>;
  enableServices(project: string, services: string[]): Promise<void>;
  getFirestore(project: string): Promise<FirestoreDb | null>;
  createFirestore(project: string, region: string): Promise<void>;
  enablePitr(project: string): Promise<void>;
  listIndexes(project: string): Promise<FirestoreIndex[]>;
  createIndex(project: string, index: FirestoreIndex): Promise<void>;
  getServiceAccount(email: string): Promise<ServiceAccount | null>;
  createServiceAccount(project: string, name: string, displayName: string): Promise<ServiceAccount>;
  /** "<member>|<role>" for each project-level binding. */
  projectBindings(project: string): Promise<string[]>;
  addProjectBinding(project: string, member: string, role: string): Promise<void>;
  serviceAccountBindings(email: string): Promise<string[]>;
  addServiceAccountBinding(email: string, member: string, role: string): Promise<void>;
  removeServiceAccountBinding(email: string, member: string, role: string): Promise<void>;
  listSecrets(project: string): Promise<string[]>;
  createSecret(project: string, name: string, value: string): Promise<void>;
  /**
   * Tests domain-wide delegation the way the portal uses it: the service
   * account signs a JWT through IAM Credentials (no key) for this user and
   * scope, and Google is asked for a token. Needs the caller to hold Token
   * Creator on the service account.
   */
  testDelegation(serviceAccount: string, subject: string, scope: string): Promise<{ ok: boolean; error?: string }>;
  getService(project: string, region: string, name: string): Promise<CloudService | null>;
  deploy(project: string, req: DeployRequest): Promise<CloudService>;
  /** A new revision with these env vars changed (no rebuild). */
  updateServiceEnv(project: string, region: string, name: string, set: Record<string, string>, remove: string[]): Promise<void>;
  verifiedDomains(): Promise<string[]>;
  getDomainMapping(project: string, region: string, domain: string): Promise<DomainMapping | null>;
  createDomainMapping(project: string, region: string, domain: string, service: string): Promise<DomainMapping>;
  getSchedulerJob(project: string, region: string, name: string): Promise<SchedulerJob | null>;
  putSchedulerJob(project: string, region: string, job: SchedulerJob, kind: "oidc" | "oauth"): Promise<void>;
  getBucket(name: string): Promise<Bucket | null>;
  createBucket(project: string, b: Bucket): Promise<void>;
  bucketBindings(name: string): Promise<string[]>;
  addBucketBinding(name: string, member: string, role: string): Promise<void>;
  listUptimeChecks(project: string): Promise<UptimeCheck[]>;
  createUptimeCheck(project: string, c: Omit<UptimeCheck, "id">): Promise<string>;
  listAlertPolicies(project: string): Promise<AlertPolicy[]>;
  createAlertPolicy(project: string, p: { displayName: string; uptimeCheckId: string; email: string }): Promise<void>;
  listLogMetrics(project: string): Promise<LogMetric[]>;
  createLogMetric(project: string, m: LogMetric): Promise<void>;
  /** Email when a log-based metric counts more than `above` in five minutes. */
  createLogAlertPolicy(project: string, p: { displayName: string; metric: string; above: number; email: string; doc: string }): Promise<void>;
  listBudgets(project: string, billingAccount: string): Promise<Budget[]>;
  createBudget(project: string, billingAccount: string, b: Omit<Budget, "id"> & { email: string }): Promise<void>;
  /** The number of images the cleanup policy keeps, or null when there's none (or no repository yet). */
  imageCleanupKeeps(project: string, region: string, repo: string): Promise<number | null | "no-repo">;
  setImageCleanup(project: string, region: string, repo: string, keep: number): Promise<void>;
  getBuildConnection(project: string, region: string, name: string): Promise<BuildConnection | null>;
  /** Starts the GitHub link; the admin then finishes it at the returned connection's `actionUri`. */
  createBuildConnection(project: string, region: string, name: string): Promise<BuildConnection>;
  /** The GitHub address of a repository linked through the connection, or null. */
  getBuildRepository(project: string, region: string, connection: string, name: string): Promise<string | null>;
  createBuildRepository(project: string, region: string, connection: string, name: string, remoteUri: string): Promise<void>;
  getBuildTrigger(project: string, region: string, name: string): Promise<BuildTrigger | null>;
  createBuildTrigger(project: string, region: string, t: BuildTrigger): Promise<void>;
}
