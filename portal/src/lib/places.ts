import "server-only";
import { isDevAuth } from "./dev";
import { ownToken } from "./google";

/**
 * Address suggestions as someone types a mailing address, from Google Maps
 * (Places API), called as the portal's own service account: no API key, in
 * the browser or anywhere else. A failure returns nothing and the person just
 * types the address. Dev mode suggests sample Raleigh addresses.
 */
export type AddressSuggestion = { id: string; text: string };

const PLACES = "https://places.googleapis.com/v1";

const SAMPLES = [
  "808 Atwater St, Raleigh, NC 27607",
  "3104 Fairhill Dr, Raleigh, NC 27612",
  "1200 Industrial Dr, Raleigh, NC 27610",
  "15 Sample St, Raleigh, NC 27606",
  "20 Sample Ln, Cary, NC 27511",
];

async function call<T>(url: string, init: RequestInit & { fieldMask?: string }): Promise<T> {
  const { token, project } = await ownToken();
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "x-goog-user-project": project, "content-type": "application/json", ...(init.fieldMask ? { "x-goog-fieldmask": init.fieldMask } : {}) },
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Up to five US street addresses that start like `q`. `session` groups one person's typing into one billed lookup. */
export async function suggestAddresses(q: string, session: string): Promise<AddressSuggestion[]> {
  const input = q.trim().slice(0, 200);
  if (input.length < 3) return [];
  if (isDevAuth()) return SAMPLES.filter((a) => a.toLowerCase().includes(input.toLowerCase())).map((text) => ({ id: `dev:${text}`, text }));
  try {
    type R = { suggestions?: { placePrediction?: { placeId: string; text?: { text?: string } } }[] };
    const r = await call<R>(`${PLACES}/places:autocomplete`, {
      method: "POST",
      body: JSON.stringify({ input, includedRegionCodes: ["us"], includedPrimaryTypes: ["street_address", "premise", "subpremise"], sessionToken: session }),
    });
    return (r.suggestions ?? [])
      .flatMap((s) => (s.placePrediction?.text?.text ? [{ id: s.placePrediction.placeId, text: s.placePrediction.text.text.replace(/, USA$/, "") }] : []))
      .slice(0, 5);
  } catch (err) {
    console.error("address suggestions failed", err);
    return [];
  }
}

/** The full mailing address of a picked suggestion, with its ZIP code (suggestions leave it out). Null when it can't be read. */
export async function addressOf(id: string, session: string): Promise<string | null> {
  if (id.startsWith("dev:")) return id.slice(4);
  if (!/^[\w-]{10,300}$/.test(id)) return null;
  try {
    const r = await call<{ formattedAddress?: string }>(`${PLACES}/places/${encodeURIComponent(id)}?sessionToken=${encodeURIComponent(session)}`, { method: "GET", fieldMask: "formattedAddress" });
    return r.formattedAddress?.replace(/, USA$/, "") ?? null;
  } catch (err) {
    console.error("address lookup failed", err);
    return null;
  }
}
