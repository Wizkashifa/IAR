"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/viewer";
import { deliver } from "@/lib/notifications";
import { purchaseContext } from "@/lib/purchases/settings";
import { saveStatementPdf } from "@/lib/purchases/drive";
import { statementNotices } from "@/lib/purchases/notices";
import { matchCards, parseStatement } from "@/lib/purchases/statement";
import { StatementFileError, statementLines } from "@/lib/purchases/statement-pdf";
import { statementStore, type ImportedStatement } from "@/lib/purchases/statements";
import { receiptsSentForMonth } from "@/lib/purchases/statement-context";

export type StatementPreview = {
  month: string;
  closingDate: string;
  total: number;
  /** A statement for this month is already in; this one replaces it. */
  replacing: boolean;
  cards: { last4: string; nameOnStatement: string; holder: string | null; charges: number; total: number }[];
  /** Cards in Portal Settings with no charges this month. */
  quiet: { last4: string; holder: string }[];
};

export type StatementState =
  | { stage: "start"; errors?: string[] }
  | { stage: "preview"; preview: StatementPreview }
  | { stage: "done"; month: string; told: number; unknown: number };

const MAX_BYTES = 10 * 1024 * 1024;

/** Finance only (as themselves: a portal admin can look, not import); anyone else gets nothing back. */
async function financeViewer() {
  const viewer = await requireViewer();
  return viewer.actingRoles.includes("finance") ? viewer : null;
}

/** Requests already sent from this month's statement: then it can't be replaced. */
async function startedFrom(month: string): Promise<string | null> {
  const sent = await receiptsSentForMonth(month);
  return sent.length ? `Card receipts have already been sent from the statement for this month (${sent.map((c) => c.id).join(", ")}), so it can't be replaced. If the statement really changed, ask a portal admin for help.` : null;
}

/** Read the uploaded PDF and show what it holds. Nothing reaches cardholders until it's confirmed. */
async function previewStatement(_prev: StatementState, form: FormData): Promise<StatementState> {
  const viewer = await financeViewer();
  if (!viewer) return { stage: "start", errors: ["Only the finance office can upload card statements."] };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { stage: "start", errors: ["Choose the statement PDF first."] };
  if (!/\.pdf$/i.test(file.name)) return { stage: "start", errors: [`${file.name} isn't a PDF. Upload the statement as Truist gives it, a PDF.`] };
  if (file.size > MAX_BYTES) return { stage: "start", errors: [`${file.name} is over 10 MB, too big for a card statement.`] };

  let lines: string[];
  try {
    lines = await statementLines(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    console.error("statement read failed", err);
    return { stage: "start", errors: [err instanceof StatementFileError ? err.message : "That file couldn't be read. Download the statement from Truist again and upload that."] };
  }
  const parsed = parseStatement(lines);
  if (!parsed.ok) return { stage: "start", errors: parsed.errors.length === 1 ? [`Nothing was imported: ${parsed.errors[0]}`] : parsed.errors };
  const s = parsed.statement;

  const blocked = await startedFrom(s.month);
  if (blocked) return { stage: "start", errors: [blocked] };

  let driveFileId: string | undefined;
  try {
    driveFileId = await saveStatementPdf(s.month, file);
  } catch (err) {
    console.error("statement upload failed", err);
    return { stage: "start", errors: ["The statement couldn't be saved to the finance Shared Drive, so nothing was imported. Try again in a minute."] };
  }
  const store = await statementStore();
  const draft: ImportedStatement = { ...s, importedBy: viewer.email, importedAt: new Date().toISOString(), fileName: file.name, ...(driveFileId ? { driveFileId } : {}) };
  await store.saveDraft(viewer.email, draft);

  const ctx = await purchaseContext();
  const m = matchCards(s, ctx.cards);
  return {
    stage: "preview",
    preview: {
      month: s.month,
      closingDate: s.closingDate,
      total: s.total,
      replacing: Boolean(await store.get(s.month)),
      cards: s.cards.map((c) => {
        const held = m.matched.find((x) => x.statement.last4 === c.last4)?.card;
        return { last4: c.last4, nameOnStatement: c.holderName, holder: held ? held.holderName : null, charges: c.charges.length, total: c.total };
      }),
      quiet: m.notOnStatement.map((c) => ({ last4: c.last4, holder: c.holderName })),
    },
  };
}

/** Save the statement just previewed and tell each cardholder. */
async function confirmStatement(month: string): Promise<StatementState> {
  const viewer = await financeViewer();
  if (!viewer) return { stage: "start", errors: ["Only the finance office can upload card statements."] };
  const store = await statementStore();
  const draft = await store.getDraft(viewer.email);
  // The preview on screen must be the one kept: another tab may have previewed a different month since.
  if (!draft || draft.month !== month) return { stage: "start", errors: ["That preview has expired. Upload the statement again."] };
  const blocked = await startedFrom(draft.month);
  if (blocked) return { stage: "start", errors: [blocked] };

  const imported: ImportedStatement = { ...draft, importedAt: new Date().toISOString() };
  await store.save(imported);
  await store.clearDraft(viewer.email);

  const ctx = await purchaseContext();
  const notices = statementNotices(imported, ctx.cards, viewer.email);
  await deliver(notices, viewer.email);
  revalidatePath("/purchases/statement");
  return { stage: "done", month: imported.month, told: notices.length, unknown: matchCards(imported, ctx.cards).unknown.length };
}

/** The import form's one action: "preview" reads the PDF, "confirm" saves what was previewed. */
export async function statementAction(prev: StatementState, form: FormData): Promise<StatementState> {
  return form.get("step") === "confirm" ? confirmStatement(String(form.get("month") ?? "")) : previewStatement(prev, form);
}
