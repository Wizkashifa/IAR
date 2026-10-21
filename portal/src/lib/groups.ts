import "server-only";
import { delegatedToken } from "./google";

/**
 * Look up a user's Google Groups through the Admin SDK Directory API,
 * impersonating a Workspace user that can only read groups (see google.ts).
 */
const SCOPE = "https://www.googleapis.com/auth/admin.directory.group.readonly";

async function directoryToken(): Promise<string> {
  const subject = process.env.DIRECTORY_ADMIN_SUBJECT;
  if (!subject) throw new Error("DIRECTORY_ADMIN_SUBJECT is not set.");
  return delegatedToken(subject, SCOPE);
}

/** Direct group memberships of a user (group emails, lowercased). */
export async function lookupGroups(email: string): Promise<string[]> {
  const token = await directoryToken();
  const groups: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://admin.googleapis.com/admin/directory/v1/groups");
    url.searchParams.set("userKey", email);
    url.searchParams.set("maxResults", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Directory lookup failed: ${res.status}`);
    const body = (await res.json()) as { groups?: { email: string }[]; nextPageToken?: string };
    for (const g of body.groups ?? []) groups.push(g.email.toLowerCase());
    pageToken = body.nextPageToken;
  } while (pageToken);
  return groups;
}
