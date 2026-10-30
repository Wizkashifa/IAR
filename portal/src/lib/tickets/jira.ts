/**
 * The one-time move from Jira: read the CSV that Jira exports ("Export
 * issues → CSV"), turn each open issue into a ticket, and say plainly which
 * rows can't come over and why. Plain functions so they can be tested; the
 * page at /it-maintenance/import previews the result, then saves it.
 *
 * - Re-importing is safe: issues whose Jira key is already on a ticket are
 *   skipped.
 * - Done, resolved and closed issues are skipped unless asked for.
 * - People: Jira usually exports names, not emails. An assignee or reporter
 *   is only matched by an @domain email (the assignee must also be on the
 *   team's Google Group); otherwise the name goes in the history, the ticket
 *   is left unassigned, and whoever imports it is its reporter of record.
 * - Jira repeats a column for each value (several "Labels", "Watchers",
 *   "Comment" columns); every value is kept.
 */

import { TIME_ZONE } from "../dates";
import { ORG } from "../org";
import { LOCATIONS, UNKNOWN_LOCATION } from "./locations";
import { type TicketDetails, type TicketKind, type TicketStatus, type TicketTeam, type Urgency, TEAM_NAME } from "./types";
import { type TicketCard, searchTextFor, statusFor, waitingOnFor } from "./workflow";
import type { HistoryEntry } from "../workflow-core";
import { lc } from "../text";

// ---- CSV ---------------------------------------------------------------------

/**
 * Split CSV text into rows of fields: commas, double quotes ("" inside quotes
 * is one quote), and commas and line breaks inside quoted fields. Blank lines
 * are dropped.
 */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(field);
    field = "";
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r" || ch === "\n") {
      endRow();
      i += ch === "\r" && s[i + 1] === "\n" ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

/** One issue: every value under each column name (lowercased), in column order. */
export type JiraRow = { row: number; values: Map<string, string[]> };

const norm = (h: string) => lc(h).replace(/\s+/g, " ");

/** The CSV as Jira rows. Needs at least "Issue key" and "Summary" columns. */
export function readJiraCsv(text: string): { ok: true; rows: JiraRow[]; columns: string[] } | { ok: false; error: string } {
  const all = parseCsv(text);
  if (all.length === 0) return { ok: false, error: "The file is empty." };
  const headers = all[0].map(norm);
  if (!headers.includes("issue key") || !headers.includes("summary"))
    return { ok: false, error: "This doesn't look like a Jira export: it needs “Issue key” and “Summary” columns. In Jira, use Export → Export CSV (all fields)." };
  const rows = all.slice(1).map((cells, i) => {
    const values = new Map<string, string[]>();
    headers.forEach((h, c) => {
      const v = (cells[c] ?? "").trim();
      if (!values.has(h)) values.set(h, []);
      if (v) values.get(h)!.push(v);
    });
    // Row 1 is the header, as a spreadsheet shows it.
    return { row: i + 2, values };
  });
  return { ok: true, rows, columns: [...new Set(headers)] };
}

const first = (r: JiraRow, ...names: string[]) => names.map((n) => r.values.get(n)?.[0]).find(Boolean) ?? "";
const every = (r: JiraRow, ...names: string[]) => names.flatMap((n) => r.values.get(n) ?? []);
/** Values of columns whose name matches, e.g. "Custom field (Location)". */
const matching = (r: JiraRow, re: RegExp) => [...r.values.entries()].filter(([k]) => re.test(k)).flatMap(([, v]) => v);

// ---- Values --------------------------------------------------------------------

/** Jira's status in portal terms: a ticket status, "done" (skipped unless asked), or null when unknown. */
export function jiraStatus(raw: string): Exclude<TicketStatus, "assigned" | "resolved" | "reopened" | "closed" | "cancelled"> | "done" | null {
  const s = norm(raw);
  if (["to do", "todo", "open", "new", "backlog", "selected for development", "reopened"].includes(s)) return "new";
  if (["in progress", "in-progress", "doing", "in review", "review", "work in progress"].includes(s)) return "in_progress";
  if (s.startsWith("waiting") || ["blocked", "on hold", "pending", "parts ordered"].includes(s)) return "waiting_parts";
  if (["done", "resolved", "closed", "complete", "completed", "cancelled", "canceled", "won't do", "wont do", "declined"].includes(s)) return "done";
  return null;
}

