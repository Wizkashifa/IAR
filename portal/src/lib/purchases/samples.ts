import "server-only";
import type { Card, Vendor } from "../cards";
import { vendorKey } from "./vendors";
import type { Role } from "../org";
import { parsePurchaseInput, type LineInput, type PurchaseInput } from "./input";
import { purchaseContext } from "./settings";
import { merchantName, type StatementCard } from "./statement";
import { cardOn, sampleStatement } from "./statements";
import * as wf from "./workflow";

/**
 * Sample payment requests for local development, built by running the real
 * workflow so every stage, history line and permission is what the app would
 * produce. Requests, payees and amounts are made up; the accounts are IAR's.
 */

const person = (email: string, name: string, roles: Role[]): wf.Actor => ({ email, name, roles });
const volunteer = person("volunteer@dev.local", "Sample Volunteer", ["member"]);
const chair = person("chair@dev.local", "Sample Chair", ["member", "chairs"]);
const office = person("office@dev.local", "Sample Office", ["member", "office"]);
const finance = person("finance@dev.local", "Sample Finance", ["member", "finance", "cardholders"]);

export function sampleVendors(): Vendor[] {
  const at = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
  const v = (name: string, w9OnFile: boolean, days: number | undefined, more: Partial<Vendor> = {}): Vendor => ({
    id: vendorKey(name, Boolean(more.restricted)), name, w9OnFile, w9Date: days ? at(days) : undefined, ...more,
  });
  return [
    v("Triangle Janitorial Supply", true, 400, { address: "1200 Industrial Dr, Raleigh, NC 27610", funds: ["Cleaning Committee Expenses", "General Fund Expenses"], timesPaid: 6, lastPaidAt: at(20) }),
    v("Capital Plumbing Co.", true, 220, { address: "88 Trade St, Raleigh, NC 27601", funds: ["Facility Maintenance Expenses"], timesPaid: 2, lastPaidAt: at(60) }),
    v("Example Media LLC", true, 90, { funds: ["Event Committee Expenses"], timesPaid: 1, lastPaidAt: at(80) }),
    v("Bright Signs Printing", true, 1300, { address: "410 Glenwood Ave, Raleigh, NC 27603", funds: ["General Fund Expenses", "Youth Expenses"], timesPaid: 4, lastPaidAt: at(3) }),
    v("Triangle Sound & Stage", false, undefined, { address: "77 Capital Blvd, Raleigh, NC 27604", funds: ["Youth Expenses", "Event Committee Expenses"], timesPaid: 3, lastPaidAt: at(30) }),
    v("Office Depot", false, undefined),
    // Social & Welfare: a separate record only S&W and finance see.
    v("Sample Aid Recipient", false, undefined, { restricted: true, address: "PO Box 100, Raleigh, NC 27601", funds: ["Social & Welfare"], timesPaid: 1, lastPaidAt: at(40) }),
  ];
}

