/**
 * Marketing request types and their questions, worded as on today's
 * Marketing/Multimedia/AV Request Form (see "Marketing questions" in
 * docs/plan.md), and the checks on what a requester types. Plain functions
 * so they can be tested; the form page and server actions both use them.
 */
import { MARKETING_KINDS, type MarketingKind } from "./types";
import { daysBetween, isDate } from "../dates";

export type FieldKind = "textarea" | "date" | "url" | "text" | "radio";

export type MarketingField = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** An example answer, shown above the box. */
  example?: string;
  hint?: string;
  placeholder?: string;
  /** Shown side by side with the next half field. */
  half?: boolean;
  options?: { value: string; label: string }[];
  /** Extra check: a redirect's own address must be on one of IAR's domains. */
  redirectFrom?: boolean;
};

export type MarketingType = { label: string; blurb: string; note?: string; fields: MarketingField[] };

const DUE_HINT = "Marketing takes 1–2 weeks. Give at least 2 weeks if you can.";

export const ANNOUNCE_EXAMPLE =
  "Girls ages 5-13 are invited to join our Saturday Girls' Program starting on September 10th. This program offers fun activities, great company and Islamic reminders. Join us on Saturdays from 2:00 - 4:30. Registration is required!";

/** Domains a custom redirect can live on. */
export const REDIRECT_DOMAINS = ["raleighmasjid.org", "islam1.org", "iar.to"];

export const MARKETING_TYPES: Record<MarketingKind, MarketingType> = {
  graphic: {
    label: "Graphic design",
    blurb: "A sign, certificate, shirt, table cover, infographic, backdrop or logo.",
    fields: [
      { key: "desc", label: "Describe the design in detail", kind: "textarea", required: true, hint: "Link any examples that help, or add them under Files." },
      { key: "due", label: "When is this design needed by?", kind: "date", required: true, hint: DUE_HINT },
    ],
  },
  signage: {
    label: "Physical signage",
    blurb: "Signs for the building: directions, room names, notices.",
    fields: [
      { key: "desc", label: "Describe the request", kind: "textarea", required: true },
      { key: "due", label: "When does this need to be sent by?", kind: "date", required: true, hint: DUE_HINT },
    ],
  },
  announce: {
    label: "Announcement or community update",
    blurb: "A notice for the newsletter, website, social media or after prayers.",
    fields: [
      { key: "text", label: "Suggested announcement text to publish", kind: "textarea", required: true, example: `Example: ${ANNOUNCE_EXAMPLE}`, hint: "IAR Marketing may edit it for clarity, grammar and professionalism." },
      { key: "due", label: "When does this need to be published by?", kind: "date", required: true },
    ],
  },
  highlight: {
    label: "Highlight an event, accomplishment or team member",
    blurb: "Share something that already happened with the community.",
    fields: [
      { key: "desc", label: "Share the details of the event, accomplishment or team member(s) you'd like to highlight.", kind: "textarea", required: true },
      { key: "due", label: "When does this need to be posted by?", kind: "date", required: true },
    ],
  },
  webpage: {
    label: "New webpage",
    blurb: "Create or design a new page on the IAR website.",
    fields: [{ key: "desc", label: "Share all the details of the webpage you need.", kind: "textarea", required: true }],
  },
  webedit: {
    label: "Small website update",
    blurb: "A change to a page that already exists.",
    fields: [
      { key: "url", label: "Link to the page you want changed", kind: "url", required: true, placeholder: "https://raleighmasjid.org/…" },
      { key: "desc", label: "Describe the change", kind: "textarea", required: true },
    ],
  },
  redirect: {
    label: "Custom short link or redirect",
    blurb: "A short address that sends people to a page or form, like raleighmasjid.org/po.",
    note: "For a quick short link, enter your link at iar.to/new: you'll get an email with the short link and a QR code within seconds. Use this request for a custom redirect.",
    fields: [
      { key: "from", label: "Link to redirect from", kind: "text", required: true, placeholder: "raleighmasjid.org/post", hint: "Valid domains: raleighmasjid.org, islam1.org or iar.to", redirectFrom: true },
      { key: "to", label: "Link to send people to", kind: "url", required: true, placeholder: "https://forms.gle/…" },
    ],
  },
  badge: {
    label: "Staff badge",
    blurb: "A name badge for IAR staff.",
    fields: [
      { key: "first", label: "First name on badge", kind: "text", required: true, half: true },
      { key: "last", label: "Last name on badge", kind: "text", required: true, half: true },
      { key: "title", label: "Staff title on badge", kind: "text" },
      {
        key: "photo",
        label: "Would you like your badge picture taken at IAR?",
        kind: "radio",
        required: true,
        options: [
          { value: "onsite", label: "Yes, take my picture at IAR" },
          { value: "mine", label: "I already have a picture I'd like to use" },
          { value: "none", label: "I don't want my picture on my badge" },
        ],
      },
    ],
  },
  custom: {
    label: "Something else",
    blurb: "Any other request or project for marketing or multimedia.",
    fields: [{ key: "desc", label: "Share all the details of your request.", kind: "textarea", required: true }],
  },
};

/** Types that ask for comments: the rest have an open question for everything, so a second box would repeat it. */
export const NOTES_KINDS: MarketingKind[] = ["redirect", "badge"];
export const asksForNotes = (kind: MarketingKind) => NOTES_KINDS.includes(kind);

/**
 * A request's Google Drive link. Highlight requests sent before the form had
 * one Files section kept theirs as an answer ("media").
 */
export const driveLinkOf = (m: { kind: MarketingKind; answers: Record<string, string>; driveLink?: string }): string | undefined =>
  m.driveLink || (m.kind === "highlight" ? m.answers.media : undefined) || undefined;