/** Jira's priority as urgency; unknown or blank is normal. */
export function jiraUrgency(raw: string): { urgency: Urgency; known: boolean } {
  const s = norm(raw);
  if (["highest", "blocker", "critical", "urgent"].includes(s)) return { urgency: "urgent", known: true };
  if (["high", "major"].includes(s)) return { urgency: "high", known: true };
  if (["medium", "normal", ""].includes(s)) return { urgency: "normal", known: true };
  if (["low", "lowest", "minor", "trivial"].includes(s)) return { urgency: "low", known: true };
  return { urgency: "normal", known: false };
}

const IT_WORDS = new Set(["it", "av", "tech", "technology", "network", "wifi", "internet", "computer", "computers", "laptop", "printer", "printers", "email", "software", "website", "projector", "audio", "sound", "camera", "cameras"]);

/** IT when a component or label says so (IT, A/V, Wi-Fi, printers…); facilities otherwise. */
export function jiraTeam(componentsAndLabels: string[]): TicketTeam {
  const words = (v: string) => v.toLowerCase().replace(/a\/v/g, "av").replace(/wi-fi/g, "wifi").split(/[^a-z0-9]+/);
  return componentsAndLabels.some((v) => words(v).some((w) => IT_WORDS.has(w))) ? "it" : "facilities";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A wall-clock time in Raleigh as an ISO instant. */
function easternIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const wall = new Date(guess).toLocaleString("en-US", { timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const m = wall.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+)/);
  if (!m) return new Date(guess).toISOString();
  const shown = Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), Number(m[4]) % 24, Number(m[5]));
  return new Date(guess + (guess - shown)).toISOString();
}

/**
 * Jira's dates: "23/Oct/26 10:15 AM" (its default), "23/Oct/2026", or
 * "2026-10-23 10:15". Times are Raleigh time. Returns the day and the instant.
 */
export function parseJiraDate(raw: string): { day: string; iso: string } | null {
  const s = raw.trim();
  let y: number, mo: number, d: number, h = 12, mi = 0;
  let m = s.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?$/);
  if (m) {
    d = Number(m[1]);
    mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    if (m[4]) {
      h = Number(m[4]) % 12 + (m[6] && m[6].toLowerCase() === "pm" ? 12 : 0);
      if (!m[6]) h = Number(m[4]);
      mi = Number(m[5]);
    }
  } else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/))) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
    if (m[4]) {
      h = Number(m[4]);
      mi = Number(m[5]);
    }
  } else return null;
  if (mo < 1 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const day = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (!new Date(`${day}T12:00:00Z`).toISOString().startsWith(day)) return null;
  return { day, iso: easternIso(y, mo, d, h, mi) };
}

const EMAIL = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/;
const atDomain = (v: string, domain: string) => EMAIL.test(v) && v.toLowerCase().endsWith(`@${domain.toLowerCase()}`);

const cut = (s: string, max: number, tail: string) => (s.length > max ? `${s.slice(0, max - tail.length - 1).trimEnd()}…${tail}` : s);

// ---- Rows to tickets -------------------------------------------------------------

export type JiraContext = {
  domain: string;
  importer: { email: string; name: string };
  /** Each team's Google Group members, by email: only they can be assignees. */
  members: Record<TicketTeam, string[]>;
  /** Jira keys already on tickets. */
  existingKeys: Set<string>;
  /** Also bring over done issues, as closed tickets (for the record). */
  includeDone: boolean;
  now: string;
};

export type PlannedTicket = { row: number; key: string; card: TicketCard };

export type JiraPlan = {
  ready: PlannedTicket[];
  alreadyImported: { row: number; key: string; title: string }[];
  skippedDone: { row: number; key: string; title: string; status: string }[];
  /** Rows that can't be brought over, and why. */
  problems: { row: number; key?: string; reason: string }[];
  /** People named in Jira who couldn't be matched to an @domain email: their tickets are left unassigned. */
  unmatchedPeople: string[];
};

const KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

