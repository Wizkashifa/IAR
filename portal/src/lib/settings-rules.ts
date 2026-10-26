/**
 * Checks for what admins save in Portal Settings: which fund each team
 * charges, and IAR's credit cards. Plain functions so they can be tested.
 */
import type { RoomSetting } from "./events/rooms";
import type { Role } from "./org";
import type { TeamInfo } from "./whos-who";

export type CreditCard = { last4: string; holderEmail: string; holderName: string; fund: string };
export type PortalSettings = {
  /** Team group → fund it charges. Teams not listed use the suggested fund. */
  teamFunds: Record<string, string>;
  cards: CreditCard[];
  /** Role → its Google Chat space ("spaces/AAAA…"), where alerts for that role are posted. Set by go-live. */
  chatSpaces?: Partial<Record<Role, string>>;
  /** Room resource ID → what Google doesn't hold: bookable, food, shared space, restricted (see lib/events/rooms.ts). */
  rooms?: Record<string, RoomSetting>;
  /** Event policy rules an admin turned off (rule ID → false). See RULES in lib/events/rules.ts. */
  eventRules?: Record<string, boolean>;
  /** Link to the room reservation policy (a Shared Drive file), shown next to the agreement on the event form. */
  roomPolicyUrl?: string;
  /** Team group → what it handles and its Google Chat space link, shown in Who's who. Set by the team's chair or an admin. */
  teamInfo?: Record<string, TeamInfo>;
  /** The Policies Shared Drive's ID, listed in the Library (lib/library.ts). */
  policiesDrive?: string;
  /** Purchase requests are a demo for everyone but the beta testers. On unless an admin turns it off (`purchasesDemoOn`). */
  purchasesDemo?: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

/** Whether purchase requests are a demo. On until an admin turns it off in Portal Settings, so going live with them is one switch. */
export const purchasesDemoOn = (s: Pick<PortalSettings, "purchasesDemo">) => s.purchasesDemo !== false;

/**
 * Whether a purchase request's alert goes out by Google Chat or email. In demo
 * mode only a beta tester's requests send them; everyone else's stay in the
 * portal, on the bell.
 */
export const purchaseAlertsSend = (o: { demo: boolean; ownerIsTester: boolean }) => !o.demo || o.ownerIsTester;

export const EMPTY_SETTINGS: PortalSettings = { teamFunds: {}, cards: [], chatSpaces: {}, rooms: {}, eventRules: {} };

const EMAIL = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+$/;

/** A card to add, checked. Only the last four digits are ever stored. */
export function checkCard(
  raw: { last4?: unknown; holderEmail?: unknown; holderName?: unknown; fund?: unknown },
  ctx: { funds: string[]; domain: string; existing: CreditCard[] },
): { ok: true; card: CreditCard } | { ok: false; error: string } {
  const last4 = String(raw.last4 ?? "").trim();
  const holderEmail = String(raw.holderEmail ?? "").trim().toLowerCase();
  const holderName = String(raw.holderName ?? "").trim().slice(0, 120);
  const fund = String(raw.fund ?? "");
  if (!/^\d{4}$/.test(last4)) return { ok: false, error: "Enter only the card's last four digits, never the full number." };
  if (ctx.existing.some((c) => c.last4 === last4)) return { ok: false, error: `A card ending ${last4} is already listed.` };
  if (!EMAIL.test(holderEmail) || !holderEmail.endsWith(`@${ctx.domain}`)) return { ok: false, error: `The cardholder needs an @${ctx.domain} address.` };
  if (!holderName) return { ok: false, error: "Enter the cardholder's name." };
  if (!ctx.funds.includes(fund)) return { ok: false, error: "Choose the fund the card is charged to." };
  return { ok: true, card: { last4, holderEmail, holderName, fund } };
}

/** A team's fund choice, checked. An empty fund clears the choice so the suggestion applies again. */
export function checkTeamFund(group: string, fund: string, ctx: { funds: string[]; teamGroups: string[] }): { ok: true } | { ok: false; error: string } {
  if (!ctx.teamGroups.includes(group.toLowerCase())) return { ok: false, error: "That team isn't in Google Groups any more. Reload the page." };
  if (fund && !ctx.funds.includes(fund)) return { ok: false, error: "Choose a fund from the chart of accounts." };
  return { ok: true };
}

/** A room's portal settings, checked. Only rooms Google lists can be set; shared space only with other listed rooms. */
export function checkRoomSetting(
  roomId: string,
  raw: { bookable?: unknown; food?: unknown; restricted?: unknown; mph?: unknown; overlaps?: unknown; note?: unknown },
  ctx: { roomIds: string[] },
): { ok: true; setting: RoomSetting } | { ok: false; error: string } {
  if (!ctx.roomIds.includes(roomId)) return { ok: false, error: "That room isn't in Google any more. Reload the page." };
  const on = (v: unknown) => v === true || v === "on";
  const overlaps = (Array.isArray(raw.overlaps) ? raw.overlaps.map(String) : []).filter((x) => x !== roomId);
  if (overlaps.some((x) => !ctx.roomIds.includes(x))) return { ok: false, error: "Pick shared rooms from the list." };
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 200) : "";
  return { ok: true, setting: { bookable: on(raw.bookable), food: on(raw.food), restricted: on(raw.restricted), mph: on(raw.mph), overlaps, note } };
}