export async function samplePurchases(): Promise<Card[]> {
  const s = (await purchaseContext()).routing;
  const vendors = sampleVendors();
  const t = (daysAgo: number, hour = 10) => {
    const d = new Date(Date.now() - daysAgo * 864e5);
    d.setUTCHours(hour + 4, 0, 0, 0);
    return d.toISOString();
  };
  let n = 12001;
  const make = (owner: wf.Actor, input: Omit<PurchaseInput, "attestationName">, daysAgo: number, files: string[] = [], statement?: StatementCard) => {
    const cards = [
      { last4: "2093", fund: "Imam's Office Fund Expenses" },
      { last4: "1003", fund: "Cleaning Committee Expenses" },
      { last4: "4120", fund: "Youth Expenses" },
    ];
    // "ach" samples stand for older requests: new ones are always paid by check.
    const ach = input.delivery === "ach";
    const r = parsePurchaseInput({ ...input, ...(ach ? { delivery: "mail", mailingAddress: "Sample address, Raleigh, NC" } : {}), attestationName: owner.name }, { requesterName: owner.name, cards, vendors, statement });
    if (!r.ok) throw new Error(`Bad sample: ${r.errors.join("; ")}`);
    const details = ach ? { ...r.details, delivery: "ach" as const, mailingAddress: undefined } : r.details;
    const at = t(daysAgo);
    const draft = wf.newPurchase(details, owner.email, at, files.map((name) => ({ name, size: 180_000 })));
    draft.id = `PO-${n++}`;
    return wf.submit(draft, owner, s, at);
  };

  const out: Card[] = [];

  // Small split request, chair approved, now with finance.
  let c = make(volunteer, {
    kind: "pay", fund: "Cleaning Committee Expenses", description: "Monthly supplies plus office paper",
    payee: "Triangle Janitorial Supply", invoiceNumber: "TJS-4471", delivery: "mail", mailingAddress: "1200 Industrial Dr, Raleigh, NC 27610",
    lines: [{ accountId: "a89", amount: "286.40", note: "Floor cleaner, liners" }, { accountId: "a92", amount: "74.15", note: "Copy paper, toner" }],
  }, 3, ["invoice-TJS-4471.pdf", "receipt-0917.jpg"]);
  c = wf.approve(c, chair, s, t(2, 9));
  out.push(c);

  // Over the executive threshold: chair and finance approved, waiting on executive.
  c = make(volunteer, {
    kind: "pay", fund: "Event Committee Expenses", description: "Marketing for the fall fundraiser",
    payee: "Example Media LLC", invoiceNumber: "EM-2207", delivery: "ach",
    lines: [{ accountId: "a96", amount: "3200", note: "Design and social ads" }],
  }, 9, ["invoice-EM-2207.pdf"]);
  c = wf.approve(c, chair, s, t(8));
  c = wf.approve(c, finance, s, t(6));
  out.push(c);

  // Labor for a new payee: needs a W-9; waiting on the chair.
  c = make(volunteer, {
    kind: "pay", fund: "Sports & Recreation Expenses", description: "League scorekeeping, weeks 1 and 2",
    payee: "A. Rahman (scorekeeper)", delivery: "committee_box", mailingAddress: "15 Sample St, Raleigh, NC 27606", isLabor: true, w9Attached: true,
    lines: [{ accountId: "a36", amount: "90", note: "2 weeks at $45" }],
  }, 4);
  c.purchase.w9Uploaded = { name: "W-9 — A. Rahman (scorekeeper).pdf", at: c.createdAt ?? c.updatedAt };
  out.push(c);

  // Approved, waiting to be paid.
  c = make(volunteer, {
    kind: "pay", fund: "Facility Maintenance Expenses", description: "Wudu area pipe repair",
    payee: "Capital Plumbing Co.", invoiceNumber: "CP-0931", delivery: "mail", mailingAddress: "88 Trade St, Raleigh, NC 27601",
    lines: [{ accountId: "a19", amount: "1180", note: "Labor and parts" }],
  }, 7, ["invoice-CP-0931.pdf"]);
  c = wf.approve(c, chair, s, t(6));
  c = wf.approve(c, finance, s, t(1));
  out.push(c);

  // Returned to the requester.
  c = make(volunteer, {
    kind: "reimburse", fund: "Youth Expenses", description: "Youth night supplies and snacks", delivery: "office_pickup", mailingAddress: "20 Sample Ln, Cary, NC 27511",
    lines: [{ accountId: "a38", amount: "142.80", note: "Supplies" }, { accountId: "a39", amount: "96.00", note: "Snacks" }],
  }, 5, ["receipt-1003.jpg"]);
  c = wf.returnForChanges(c, chair, t(2), "The receipt for the snacks is missing. Please attach it.");
  out.push(c);

  // Paid, waiting for QuickBooks entry.
  c = make(volunteer, {
    kind: "pay", fund: "General Fund Expenses", description: "Jumuah announcement banners",
    payee: "Bright Signs Printing", invoiceNumber: "BS-118", delivery: "security", mailingAddress: "410 Glenwood Ave, Raleigh, NC 27603",
    lines: [{ accountId: "a2", amount: "415" }],
  }, 12, ["invoice-BS-118.pdf"]);
  c = wf.approve(c, chair, s, t(11));
  c = wf.approve(c, finance, s, t(10));
  c = wf.recordPayment(c, finance, t(3), "Check", "20431");
  out.push(c);

  // A chair's own request goes to the fund's backup approver, not skipped.
  c = make(chair, {
    kind: "reimburse", fund: "Youth Expenses", description: "Halaqa snacks and supplies", delivery: "committee_box", mailingAddress: "30 Sample Ct, Raleigh, NC 27609",
    lines: [{ accountId: "a38", amount: "184.50" }],
  }, 1, ["receipt-costco.jpg"]);
  out.push(c);

  // Card receipts, from the sample statement (statements.ts): the Amazon charges lumped together, a refund still owed, at finance review.
  const statement = sampleStatement();
  const month = statement.month;
  const fromStatement = (last4: string, choose: (merchant: string) => Partial<LineInput>) => {
    const sc = cardOn(statement, last4)!;
    return { sc, lines: sc.charges.map((ch) => ({ ref: ch.ref, accountId: "", amount: ch.amount, hasReceipt: true, ...choose(merchantName(ch.description)) })) };
  };
  const vol = fromStatement("2093", (m) =>
    m === "Amazon" ? { group: "Amazon", accountId: "a78", note: "Certificates, seals and folders for nikah certificates" } :
    m === "USPS" ? { accountId: "a76", note: "Mailing signed certificates" } :
    m === "Sample Print Shop" ? { accountId: "a78", note: "Marriage certificate jackets" } :
    { accountId: "a75", note: "Imam's conference registration", flag: "repay", repayBy: "Da'wah Committee" },
  );
  c = make(volunteer, { kind: "card", fund: "", description: "Card statement receipts", cardLast4: "2093", statementMonth: month, lines: vol.lines }, 2, ["amazon-orders.pdf", "usps.pdf", "print-shop.jpg"], vol.sc);
  out.push(c);

  // Card receipts that went all the way through; one refund still outstanding.
  const ch = fromStatement("4120", (m) =>
    m === "Target" ? { accountId: "a38", note: "Prizes for game night (returned, refund pending)", flag: "refund" } :
    { accountId: "a38", note: m === "Costco" ? "Snacks and drinks for youth night" : "Dinner for youth volunteers" },
  );
  c = make(chair, { kind: "card", fund: "", description: "Card statement receipts", cardLast4: "4120", statementMonth: month, lines: ch.lines }, 6, ["costco.jpg", "kitchen.jpg", "target.jpg"], ch.sc);
  c = wf.approve(c, finance, s, t(4));
  c = wf.recordBooks(c, finance, t(3));
  out.push(c);

  // Social & Welfare aid: restricted to S&W and finance.
  c = make(volunteer, {
    kind: "pay", fund: "Social & Welfare", description: "Rent assistance, one month",
    payee: "Sample Aid Recipient", delivery: "mail", mailingAddress: "PO Box 100, Raleigh, NC 27601",
    lines: [{ accountId: "a55", amount: "950" }],
  }, 2, ["lease-page.pdf"]);
  out.push(c);

  // Done and closed.
  c = make(volunteer, {
    kind: "pay", fund: "Cleaning Committee Expenses", description: "September supplies",
    payee: "Triangle Janitorial Supply", invoiceNumber: "TJS-4402", delivery: "ach",
    lines: [{ accountId: "a89", amount: "312.55" }],
  }, 25, ["invoice-TJS-4402.pdf"]);
  c = wf.approve(c, chair, s, t(24));
  c = wf.approve(c, finance, s, t(22));
  c = wf.recordPayment(c, office, t(20), "ACH", "0930-1");
  c = wf.recordBooks(c, finance, t(18));
  out.push(c);

  return out;
}
