import { ORG } from "./org";

/**
 * Local development without Google: sample people with different groups.
 * Never active on Cloud Run (K_SERVICE is always set there).
 */
export function isDevAuth(): boolean {
  return process.env.DEV_AUTH === "1" && !process.env.K_SERVICE;
}

export type DevPersona = { id: string; name: string; email: string; title: string; groups: string[] };

const g = ORG.roleGroups;
export const DEV_PERSONAS: DevPersona[] = [
  { id: "member", name: "Sample Volunteer", email: "volunteer@dev.local", title: "Committee member", groups: [] },
  { id: "chair", name: "Sample Chair", email: "chair@dev.local", title: "Committee chair", groups: [g.chairs] },
  { id: "office", name: "Sample Office", email: "office@dev.local", title: "IAR office", groups: [g.office] },
  { id: "finance", name: "Sample Finance", email: "finance@dev.local", title: "Finance, cardholder", groups: [g.finance, g.cardholders] },
  { id: "security", name: "Sample Security", email: "security@dev.local", title: "Security & facilities", groups: [g.security, g.facilities] },
  { id: "admin", name: "Sample Admin", email: "admin@dev.local", title: "Portal admin", groups: [g.admins] },
];
