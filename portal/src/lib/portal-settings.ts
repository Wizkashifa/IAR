import "server-only";
import { clean, firestore } from "./db";
import { isDevAuth } from "./dev";
import { ORG } from "./org";
import { teamGroupEmail } from "./teams";
import { EMPTY_SETTINGS, type PortalSettings } from "./settings-rules";
import { DEV_ROOM_SETTINGS } from "./rooms-google";

export { type CreditCard, type PortalSettings } from "./settings-rules";

/**
 * What portal admins set in Portal Settings: the fund each team charges,
 * IAR's credit cards and each role's Google Chat space. People are never set here; they come from Google Groups.
 * Stored at orgs/{orgId}/settings/portal.
 */
interface SettingsStore {
  get(): Promise<PortalSettings>;
  save(s: PortalSettings): Promise<void>;
}

const g = globalThis as unknown as { __iarSettings?: PortalSettings };
const mem: { s: PortalSettings } = {
  get s() {
    // Dev: as if an admin had picked funds for the teams whose names don't match one.
    return (g.__iarSettings ??= {
      teamFunds: {
        [teamGroupEmail("Administration", ORG.domain)]: "General Fund Expenses",
        [teamGroupEmail("Older Adult Community", ORG.domain)]: "Senior Committee Expenses",
        [teamGroupEmail("Page Road", ORG.domain)]: "Page Rd",
      },
      cards: [
        { last4: "2093", holderEmail: "volunteer@dev.local", holderName: "Sample Volunteer", fund: "Imam's Office Fund Expenses" },
        { last4: "8890", holderEmail: "finance@dev.local", holderName: "Sample Finance", fund: "Cleaning Committee Expenses" },
        { last4: "4120", holderEmail: "chair@dev.local", holderName: "Sample Chair", fund: "Youth Expenses" },
      ],
      // Dev: as if go-live had made one Chat space per role. Nothing is posted; see /dev.
      chatSpaces: {
        office: "spaces/dev-office",
        finance: "spaces/dev-finance",
        executive: "spaces/dev-executive",
        admins: "spaces/dev-admins",
        marketing: "spaces/dev-marketing",
        it: "spaces/dev-it",
        av: "spaces/dev-it",
        facilities: "spaces/dev-facilities",
        security: "spaces/dev-security",
      },
      rooms: DEV_ROOM_SETTINGS,
      eventRules: {},
    });
  },
  set s(v) {
    g.__iarSettings = v;
  },
};

const memoryStore: SettingsStore = {
  async get() {
    return structuredClone(mem.s);
  },
  async save(s) {
    mem.s = structuredClone(s);
  },
};

let fsStore: SettingsStore | null = null;
async function getFirestoreStore(): Promise<SettingsStore> {
  if (fsStore) return fsStore;
  const { org } = await firestore();
  const doc = org.collection("settings").doc("portal");
  fsStore = {
    async get() {
      const d = await doc.get();
      return d.exists ? { ...EMPTY_SETTINGS, ...(d.data() as PortalSettings) } : structuredClone(EMPTY_SETTINGS);
    },
    async save(s) {
      // Replace only the fields the portal edits, so anything go-live or a later version added stays.
      const data = clean(s);
      await doc.set(data, { mergeFields: Object.keys(data) });
    },
  };
  return fsStore;
}

export async function settingsStore(): Promise<SettingsStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}

/** Settings for reading. A database hiccup falls back to none, which sends every request to finance review. */
export async function portalSettings(): Promise<PortalSettings> {
  try {
    return await (await settingsStore()).get();
  } catch (err) {
    console.error("settings lookup failed", err);
    return structuredClone(EMPTY_SETTINGS);
  }
}
