import "server-only";
import type { Card, Vendor } from "../cards";
import { vendorId } from "../cards";
import type { Role } from "../org";
import { parsePurchaseInput, type PurchaseInput } from "./input";
import { routingSettings } from "./settings";
import * as wf from "./workflow";

/**
 * Sample purchase requests for local development, built by running the real
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
  const v = (name: string, w9OnFile: boolean, days?: number): Vendor => ({ id: vendorId(name), name, w9OnFile, w9Date: days ? at(days) : undefined });
  return [
    v("Triangle Janitorial Supply", true, 400),
    v("Capital Plumbing Co.", true, 220),
    v("Example Media LLC", true, 90),
    v("Bright Signs Printing", true, 1300),
    v("Office Depot", false),
  ];
}

export function samplePurchases(): Card[] {
  const s = routingSettings();
  const vendors = sampleVendors();
  const t = (daysAgo: number, hour = 10) => {
    const d = new Date(Date.now() - daysAgo * 864e5);
    d.setUTCHours(hour + 4, 0, 0, 0);
    return d.toISOString();
  };
  let n = 12001;
  const make = (owner: wf.Actor, input: Omit<PurchaseInput, "attestationName">, daysAgo: number, files: string[] = []) => {
    const cards = [
      { last4: "2093", fund: "Imam's Office Fund Expenses" },
      { last4: "8890", fund: "Cleaning Committee Expenses" },
      { last4: "4120", fund: "Youth Expenses" },
    ];
    const r = parsePurchaseInput({ ...input, attestationName: owner.name }, { requesterName: owner.name, cards, vendors });
    if (!r.ok) throw new Error(`Bad sample: ${r.errors.join("; ")}`);
    const at = t(daysAgo);
    const draft = wf.newPurchase(r.details, owner.email, at, files.map((name) => ({ name, size: 180_000 })));
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
    payee: "A. Rahman (scorekeeper)", delivery: "committee_box", isLabor: true,
    lines: [{ accountId: "a36", amount: "90", note: "2 weeks at $45" }],
  }, 4);
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
    kind: "reimburse", fund: "Youth Expenses", description: "Youth night supplies and snacks", delivery: "office_pickup",
    lines: [{ accountId: "a38", amount: "142.80", note: "Supplies" }, { accountId: "a39", amount: "96.00", note: "Snacks" }],
  }, 5, ["receipt-1003.jpg"]);
  c = wf.returnForChanges(c, chair, t(2), "The receipt for the snacks is missing. Please attach it.");
  out.push(c);

  // Paid, waiting for QuickBooks entry.
  c = make(volunteer, {
    kind: "pay", fund: "General Fund Expenses", description: "Jumuah announcement banners",
    payee: "Bright Signs Printing", invoiceNumber: "BS-118", delivery: "security",
    lines: [{ accountId: "a2", amount: "415" }],
  }, 12, ["invoice-BS-118.pdf"]);
  c = wf.approve(c, chair, s, t(11));
  c = wf.approve(c, finance, s, t(10));
  c = wf.recordPayment(c, finance, t(3), "Check", "20431");
  out.push(c);

  // A chair's own request goes to the fund's backup approver, not skipped.
  c = make(chair, {
    kind: "reimburse", fund: "Youth Expenses", description: "Halaqa snacks and supplies", delivery: "committee_box",
    lines: [{ accountId: "a38", amount: "184.50" }],
  }, 1, ["receipt-costco.jpg"]);
  out.push(c);

  // Card receipts with a refund and a repayment still owed, at finance review.
  const L = (date: string, merchant: string, accountId: string, amount: string, extra: Partial<PurchaseInput["lines"][number]> = {}) =>
    ({ date, merchant, accountId, amount, ...extra });
  const month = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 7);
  const d = (day: number) => `${month}-${String(day).padStart(2, "0")}`;
  c = make(volunteer, {
    kind: "card", fund: "", description: "Card statement receipts", cardLast4: "2093", statementMonth: month,
    lines: [
      L(d(2), "Baian, Inc", "a76", "150"),
      L(d(4), "USPS Click-N-Ship", "a76", "9.57"),
      L(d(5), "Amazon (certificates and seals)", "a78", "40.71"),
      L(d(8), "US Custom Pad (marriage certificate jackets)", "a78", "385.92"),
      L(d(9), "ElevenLabs subscription", "a79", "22"),
      L(d(12), "Claude subscription", "a79", "125"),
      L(d(14), "AMJA conference registration", "a75", "250"),
      L(d(15), "USPS Click-N-Ship", "a76", "9.57", { hasReceipt: false }),
      L(d(16), "Delta Air Lines (workshop speaker)", "a75", "508"),
      L(d(20), "AMJA conference, second attendee", "a75", "300", { flag: "repay", repayBy: "Da'wah Committee" }),
      L(d(22), "Priceline hotel hold", "a75", "134.99", { flag: "refund" }),
    ],
  }, 2);
  out.push(c);

  // Card receipts that went all the way through; one refund still outstanding.
  c = make(chair, {
    kind: "card", fund: "", description: "Card statement receipts", cardLast4: "4120", statementMonth: month,
    lines: [L(d(6), "Costco", "a38", "212.44"), L(d(19), "Target (returned items)", "a38", "38.20", { flag: "refund" })],
  }, 14);
  c = wf.approve(c, finance, s, t(10));
  c = wf.recordBooks(c, finance, t(9));
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