/** One Jira row as a ticket, or the reason it can't be. */
export function ticketFromJira(r: JiraRow, ctx: JiraContext): { ok: true; key: string; card: TicketCard; unmatched: string[] } | { ok: false; key?: string; reason: string; done?: string } {
  const key = first(r, "issue key").toUpperCase();
  if (!KEY.test(key)) return { ok: false, reason: key ? `“${key}” isn't a Jira issue key.` : "No issue key." };
  const title = first(r, "summary").replace(/\s+/g, " ");
  if (!title) return { ok: false, key, reason: "No summary." };
  const type = norm(first(r, "issue type"));
  if (type === "epic") return { ok: false, key, reason: "Epics are group headings in Jira; they aren't brought over. Their issues are." };

  const statusRaw = first(r, "status");
  const mapped = jiraStatus(statusRaw);
  if (mapped === null) return { ok: false, key, reason: statusRaw ? `Status “${statusRaw}” doesn't match a portal status (new, in progress, waiting on parts, done).` : "No status." };
  if (mapped === "done" && !ctx.includeDone) return { ok: false, key, reason: "Already done in Jira.", done: statusRaw };

  const team = jiraTeam([...every(r, "component/s", "components", "component"), ...every(r, "labels", "label")]);
  const kind: TicketKind = "request";
  const pr = jiraUrgency(first(r, "priority"));
  const created = parseJiraDate(first(r, "created"));
  const resolvedOn = parseJiraDate(first(r, "resolved"));
  const due = parseJiraDate(first(r, "due date", "due"));
  const labels = [...new Set(every(r, "labels", "label").map((l) => l.toLowerCase()))];
  const unmatched: string[] = [];
  const notes: string[] = [`Jira status: ${statusRaw}`];

  // Reporter: their @domain email, or the importer stands in with the name kept.
  const reporterRaw = first(r, "reporter email", "reporter");
  const reporterIsEmail = atDomain(reporterRaw, ctx.domain);
  const ownerEmail = reporterIsEmail ? reporterRaw.toLowerCase() : ctx.importer.email.toLowerCase();
  const reporterName = reporterIsEmail ? reporterRaw.toLowerCase() : reporterRaw || ctx.importer.name;
  if (!reporterIsEmail && reporterRaw && !EMAIL.test(reporterRaw)) unmatched.push(reporterRaw);

  // Assignee: only by @domain email, and only someone on the team's Google Group.
  const assigneeRaw = first(r, "assignee email", "assignee");
  let assigneeEmail: string | undefined;
  if (assigneeRaw) {
    if (atDomain(assigneeRaw, ctx.domain) && ctx.members[team].includes(assigneeRaw.toLowerCase())) assigneeEmail = assigneeRaw.toLowerCase();
    else if (atDomain(assigneeRaw, ctx.domain)) notes.push(`Assigned in Jira to ${assigneeRaw}, who isn't on the ${TEAM_NAME[team]} Google Group, so it's unassigned here.`);
    else {
      notes.push(`Assigned in Jira to ${assigneeRaw}. Pick who has it now.`);
      if (!EMAIL.test(assigneeRaw)) unmatched.push(assigneeRaw);
    }
  }
  if (!pr.known) notes.push(`Jira priority: ${first(r, "priority")}`);
  if (labels.length) notes.push(`Labels: ${labels.join(", ")}`);
  const components = every(r, "component/s", "components", "component");
  if (components.length) notes.push(`Component: ${components.join(", ")}`);

  const watchers = new Set<string>([ownerEmail]);
  for (const w of every(r, "watchers", "watcher", "watcher email")) {
    if (atDomain(w, ctx.domain)) watchers.add(w.toLowerCase());
  }
  if (assigneeEmail) watchers.add(assigneeEmail);

  const status: TicketStatus = mapped === "done" ? "closed" : mapped === "new" && assigneeEmail ? "assigned" : mapped;
  const createdAt = created?.iso ?? ctx.now;
  const where = first(r, "location", "room") || matching(r, /^custom field \((location|room|area|building)\)$/)[0] || "";
  const room = LOCATIONS.find((l) => l.toLowerCase() === where.toLowerCase()) ?? (where ? cut(where, 120, "") : UNKNOWN_LOCATION);
  const equipment = first(r, "equipment", "asset") || matching(r, /^custom field \((equipment|asset)\)$/)[0] || undefined;

  const history: HistoryEntry[] = [
    { at: createdAt, by: "Jira", action: `Reported in Jira by ${reporterRaw || "someone"}` },
    ...every(r, "comment", "comments").map((c) => jiraComment(c, createdAt)),
    { at: ctx.now, by: ctx.importer.email.toLowerCase(), action: `Imported from Jira (${key})`, note: notes.join("\n") },
  ].sort((a, b) => a.at.localeCompare(b.at));

  const t: TicketDetails = {
    team,
    kind,
    status,
    statusSince: ctx.now,
    room,
    equipment: equipment ? cut(equipment, 120, "") : undefined,
    urgency: pr.urgency,
    description: cut(first(r, "description") || title, 5000, " (cut short; the full text is in Jira)"),
    reporterName,
    photos: [],
    assigneeEmail,
    watchers: [...watchers],
    history,
    dueDate: due?.day,
    jiraKey: key,
    labels: labels.length ? labels : undefined,
    ...(status === "closed" ? { resolvedAt: resolvedOn?.iso ?? ctx.now, closedAt: resolvedOn?.iso ?? ctx.now, resolutionNote: first(r, "resolution") || "Done in Jira" } : {}),
  };
  const card: TicketCard = {
    id: "",
    orgId: ORG.id,
    type: "ticket",
    title: cut(title, 120, ""),
    status: statusFor(status),
    ownerEmail,
    committee: TEAM_NAME[team],
    createdAt,
    updatedAt: ctx.now,
    ticket: t,
  };
  card.waitingOn = waitingOnFor(card);
  card.searchText = searchTextFor(t);
  return { ok: true, key, card, unmatched };
}

