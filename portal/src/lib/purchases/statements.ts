import "server-only";
import type { DocumentSnapshot } from "@google-cloud/firestore";
import { clean, firestore } from "../db";
import { isDevAuth } from "../dev";
import { parseStatement, type Statement, type StatementCard } from "./statement";
import { sampleStatementLines } from "./statement-sample";

/**
 * Imported card statements, one per closing month, at
 * orgs/{orgId}/cardStatements/{YYYY-MM}. Finance uploads the PDF and sees a
 * preview first: the preview is kept as that person's draft
 * (cardStatementDrafts/{email}) until they confirm it, so what's saved is
 * exactly what the server read, never anything sent back by the browser.
 * The PDF itself goes to the PO records Shared Drive.
 *
 * Dev keeps them in memory, starting with a made-up statement for last
 * month that the sample card receipts were made from.
 */
export type ImportedStatement = Statement & {
  importedBy: string;
  importedAt: string;
  fileName: string;
  driveFileId?: string;
};

export interface StatementStore {
  get(month: string): Promise<ImportedStatement | null>;
  /** The most recent first. */
  list(limit?: number): Promise<ImportedStatement[]>;
  save(s: ImportedStatement): Promise<void>;
  getDraft(email: string): Promise<ImportedStatement | null>;
  saveDraft(email: string, s: ImportedStatement): Promise<void>;
  clearDraft(email: string): Promise<void>;
}

/** The charges on one card in an imported statement, if any. */
export function cardOn(s: Pick<Statement, "cards"> | null, last4: string): StatementCard | null {
  return s?.cards.find((c) => c.last4 === last4) ?? null;
}

// ---- Development ----------------------------------------------------------

/** Last month, as the sample card receipts use. */
export function sampleMonth(now = new Date()): string {
  return new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 7);
}

export function sampleStatement(now = new Date()): ImportedStatement {
  const r = parseStatement(sampleStatementLines(sampleMonth(now)));
  if (!r.ok) throw new Error(`Bad sample statement: ${r.errors.join("; ")}`);
  return { ...r.statement, importedBy: "finance@dev.local", importedAt: new Date(now.getTime() - 9 * 864e5).toISOString(), fileName: "Sample statement.pdf" };
}

type Mem = { statements: Map<string, ImportedStatement>; drafts: Map<string, ImportedStatement> };
const g = globalThis as unknown as { __iarStatements?: Mem };
function mem(): Mem {
  if (!g.__iarStatements) {
    const s = sampleStatement();
    g.__iarStatements = { statements: new Map([[s.month, s]]), drafts: new Map() };
  }
  return g.__iarStatements;
}

const memoryStore: StatementStore = {
  async get(month) {
    const s = mem().statements.get(month);
    return s ? structuredClone(s) : null;
  },
  async list(limit = 12) {
    return [...mem().statements.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, limit).map((s) => structuredClone(s));
  },
  async save(s) {
    mem().statements.set(s.month, structuredClone(s));
  },
  async getDraft(email) {
    const s = mem().drafts.get(email.toLowerCase());
    return s ? structuredClone(s) : null;
  },
  async saveDraft(email, s) {
    mem().drafts.set(email.toLowerCase(), structuredClone(s));
  },
  async clearDraft(email) {
    mem().drafts.delete(email.toLowerCase());
  },
};

// ---- Production -----------------------------------------------------------

let fsStore: StatementStore | null = null;
async function getFirestoreStore(): Promise<StatementStore> {
  if (fsStore) return fsStore;
  const { org } = await firestore();
  const col = org.collection("cardStatements");
  const drafts = org.collection("cardStatementDrafts");
  const read = (d: DocumentSnapshot) => (d.exists ? (d.data() as ImportedStatement) : null);
  fsStore = {
    async get(month) {
      return read(await col.doc(month).get());
    },
    async list(limit = 12) {
      const q = await col.orderBy("month", "desc").limit(limit).get();
      return q.docs.map((d) => d.data() as ImportedStatement);
    },
    async save(s) {
      await col.doc(s.month).set(clean(s));
    },
    async getDraft(email) {
      return read(await drafts.doc(email.toLowerCase()).get());
    },
    async saveDraft(email, s) {
      await drafts.doc(email.toLowerCase()).set(clean(s));
    },
    async clearDraft(email) {
      await drafts.doc(email.toLowerCase()).delete();
    },
  };
  return fsStore;
}

export async function statementStore(): Promise<StatementStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}
