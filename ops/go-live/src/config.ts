/**
 * The fixed names go-live uses: accounts, service accounts, APIs, scopes,
 * Chat spaces and Shared Drives. No people.
 */
import { ROLE_GROUPS, roleGroup, teamGroup } from "./launch";

export const SERVICE = "iar-portal";
export const RUNTIME_SA = "portal-runtime";
export const SCHEDULER_SA = "portal-scheduler";
export const DAILY_JOB = "portal-daily";
export const BACKUP_JOB = "portal-backup";
export const IMAGE_REPO = "cloud-run-source-deploy";
export const SETTINGS_DOC = "orgs/iar/settings/portal";
export const READER_ROLE = "Portal reader";

export const saEmail = (name: string, project: string) => `${name}@${project}.iam.gserviceaccount.com`;
export const mailbox = (domain: string) => `portal@${domain}`;
export const directoryUser = (domain: string) => `portal-directory@${domain}`;
export const role = (key: string, domain: string) => roleGroup(ROLE_GROUPS.find((g) => g.key === key)!, domain);
export const runUrl = (projectNumber: string, region: string) => `https://${SERVICE}-${projectNumber}.${region}.run.app`;
export const customHost = (domain: string) => `portal.${domain}`;
export const backupBucket = (project: string) => `${project}-firestore-backups`;

/** APIs go-live itself calls with the admin's sign-in. Free to enable; turned on before sign-in. */
export const WORKSPACE_APIS = [
  "admin.googleapis.com", "groupssettings.googleapis.com", "licensing.googleapis.com", "drive.googleapis.com", "sheets.googleapis.com",
  "gmail.googleapis.com", "calendar-json.googleapis.com", "chat.googleapis.com",
];

/** Everything the portal and its running costs need. Cloud Run and Build need billing. */
export const CLOUD_APIS = [
  "run.googleapis.com", "cloudbuild.googleapis.com", "artifactregistry.googleapis.com", "firestore.googleapis.com", "secretmanager.googleapis.com",
  "iam.googleapis.com", "iamcredentials.googleapis.com", "admin.googleapis.com", "drive.googleapis.com", "gmail.googleapis.com", "calendar-json.googleapis.com",
  "chat.googleapis.com", "cloudscheduler.googleapis.com", "monitoring.googleapis.com", "groupssettings.googleapis.com", "sheets.googleapis.com",
  "billingbudgets.googleapis.com", "licensing.googleapis.com", "appsmarket-component.googleapis.com", "storage.googleapis.com",
];

const S = "https://www.googleapis.com/auth/";

/** The admin's sign-in: only what the stages call. */
export const ADMIN_SCOPES = [
  "openid", "email", "profile",
  `${S}admin.directory.user`, `${S}admin.directory.group`, `${S}admin.directory.rolemanagement`, `${S}admin.directory.resource.calendar.readonly`,
  `${S}apps.groups.settings`, `${S}apps.licensing`,
  `${S}drive`, `${S}spreadsheets`,
  `${S}calendar.acls`, `${S}calendar.events.readonly`,
  `${S}chat.spaces.create`, `${S}chat.spaces.readonly`, `${S}chat.memberships`, `${S}chat.memberships.app`,
  `${S}gmail.compose`,
];

/** The portal's one domain-wide delegation entry, and who each scope is used as. */
export const DELEGATION = [
  { scope: `${S}admin.directory.group.readonly`, as: "directory", why: "read who is in each group" },
  { scope: `${S}admin.directory.resource.calendar.readonly`, as: "directory", why: "read the room list" },
  { scope: `${S}admin.directory.user.readonly`, as: "directory", why: "show people's names instead of email addresses" },
  { scope: `${S}gmail.send`, as: "mailbox", why: "send alert emails" },
  { scope: `${S}calendar.events`, as: "mailbox", why: "put room holds on the room calendars" },
] as const;

export const delegationScopes = () => DELEGATION.map((d) => d.scope).join(",");

/** "five scopes", for the delegation steps and messages. */
export const scopeCount = () => {
  const n: number = DELEGATION.length;
  return `${["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"][n] ?? n} scope${n === 1 ? "" : "s"}`;
};

