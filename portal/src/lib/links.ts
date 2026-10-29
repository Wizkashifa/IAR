/**
 * A path inside the portal, safe to link or redirect to, or null. Rejects
 * "//host" and "/\host", which browsers treat as another site.
 */
export function internalPath(p: string): string | null {
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("\\") || /[\r\n]/.test(p)) return null;
  return p.slice(0, 300);
}

/** Where the "Stop signing in as" buttons post (app/admin/stop-signing-in-as/route.ts, lib/act-as.ts). */
export const STOP_ACT_AS = "/admin/stop-signing-in-as";
