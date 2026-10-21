/**
 * A path inside the portal, safe to link or redirect to, or null. Rejects
 * "//host" and "/\host", which browsers treat as another site.
 */
export function internalPath(p: string): string | null {
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("\\") || /[\r\n]/.test(p)) return null;
  return p.slice(0, 300);
}
