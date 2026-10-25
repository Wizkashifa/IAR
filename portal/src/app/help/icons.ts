import type { IconName } from "@/components/Icon";
import type { HelpKey } from "@/lib/help";

/** Each guide's icon on the help pages, the same as its menu link. */
export const GUIDE_ICON: Record<HelpKey, IconName> = {
  events: "calendar",
  purchases: "receipt",
  marketing: "megaphone",
  "it-maintenance": "wrench",
  requests: "inbox",
  away: "clock",
  teams: "tasks",
};
