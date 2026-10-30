/** The Portal Settings sections a save can leave open (?open=…). */
export type AdminSection = "teams" | "rooms" | "rules" | "library" | "cards" | "support";

/** What a save on Portal Settings says once it's done (?ok=…). Fixed words, so a link can't make the page say anything else. */
export const ADMIN_OK = {
  saved: "Saved.",
  fund: "Team fund saved.",
  fundReset: "The team is back to its suggested fund.",
  cardAdded: "Card added.",
  cardRemoved: "Card removed. Its past receipts are kept.",
  room: "Room saved.",
  rules: "Event rules saved.",
  library: "Policies drive connected. The Library lists it within a few minutes.",
  libraryOff: "Policies drive disconnected.",
} as const;
export type AdminOk = keyof typeof ADMIN_OK;
