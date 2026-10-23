/**
 * The shapes every stage shares: options from the command line, what is kept
 * in .state.json (IDs only), a planned Change, and the context a stage runs in.
 */
import type { Google } from "./google";
import type { MembersPlan } from "./sheet";

export const STAGE_IDS = [
  "preflight", "sheet", "cloud", "accounts", "delegation", "groups", "chat", "drives", "rooms", "deploy", "settings", "safety", "check", "beta",
] as const;
export type StageId = (typeof STAGE_IDS)[number];

export type Options = {
  apply: boolean;
  template: boolean;
  only?: StageId;
  sync: boolean;
  production: boolean;
  redeploy: boolean;
  sheet?: string;
  project: string;
  region: string;
  domain: string;
  client?: string;
};

/**
 * What go-live remembers between runs: IDs and settings it created, never
 * people. The DNS manager's address is the one exception, and .state.json is
 * gitignored.
 */
export type State = {
  version: 1;
  project?: string;
  projectNumber?: string;
  region?: string;
  billingAccount?: string;
  webClientId?: string;
  sheetId?: string;
  sheetArchivedAt?: string;
  membersAddedAt?: string;
  readerRoleId?: string;
  licensePending?: boolean;
  /** "<unique id>|<scope list>" once the delegation entry was tested. */
  delegationVerified?: string;
  chatAppConfigured?: boolean;
  chatSpaces?: Record<string, string>;
  drives?: Record<string, { driveId: string; folderId: string }>;
  eventsCalendarId?: string;
  serviceUrl?: string;
  /** The address people use: the Cloud Run URL, then the custom domain once it works. */
  portalUrl?: string;
  customDomainLive?: boolean;
  redirectsVerified?: string[];
  dnsManagerEmail?: string;
  dnsDraftId?: string;
  poExecutiveThreshold?: string;
  settingsWrittenAt?: string;
  testersAddedAt?: string;
  production?: boolean;
};

export type ChangeKind = "create" | "update" | "remove" | "manual" | "check";

/** Changes that need their own yes, because they cost money, email people, widen access or remove something. */
export type AskKind = "billing" | "license" | "access" | "email" | "budget" | "remove";

export const ASK_LABEL: Record<AskKind, string> = {
  billing: "costs money",
  license: "costs money",
  access: "widens access",
  email: "may email people",
  budget: "billing setting",
  remove: "removes something",
};

export type Change = {
  kind: ChangeKind;
  /** One line, plain language. */
  text: string;
  /** Extra lines shown under it (instructions for a step done by hand, the exact values). */
  detail?: string[];
  ask?: AskKind;
  /** Saying no to this one stops the run, because later steps need it. */
  required?: boolean;
  /** Does the change. Absent for checks, which only report. */
  run?: (ctx: Ctx) => Promise<void>;
};

export type Ask = {
  kind: "yesno" | "enter" | "text" | "secret";
  question: string;
  /** For a step done by hand: which one, so tests can play the admin's part. */
  step?: string;
};
export type Prompt = (a: Ask) => Promise<string>;
export type Log = (line: string) => void;

export type Ctx = {
  opt: Options;
  g: Google;
  state: State;
  save: () => Promise<void>;
  prompt: Prompt;
  log: Log;
  /** The signed-in super admin. */
  admin?: { email: string; name: string };
  /** The members Sheet, once read and checked. */
  members?: MembersPlan;
  /** Where the repo lives, to find portal/ and docs/. */
  repoRoot: string;
};

export type Stage = {
  id: StageId;
  title: string;
  /** Reads only. Throws Stop when the run can't go on. */
  plan: (ctx: Ctx) => Promise<Change[]>;
  /** Defaults to running each change in order. */
  apply?: (ctx: Ctx, changes: Change[]) => Promise<void>;
  /** A message when the run ends after this stage (the --template Sheet; nothing signed in yet). */
  last?: (ctx: Ctx) => string | null;
};

/** The run can't go on; the message says why and what to do. */
export class Stop extends Error {
  constructor(message: string, readonly lines: string[] = []) {
    super(message);
  }
}
