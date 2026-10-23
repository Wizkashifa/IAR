/**
 * The Firestore composite indexes the portal needs. go-live creates any that
 * are missing; docs/setup.md §2 lists the same ones. When a module adds a
 * query that needs one, add it here.
 */
export type FirestoreIndex = { collectionGroup: string; fields: { path: string; order: "ASCENDING" | "DESCENDING" }[]; why: string };

export const INDEXES: FirestoreIndex[] = [
  { collectionGroup: "cards", fields: [{ path: "ownerEmail", order: "ASCENDING" }, { path: "updatedAt", order: "DESCENDING" }], why: "My Requests" },
  { collectionGroup: "cards", fields: [{ path: "type", order: "ASCENDING" }, { path: "createdAt", order: "ASCENDING" }], why: "Finance's monthly card-receipts checklist" },
  { collectionGroup: "notifications", fields: [{ path: "to", order: "ASCENDING" }, { path: "at", order: "DESCENDING" }], why: "The notification bell" },
];
