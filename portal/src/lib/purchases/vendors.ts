/**
 * Saved vendors: one shared list every committee reuses, so when Youth has
 * paid a vendor, Events picks it and gets its address and W-9 status. Social
 * & Welfare payees (aid recipients) are kept apart: a separate restricted
 * record that only S&W and finance ever see, never matched against the shared
 * list, so nobody can find out who received aid by typing a name. Plain
 * functions, tested in purchases.test.ts.
 */
import type { Vendor } from "../cards";
import type { Role } from "../org";
import { SOCIAL_WELFARE_FUND } from "./accounts";
import type { PurchaseDetails } from "./types";

export const vendorSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unnamed";

/** Shared and restricted records never share an ID, even for the same name. */
export function vendorKey(name: string, restricted: boolean): string {
  return restricted ? `sw-${vendorSlug(name)}` : vendorSlug(name);
}

/** S&W, finance and executives see Social & Welfare payees. Pass the person's own group roles. */
export function seesRestrictedVendors(roles: Role[]): boolean {
  return roles.includes("finance") || roles.includes("sw") || roles.includes("executive");
}

/** Split the store's list into the shared one and the S&W one (empty unless the person may see it). */
export function visibleVendors(all: Vendor[], roles: Role[]): { shared: Vendor[]; restricted: Vendor[] } {
  return {
    shared: all.filter((v) => !v.restricted),
    restricted: seesRestrictedVendors(roles) ? all.filter((v) => v.restricted) : [],
  };
}

/** The list a request charged to `fund` is matched against: S&W requests use only S&W payees. */
export function vendorsForFund(all: Vendor[], roles: Role[], fund: string): Vendor[] {
  const v = visibleVendors(all, roles);
  return fund === SOCIAL_WELFARE_FUND ? v.restricted : v.shared;
}

export function findVendor(list: Vendor[], name: string): Vendor | undefined {
  const n = name.trim().toLowerCase();
  return n ? list.find((v) => v.name.toLowerCase() === n) : undefined;
}

/** A W-9 confirmed more than three years ago: finance may want a fresh one. */
export function w9IsOld(v: Pick<Vendor, "w9OnFile" | "w9Date">, now: number = Date.now()): boolean {
  return Boolean(v.w9OnFile && v.w9Date && now - Date.parse(v.w9Date) > 3 * 365 * 864e5);
}

type Paid = Pick<PurchaseDetails, "kind" | "payee" | "fund" | "delivery" | "mailingAddress">;

/**
 * The vendor record after a request to it is paid: created the first time,
 * then the fund, address and count kept up to date. Pay requests only;
 * reimbursements go to the requester, who isn't a vendor.
 */
export function vendorAfterPayment(all: Vendor[], p: Paid, now: string): Vendor | null {
  if (p.kind !== "pay" || !p.payee) return null;
  const restricted = p.fund === SOCIAL_WELFARE_FUND;
  const list = all.filter((v) => Boolean(v.restricted) === restricted);
  const cur = findVendor(list, p.payee) ?? { id: vendorKey(p.payee, restricted), name: p.payee, w9OnFile: false, restricted };
  const funds = cur.funds?.includes(p.fund) ? cur.funds : [...(cur.funds ?? []), p.fund];
  const address = p.delivery !== "ach" && p.mailingAddress ? p.mailingAddress : cur.address;
  return { ...cur, restricted, funds, address, lastPaidAt: now, timesPaid: (cur.timesPaid ?? 0) + 1 };
}

/** The vendor record once finance confirms its W-9. */
export function vendorWithW9(all: Vendor[], p: Pick<PurchaseDetails, "payee" | "fund" | "w9Uploaded">, now: string): Vendor | null {
  if (!p.payee) return null;
  const restricted = p.fund === SOCIAL_WELFARE_FUND;
  const list = all.filter((v) => Boolean(v.restricted) === restricted);
  const cur = findVendor(list, p.payee) ?? { id: vendorKey(p.payee, restricted), name: p.payee, w9OnFile: false, restricted };
  return { ...cur, restricted, w9OnFile: true, w9Date: now, w9FileId: p.w9Uploaded?.driveFileId ?? cur.w9FileId };
}

/**
 * Two records for the same vendor, typed two ways: keep `keep`, fold `drop`
 * into it. Both must be on the same side of the S&W wall.
 */
export function mergeVendors(keep: Vendor, drop: Vendor): Vendor {
  if (Boolean(keep.restricted) !== Boolean(drop.restricted)) throw new Error("A Social & Welfare payee can't be merged with a shared vendor.");
  const newer = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);
  const w9 = keep.w9OnFile ? keep : drop.w9OnFile ? drop : keep;
  return {
    ...keep,
    w9OnFile: keep.w9OnFile || drop.w9OnFile,
    w9Date: w9.w9Date,
    w9FileId: w9.w9FileId,
    address: keep.address || drop.address,
    contact: keep.contact || drop.contact,
    funds: [...new Set([...(keep.funds ?? []), ...(drop.funds ?? [])])],
    lastPaidAt: newer(keep.lastPaidAt, drop.lastPaidAt),
    timesPaid: (keep.timesPaid ?? 0) + (drop.timesPaid ?? 0),
  };
}

/** What the form gets about a vendor: nothing finance-only (no W-9 file, no contact). */
export type VendorChoice = { name: string; w9OnFile: boolean; w9Date?: string; address?: string; funds: string[] };

export function vendorChoice(v: Vendor): VendorChoice {
  return { name: v.name, w9OnFile: v.w9OnFile, w9Date: v.w9Date, address: v.address, funds: v.funds ?? [] };
}
