import "server-only";
import { GoogleAuth } from "google-auth-library";

/**
 * Look up a user's Google Groups through the Admin SDK Directory API.
 *
 * Keyless domain-wide delegation: the Cloud Run service account signs a JWT
 * through the IAM Credentials API (no key file to leak), impersonating a
 * Workspace admin, and exchanges it for a token scoped to read-only group
 * membership. Setup is in docs/setup.md.
 */
const SCOPE = "https://www.googleapis.com/auth/admin.directory.group.readonly";

let cached: { token: string; expires: number } | null = null;

async function serviceAccountEmail(auth: GoogleAuth): Promise<string> {
  if (process.env.DIRECTORY_SERVICE_ACCOUNT) return process.env.DIRECTORY_SERVICE_ACCOUNT;
  const creds = await auth.getCredentials();
  if (!creds.client_email) throw new Error("Cannot determine the service account email; set DIRECTORY_SERVICE_ACCOUNT.");
  return creds.client_email;
}

async function directoryToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const subject = process.env.DIRECTORY_ADMIN_SUBJECT;
  if (!subject) throw new Error("DIRECTORY_ADMIN_SUBJECT is not set.");

  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const sa = await serviceAccountEmail(auth);
  const client = await auth.getClient();
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: sa, sub: subject, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };

  const signed = await client.request<{ signedJwt: string }>({
    url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(sa)}:signJwt`,
    method: "POST",
    data: { payload: JSON.stringify(claims) },
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signed.data.signedJwt,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return body.access_token;
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
