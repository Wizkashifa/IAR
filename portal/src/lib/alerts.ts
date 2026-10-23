/**
 * Alerts: the messages that go with a notice when someone has to act (see
 * Notice.alert). They go through Google Chat: a direct message to a person,
 * or a post in a role's or team's Chat space ("IAR Portal · Finance"). Email
 * is only a fallback, when Chat can't reach someone. Plain functions so they
 * can be tested; lib/notifications.ts sends them.
 */
import type { Role } from "./org";

export type Alert = {
  /** An email, or "role:<role>". */
  to: string;
  text: string;
  href: string;
  cardId?: string;
  /** Sent to someone covering for an away approver. */
  cover?: { name: string; until: string };
};

export type Delivery =
  | { via: "dm"; email: string; alert: Alert }
  | { via: "space"; space: string; role: Role; alert: Alert }
  | { via: "email"; to: string; alert: Alert };

export type RouteOptions = {
  /** Google Chat is switched on. Off: every alert goes by email, as before. */
  chat: boolean;
  /** Role → Chat space ("spaces/AAAA…"), from Portal Settings. */
  spaces: Partial<Record<Role, string>>;
  /** The Google Group address for a role, for email. */
  groupMailbox: (role: Role) => string | null;
};

const roleOf = (to: string): Role | null => (to.startsWith("role:") ? (to.slice(5) as Role) : null);

/** How each alert travels: a Chat DM, a post in a team's space, or an email. */
export function routeAlerts(alerts: Alert[], o: RouteOptions): Delivery[] {
  const out: Delivery[] = [];
  const seen = new Set<string>();
  for (const a of alerts) {
    const role = roleOf(a.to);
    let d: Delivery | null = null;
    if (role) {
      const space = o.spaces[role];
      if (o.chat && space) d = { via: "space", space, role, alert: a };
      else {
        const box = o.groupMailbox(role);
        if (box) d = { via: "email", to: box, alert: a };
      }
    } else if (a.to.includes("@")) {
      const email = a.to.toLowerCase();
      d = o.chat ? { via: "dm", email, alert: a } : { via: "email", to: email, alert: a };
    }
    if (!d) continue;
    // One message per place per alert text: two roles sharing a space (IT and A/V) get one post.
    const key = `${d.via}|${d.via === "dm" ? d.email : d.via === "space" ? d.space : d.to}|${a.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** Where a Chat message goes by email instead when Chat can't deliver it. */
export function fallbackFor(d: Delivery, groupMailbox: (role: Role) => string | null): Delivery | null {
  if (d.via === "dm") return { via: "email", to: d.email, alert: d.alert };
  if (d.via === "space") {
    const box = groupMailbox(d.role);
    return box ? { via: "email", to: box, alert: d.alert } : null;
  }
  return null;
}

/** A Google Chat message: the alert text and an "Open in the portal" button. */
export function chatMessage(a: Alert, url: string): { text: string; cardsV2: unknown[] } {
  const lead = a.cover ? `${a.cover.name} is away until ${a.cover.until} and asked you to cover their approvals.` : "";
  return {
    text: a.text,
    cardsV2: [
      {
        cardId: a.cardId ?? "alert",
        card: {
          header: { title: a.cardId ? `${a.cardId} · IAR Portal` : "IAR Portal" },
          sections: [
            {
              widgets: [
                { textParagraph: { text: escapeChat(a.text) } },
                ...(lead ? [{ textParagraph: { text: escapeChat(lead) } }] : []),
                { buttonList: { buttons: [{ text: "Open in the portal", onClick: { openLink: { url } } }] } },
              ],
            },
          ],
        },
      },
    ],
  };
}

/** The email version of an alert. */
export function alertEmail(a: Alert, url: string): { subject: string; text: string } {
  const lead = a.cover ? `\n\n${a.cover.name} is away until ${a.cover.until} and asked you to cover their approvals.` : "";
  return {
    subject: a.text,
    text: `${a.text}${lead}\n\nOpen it in the IAR Portal: ${url}\n\nYou're getting this because it's waiting on you. Everything else stays in the portal's notifications.`,
  };
}

/** Chat card text accepts a little HTML; keep what people typed as plain text. */
function escapeChat(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