/** One Chat space per role or queue team. `roles` are the Portal Settings keys it serves. */
export type SpaceDef = { key: string; title: string; roles: string[]; group: (domain: string) => string };
export const SPACES: SpaceDef[] = [
  { key: "finance", title: "IAR Portal · Finance", roles: ["finance"], group: (d) => role("finance", d) },
  { key: "office", title: "IAR Portal · Office", roles: ["office"], group: (d) => role("office", d) },
  { key: "executive", title: "IAR Portal · Executive", roles: ["executive"], group: (d) => role("executive", d) },
  { key: "admins", title: "IAR Portal · Admins", roles: ["admins"], group: (d) => role("admins", d) },
  { key: "marketing", title: "IAR Portal · Marketing", roles: ["marketing"], group: (d) => teamGroup("Marketing", d) },
  { key: "it", title: "IAR Portal · IT & A/V", roles: ["it", "av"], group: (d) => teamGroup("IT Services", d) },
  { key: "facilities", title: "IAR Portal · Facilities", roles: ["facilities"], group: (d) => teamGroup("Facility Maintenance", d) },
  { key: "security", title: "IAR Portal · Security", roles: ["security"], group: (d) => teamGroup("Safety & Security", d) },
];

/** Drive roles by the names the Drive screen uses. */
export const DRIVE_ROLE = { manager: "organizer", contentManager: "fileOrganizer", contributor: "writer" } as const;
export const DRIVE_ROLE_NAME: Record<string, string> = { organizer: "Manager", fileOrganizer: "Content manager", writer: "Contributor", commenter: "Commenter", reader: "Viewer" };

export type DriveDef = {
  key: string;
  name: string;
  env: string;
  why: string;
  access: (domain: string, sa: string) => { email: string; type: "user" | "group"; role: string }[];
  /** Take the admin who created it off the drive afterwards (W-9s: finance only). */
  financeOnly?: boolean;
};
export const FOLDER = "Portal files";
export const DRIVES: DriveDef[] = [
  {
    key: "po", name: "PO Records", env: "PO_DRIVE_FOLDER_ID", why: "receipts and invoices for purchase requests",
    access: (d, sa) => [
      { email: sa, type: "user", role: DRIVE_ROLE.contentManager },
      { email: role("finance", d), type: "group", role: DRIVE_ROLE.contentManager },
      { email: role("office", d), type: "group", role: DRIVE_ROLE.contentManager },
    ],
  },
  {
    key: "w9", name: "W-9s", env: "W9_DRIVE_FOLDER_ID", why: "W-9 forms, which only finance may open",
    access: (d, sa) => [
      { email: role("finance", d), type: "group", role: DRIVE_ROLE.manager },
      { email: sa, type: "user", role: DRIVE_ROLE.contributor },
    ],
    financeOnly: true,
  },
  {
    key: "photos", name: "Maintenance Photos", env: "MAINTENANCE_DRIVE_FOLDER_ID", why: "photos attached to IT and maintenance requests",
    access: (d, sa) => [
      { email: teamGroup("Facility Maintenance", d), type: "group", role: DRIVE_ROLE.contributor },
      { email: teamGroup("IT Services", d), type: "group", role: DRIVE_ROLE.contributor },
      { email: role("office", d), type: "group", role: "reader" },
      { email: sa, type: "user", role: DRIVE_ROLE.contributor },
    ],
  },
];

export const console_ = {
  delegation: "https://admin.google.com/ac/owl/domainwidedelegation",
  roles: "https://admin.google.com/ac/roles",
  resources: "https://admin.google.com/ac/calendarresources",
  subscriptions: "https://admin.google.com/ac/billing/subscriptions",
  marketplace: "https://workspace.google.com/marketplace",
  consent: (p: string) => `https://console.cloud.google.com/apis/credentials/consent?project=${p}`,
  credentials: (p: string) => `https://console.cloud.google.com/apis/credentials?project=${p}`,
  client: (p: string, id: string) => `https://console.cloud.google.com/apis/credentials/oauthclient/${id}?project=${p}`,
  chatConfig: (p: string) => `https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=${p}`,
  marketplaceSdk: (p: string) => `https://console.cloud.google.com/apis/api/appsmarket-component.googleapis.com/googleapps_sdk?project=${p}`,
  billing: (p: string) => `https://console.cloud.google.com/billing/linkedaccount?project=${p}`,
  searchConsole: "https://search.google.com/search-console",
};