/** A Jira comment cell ("23/Oct/26 10:15 AM;<author id>;text") as a history entry. */
function jiraComment(cell: string, fallbackAt: string): HistoryEntry {
  const m = cell.match(/^([^;]+);([^;]*);([\s\S]*)$/);
  const at = m ? parseJiraDate(m[1]) : null;
  if (m && at) return { at: at.iso, by: "Jira", action: "Comment in Jira", note: cut(m[3].trim(), 2000, "") };
  return { at: fallbackAt, by: "Jira", action: "Comment in Jira", note: cut(cell, 2000, "") };
}

/** What importing this file would do: tickets ready to create, and every row that won't be, with the reason. */
export function planJiraImport(text: string, ctx: JiraContext): { ok: true; plan: JiraPlan } | { ok: false; error: string } {
  const sheet = readJiraCsv(text);
  if (!sheet.ok) return sheet;
  const plan: JiraPlan = { ready: [], alreadyImported: [], skippedDone: [], problems: [], unmatchedPeople: [] };
  const seen = new Set<string>();
  const people = new Set<string>();
  for (const r of sheet.rows) {
    const out = ticketFromJira(r, ctx);
    if (!out.ok) {
      if (out.done !== undefined) plan.skippedDone.push({ row: r.row, key: out.key!, title: first(r, "summary"), status: out.done });
      else plan.problems.push({ row: r.row, key: out.key, reason: out.reason });
      continue;
    }
    if (seen.has(out.key)) {
      plan.problems.push({ row: r.row, key: out.key, reason: "This issue is in the file twice; only the first row is used." });
      continue;
    }
    seen.add(out.key);
    if (ctx.existingKeys.has(out.key)) {
      plan.alreadyImported.push({ row: r.row, key: out.key, title: out.card.title });
      continue;
    }
    out.unmatched.forEach((p) => people.add(p));
    plan.ready.push({ row: r.row, key: out.key, card: out.card });
  }
  plan.unmatchedPeople = [...people].sort();
  return { ok: true, plan };
}

/** How many tickets of each status and team the plan would create, for the preview. */
export function planCounts(plan: JiraPlan): { status: Partial<Record<TicketStatus, number>>; team: Partial<Record<TicketTeam, number>> } {
  const status: Partial<Record<TicketStatus, number>> = {};
  const team: Partial<Record<TicketTeam, number>> = {};
  for (const p of plan.ready) {
    status[p.card.ticket.status] = (status[p.card.ticket.status] ?? 0) + 1;
    team[p.card.ticket.team] = (team[p.card.ticket.team] ?? 0) + 1;
  }
  return { status, team };
}
