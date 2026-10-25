/** What a finance desk batch did, shown once after it runs (see actions.ts `finish`). */
export const RESULT_COOKIE = "finance-desk-result";
export type DeskResult = { key: string; summary: string; tone: "ok" | "warn"; failed: { id: string; message: string }[] };

export function readResult(raw: string | undefined, key: string | undefined): DeskResult | null {
  if (!raw || !key) return null;
  try {
    const r = JSON.parse(raw) as DeskResult;
    return r.key === key ? r : null;
  } catch {
    return null;
  }
}
