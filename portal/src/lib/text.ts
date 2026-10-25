/** Small text helpers every module uses. */

/** Trimmed and lower-cased, for comparing addresses and group names. */
export const lc = (s: string) => s.trim().toLowerCase();

/** The same address (or group), ignoring case and spaces. Empty never matches. */
export const same = (a?: string, b?: string) => Boolean(a && b && lc(a) === lc(b));

/** "1 reminder", "3 reminders". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Fatima Ahmed" → "FA", for an avatar. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