export const isMarketingKind = (k: unknown): k is MarketingKind => typeof k === "string" && (MARKETING_KINDS as readonly string[]).includes(k);

/** Marketing usually takes 1–2 weeks; a request needed sooner than this gets a warning. */
export const LEAD_DAYS = 14;

const MAX: Record<FieldKind, number> = { textarea: 5000, text: 200, url: 500, date: 10, radio: 20 };
export const NOTES_MAX = 2000;

/** A web link people can open: http(s) with a real-looking host. */
export function isWebLink(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") && !/\s/.test(s);
  } catch {
    return false;
  }
}

/**
 * A redirect's own address, normalized to "raleighmasjid.org/post", or null
 * if it isn't on one of IAR's domains or has no path after the domain.
 */
export function redirectSource(raw: string): string | null {
  const s = raw.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const m = s.match(/^([a-z0-9.-]+)(\/[^\s]*)$/i);
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (!REDIRECT_DOMAINS.includes(host)) return null;
  const path = m[2].replace(/\/+$/, "");
  if (!path || path === "/") return null;
  return `${host}${path}`;
}

/** What the form sends. */
export type MarketingInput = {
  kind: string;
  answers: Record<string, string>;
  committee: string;
  driveLink?: string;
  notes?: string;
};

export type ParsedMarketing = {
  kind: MarketingKind;
  answers: Record<string, string>;
  committee: string;
  driveLink?: string;
  notes?: string;
};

export type ParseResult = { ok: true; details: ParsedMarketing } | { ok: false; errors: string[] };

/**
 * Check a request: the type's required questions, dates not in the past,
 * links that open, a redirect on IAR's domains, and a committee the person
 * may request for. `today` is YYYY-MM-DD in Raleigh. Answers to questions
 * the type doesn't ask are dropped.
 */
export function parseMarketingInput(raw: MarketingInput, ctx: { today: string; committees: string[] }): ParseResult {
  const errors: string[] = [];
  if (!isMarketingKind(raw.kind)) return { ok: false, errors: ["Pick what kind of request this is."] };
  const t = MARKETING_TYPES[raw.kind];
  const answers: Record<string, string> = {};

  for (const f of t.fields) {
    const v = String(raw.answers?.[f.key] ?? "").trim();
    if (!v) {
      if (f.required) errors.push(`Please answer: ${f.label}`);
      continue;
    }
    if (v.length > MAX[f.kind]) {
      errors.push(`Keep this shorter (${MAX[f.kind].toLocaleString()} characters at most): ${f.label}`);
      continue;
    }
    if (f.kind === "date") {
      if (!isDate(v)) errors.push(`Pick a date: ${f.label}`);
      else if (v < ctx.today) errors.push(`That date has already passed: ${f.label}`);
      else if (daysBetween(ctx.today, v) > 730) errors.push(`Pick a date within the next two years: ${f.label}`);
      else answers[f.key] = v;
      continue;
    }
    if (f.kind === "url") {
      if (!isWebLink(v)) errors.push(`Enter a full link starting with https:// — ${f.label}`);
      else answers[f.key] = v;
      continue;
    }
    if (f.kind === "radio") {
      if (!f.options?.some((o) => o.value === v)) errors.push(`Pick one: ${f.label}`);
      else answers[f.key] = v;
      continue;
    }
    if (f.redirectFrom) {
      const src = redirectSource(v);
      if (!src) errors.push(`The link to redirect from must be on raleighmasjid.org, islam1.org or iar.to, with something after the domain (like raleighmasjid.org/post).`);
      else answers[f.key] = src;
      continue;
    }
    answers[f.key] = f.kind === "text" ? v.replace(/\s+/g, " ") : v;
  }

  if (raw.kind === "redirect" && answers.from && answers.to) {
    const dest = answers.to.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
    if (dest === answers.from.toLowerCase()) errors.push("The redirect can't send people to the same address.");
  }

  const committee = String(raw.committee ?? "").trim();
  if (!committee) errors.push("Pick the committee or team this is for.");
  else if (!ctx.committees.includes(committee)) errors.push("Pick one of your committees or teams.");

  const driveLink = String(raw.driveLink ?? "").trim();
  if (driveLink && (!isWebLink(driveLink) || driveLink.length > MAX.url)) errors.push("The Google Drive link should be a full link starting with https://");

  const notes = String(raw.notes ?? "").trim();
  if (notes.length > NOTES_MAX) errors.push(`Keep comments under ${NOTES_MAX.toLocaleString()} characters.`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    details: { kind: raw.kind, answers, committee, ...(driveLink ? { driveLink } : {}), ...(notes ? { notes } : {}) },
  };
}

/** When the requester needs it by (YYYY-MM-DD), if the type asks. */
export const neededBy = (answers: Record<string, string>): string | undefined => answers.due || undefined;

const short = (t: string | undefined, max = 60) => {
  const s = String(t ?? "").trim().replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** The request's title, from its answers. */
export function titleFor(kind: MarketingKind, answers: Record<string, string>): string {
  if (kind === "badge") return `Staff badge: ${answers.first ?? ""} ${answers.last ?? ""}`.trim();
  if (kind === "redirect") return `Redirect ${answers.from ?? ""}`.trim();
  if (kind === "webedit") return `Website update: ${short(answers.desc)}`;
  return short(answers.desc || answers.text) || MARKETING_TYPES[kind].label;
}

/** An answer as the request page shows it: the option's words for a choice. */
export function answerText(f: MarketingField, v: string | undefined): string {
  if (!v) return "";
  if (f.kind === "radio") return f.options?.find((o) => o.value === v)?.label ?? v;
  return v;
}
