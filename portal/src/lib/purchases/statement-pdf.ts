import "server-only";
import { linesFromItems, type TextItem } from "./statement";

/** A file that isn't a readable statement PDF; the message is for the person who uploaded it. */
export class StatementFileError extends Error {}

/** Statements are a few pages; anything far longer isn't one. */
const MAX_PAGES = 40;

/**
 * The printed lines of a statement PDF, for parseStatement. Throws a plain
 * message when the file isn't a readable PDF.
 */
export async function statementLines(bytes: Uint8Array): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch {
    throw new StatementFileError("That file couldn't be opened as a PDF. Download the statement from Truist again and upload that.");
  }
  try {
    if (pdf.numPages > MAX_PAGES) throw new StatementFileError(`That PDF has ${pdf.numPages} pages, far more than a card statement.`);
    const pages: TextItem[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push(content.items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number }] : [])));
    }
    return linesFromItems(pages);
  } finally {
    await pdf.cleanup();
  }
}
