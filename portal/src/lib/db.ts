import "server-only";
import type { DocumentReference, Firestore } from "@google-cloud/firestore";
import { ORG } from "./org";

/** One Firestore client per server, and the org document everything hangs off (orgs/{orgId}). */
let handle: { db: Firestore; org: DocumentReference } | null = null;

export async function firestore(): Promise<{ db: Firestore; org: DocumentReference }> {
  if (handle) return handle;
  const { Firestore } = await import("@google-cloud/firestore");
  const db = new Firestore();
  handle = { db, org: db.collection("orgs").doc(ORG.id) };
  return handle;
}

/** Firestore rejects `undefined` fields; drop them before writing. */
export function clean<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
