import "server-only";
import { cardStore } from "@/lib/cards";
import type { Viewer } from "@/lib/viewer";
import { vendorChoice, visibleVendors } from "@/lib/purchases/vendors";
import { isPurchaseCard } from "@/lib/purchases/workflow";

/**
 * What the request form needs about saved vendors: the shared list, the S&W
 * list for S&W and finance only, and the address on this person's own last
 * reimbursement by check.
 */
export async function vendorFormProps(viewer: Viewer) {
  const store = await cardStore();
  const [all, mine] = await Promise.all([store.listVendors(), store.listByOwner(viewer.email)]);
  const { shared, restricted } = visibleVendors(all, viewer.actingRoles);
  const last = mine
    .filter(isPurchaseCard)
    .filter((c) => c.purchase.kind === "reimburse" && c.purchase.delivery !== "ach" && c.purchase.mailingAddress)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return { vendors: shared.map(vendorChoice), restrictedVendors: restricted.map(vendorChoice), lastAddress: last?.purchase.mailingAddress ?? "" };
}
