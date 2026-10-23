/**
 * The admin signs in through their own browser: go-live listens on
 * 127.0.0.1 for Google to send them back (the loopback flow, with PKCE), with
 * the Desktop client from step 0. The token is kept in memory only, never
 * written to disk, and is gone when go-live ends.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import type { ClientFile } from "./google";

function openBrowser(url: string) {
  // No shell, so the & in the address is passed as is.
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  execFile(cmd, args as string[], () => undefined);
}

const page = (msg: string) => `<!doctype html><meta charset="utf-8"><title>go-live</title><body style="font:16px system-ui;margin:3em">${msg}</body>`;

export async function loopbackSignIn(client: ClientFile, scopes: string[], domain: string, log: (l: string) => void): Promise<{ auth: OAuth2Client; email: string; name: string }> {
  const server = createServer();
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}`;
  const auth = new OAuth2Client({ clientId: client.clientId, clientSecret: client.clientSecret, redirectUri });
  const { codeVerifier, codeChallenge } = await auth.generateCodeVerifierAsync();
  const state = randomBytes(16).toString("hex");
  const url = auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: scopes,
    hd: domain,
    state,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: codeChallenge,
  });

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Nobody finished signing in within 5 minutes."));
    }, 5 * 60_000);
    server.on("request", (req, res) => {
      const q = new URL(req.url ?? "/", redirectUri).searchParams;
      if (!q.has("state") && !q.has("error")) return void res.writeHead(404).end();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      clearTimeout(timer);
      server.close();
      if (q.get("state") !== state) {
        res.end(page("That sign-in didn't come from this go-live run. Close this tab and run go-live again."));
        return reject(new Error("The sign-in reply didn't match (state). Run go-live again."));
      }
      if (q.get("error")) {
        res.end(page("Sign-in was cancelled. You can close this tab."));
        return reject(new Error(`Sign-in didn't finish: ${q.get("error")}`));
      }
      res.end(page("Signed in. You can close this tab and go back to go-live."));
      resolve(q.get("code") ?? "");
    });
    log("  If your browser doesn't open by itself, open this address:");
    log(`  ${url}`);
    openBrowser(url);
  });

  const { tokens } = await auth.getToken({ code, codeVerifier, redirect_uri: redirectUri });
  auth.setCredentials(tokens);
  if (!tokens.id_token) throw new Error("Google didn't say who signed in.");
  const ticket = await auth.verifyIdToken({ idToken: tokens.id_token, audience: client.clientId });
  const p = ticket.getPayload();
  if (!p?.email || !p.email_verified) throw new Error("Google didn't confirm the signed-in address.");
  if (p.hd !== domain) throw new Error(`You signed in as ${p.email}, which isn't an @${domain} Workspace account.`);
  return { auth, email: p.email.toLowerCase(), name: p.name ?? p.email };
}
