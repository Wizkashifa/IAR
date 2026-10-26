import "server-only";
import { GoogleAuth } from "google-auth-library";

/**
 * Keyless domain-wide delegation: the Cloud Run service account signs a JWT
 * through the IAM Credentials API (no key file to leak), impersonating a
 * Workspace user, and exchanges it for a token with one scope. Group lookups
 * impersonate a read-only directory user; email impersonates the portal's
 * sending mailbox. Setup is in docs/setup.md.
 */

const cache = new Map<string, { token: string; expires: number }>();

async function serviceAccountEmail(auth: GoogleAuth): Promise<string> {
  if (process.env.DIRECTORY_SERVICE_ACCOUNT) return process.env.DIRECTORY_SERVICE_ACCOUNT;
  const creds = await auth.getCredentials();
  if (!creds.client_email) throw new Error("Cannot determine the service account email; set DIRECTORY_SERVICE_ACCOUNT.");
  return creds.client_email;
}

export async function delegatedToken(subject: string, scope: string): Promise<string> {
  const key = `${subject}|${scope}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now() + 60_000) return hit.token;

  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const sa = await serviceAccountEmail(auth);
  const client = await auth.getClient();
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: sa, sub: subject, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };

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
  cache.set(key, { token: body.access_token, expires: Date.now() + body.expires_in * 1000 });
  return body.access_token;
}

/**
 * The service account's own token (no impersonation), for Google Cloud APIs
 * billed to the portal's project, like address suggestions. Also the project,
 * which those APIs want named on each call.
 */
export async function ownToken(): Promise<{ token: string; project: string }> {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const [token, project] = await Promise.all([auth.getAccessToken(), auth.getProjectId()]);
  if (!token) throw new Error("No access token for the portal's service account.");
  return { token, project };
}
