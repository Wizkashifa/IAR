/**
 * Which policy each form cites, so a form can link to it from the Library
 * when no admin has set a link by hand. Matched by the file's name in the
 * Policies drive; current versions only (never the Archive). Plain functions.
 */
import type { LibraryFile } from "./library-core";

export type PolicyKey = "rooms" | "purchasing" | "catering" | "volunteers";

/** The policy, the forms that cite it, and how its file is named in the drive. */
export const POLICY_LINKS: Record<PolicyKey, { name: string; forms: string[]; match: RegExp }> = {
  rooms: { name: "Room reservation policy", forms: ["/events/new"], match: /\broom (reservation|use|booking)s? polic/i },
  purchasing: { name: "Purchasing and reimbursement policy", forms: ["/purchases/new"], match: /\b(purchas|reimburs)\w* .*polic/i },
  catering: { name: "Food and catering rules", forms: ["/events/new"], match: /\b(food|catering)\b/i },
  volunteers: { name: "Volunteer code of conduct", forms: [], match: /\bvolunteer\b.*\b(code|conduct)\b/i },
};

/** The current file for a policy: a name match outside the Archive, most recently updated first. */
export function policyFile(key: PolicyKey, files: LibraryFile[]): LibraryFile | undefined {
  const { match } = POLICY_LINKS[key];
  return files
    .filter((f) => match.test(f.name) && !/archive/i.test(f.folder) && !/\(\d{4} version\)|\bdraft\b/i.test(f.name))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))[0];
}
