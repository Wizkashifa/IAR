import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { FlashNote } from "@/components/FlashNote";
import { ADMIN_OK } from "./sections";
import { Panel } from "@/components/Panel";
import { Section } from "@/components/Section";
import { directory, portalPeople } from "@/lib/groups";
import { namesFor } from "@/lib/names";
import { PeoplePicker, type PersonOption } from "@/components/PeoplePicker";
import { ORG } from "@/lib/org";
import { portalSettings } from "@/lib/portal-settings";
import { FUNDS, shortFund } from "@/lib/purchases/accounts";
import { QUEUE_ROLES, effectiveTeamFunds, groupSlug, membershipsOf, pillarsOf, suggestFund, teamPeople } from "@/lib/teams";
import { requireViewer } from "@/lib/viewer";
import { fmtDateTime } from "../purchases/ui";
import { addCard, removeCard, saveEventRules, savePoliciesDrive, saveRoom, saveTeamFund, startActingAs } from "./actions";
import { auditStore } from "@/lib/audit";
import { isDevAuth } from "@/lib/dev";
import { libraryReader, policiesLibrary } from "@/lib/library";
import { googleRooms } from "@/lib/rooms-google";
import { mergeRooms } from "@/lib/events/rooms";
import { RULES, ruleOn } from "@/lib/events/rules";
import { DataTable, cell } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { Checkbox } from "@/components/Choices";
import { Field } from "@/components/Field";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portal Settings" };

const GOOGLE_GROUPS = "https://admin.google.com/ac/groups";
const QUEUE_LABEL: Record<string, string> = { marketing: "Marketing queue", facilities: "Facilities queue", sw: "Restricted S&W payment requests", shura: "Shura", it: "IT queue", av: "A/V queue" };
const SPACE_LABEL: Record<string, string> = { office: "IAR office", finance: "Finance", executive: "Executive", admins: "Portal admins", marketing: "Marketing", it: "IT", av: "A/V", facilities: "Facilities" };
const ROLE_LABEL: Record<string, string> = {
  office: "Rentals, run sheet; submits for any committee",
  finance: "Finance review, payment, QuickBooks, restricted S&W requests; submits for any fund",
  executive: "Executive offices (Head Imam, Shura chair, CEO): final mission review of events, and executive approvals. One person can hold several",
  admins: "Sees everything and this page; never approves or pays",
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; open?: string }> }) {
  const { ok, error, open } = await searchParams;
  const viewer = await requireViewer();
  if (!viewer.actingRoles.includes("admins")) redirect("/");
  const [dir, settings, google, library, reader, auditLog] = await Promise.all([directory(), portalSettings(), googleRooms(), policiesLibrary(), libraryReader(), auditStore().then((a) => a.list(25)).catch(() => [])]);
  // Policy files the room policy can be picked from (current ones, not the archive).
  const policyFiles = library.state === "ok" ? library.library.files.filter((f) => f.folder !== "Archive").sort((a, b) => a.name.localeCompare(b.name)) : [];
  const rooms = mergeRooms(google, settings.rooms ?? {});
  const funds = effectiveTeamFunds(dir, settings.teamFunds, FUNDS);
  const teams = [...dir.teams].sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (g: string) => dir.teams.find((t) => t.email === g)?.name ?? g;
  const gaps = teams.filter((t) => teamPeople(dir, t.email).chairs.length === 0 || !funds[t.email]).length;
  const accessGroup = process.env.PORTAL_ACCESS_GROUP;
  // Whom an admin can sign in as: everyone who can use the portal but themselves, by name, with their first team.
  const others = isDevAuth() ? [] : (await portalPeople().catch(() => [])).filter((e) => e !== viewer.email.toLowerCase());
  const otherNames = await namesFor(others);
  const signInChoices: PersonOption[] = others
    .map((e) => ({ email: e, name: otherNames.get(e) ?? e, note: membershipsOf(dir, e)[0]?.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <ModuleHead
        title="Portal Settings"
        actions={<Button href="/measures" icon="pie">Measures</Button>}
        lead={
          <>
        Who is on each committee or team, who chairs it and who directs it all come from Google Groups. Change people in{" "}
        <a href={GOOGLE_GROUPS} target="_blank" rel="noopener noreferrer">Google Admin → Groups</a>; the portal picks it up within 15 minutes. Here you set
        which fund each team charges and IAR&apos;s cards.
          </>
        }
      />
      <FlashNote ok={ok} error={error} messages={ADMIN_OK} />

      <Section open={open === "teams"} title={<>Committees and teams ({teams.length})</>}>
      <p className="hint">
        Each is a group named <code>portal-team-…@{ORG.domain}</code>. In the group, the Owner is the chair, a Manager is the vice chair (the backup
        approver), and Members are members. {gaps ? `${gaps} need a chair or a fund.` : "Every team has a chair and a fund."}
      </p>
      {teams.length === 0 ? (
        <Panel>
          <EmptyState>No portal-team groups found in Google yet. Create them in Google Admin → Groups (see docs/setup.md).</EmptyState>
        </Panel>
      ) : (
        <DataTable framed>
            <thead>
              <tr>
                <th>Team</th>
                <th>Chair</th>
                <th>Vice chair</th>
                <th>Director</th>
                <th className={cell.num}>People</th>
                <th>Fund</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const p = teamPeople(dir, t.email);
                const saved = settings.teamFunds[t.email];
                const suggested = suggestFund(t.name, FUNDS);
                const queue = (QUEUE_ROLES[groupSlug(t.email)] ?? []).map((r) => QUEUE_LABEL[r]).join(", ");
                return (
                  <tr key={t.email}>
                    <td data-label="Team">
                      <strong>{t.name}</strong>
                      <div className="hint">{t.email}</div>
                      {queue && <div className="hint">Also gives: {queue}</div>}
                    </td>
                    <td data-label="Chair">{p.chairs.length ? p.chairs.join(", ") : <Pill tone="warn">No chair</Pill>}</td>
                    <td data-label="Vice chair">{p.vices.join(", ") || <span className="hint">None</span>}</td>
                    <td data-label="Director">{p.directors.join(", ") || <span className="hint">None</span>}</td>
                    <td data-label="People" className={cell.num}>{p.memberCount}</td>
                    <td data-label="Fund">
                      <form action={saveTeamFund} className="row">
                        <input type="hidden" name="group" value={t.email} />
                        <select name="fund" defaultValue={saved ?? ""} aria-label={`Fund for ${t.name}`}>
                          <option value="">{suggested ? `Suggested: ${shortFund(suggested)}` : "Choose a fund…"}</option>
                          {FUNDS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                        <Button type="submit">Save</Button>
                      </form>
                      <div className="hint">{saved ? "Saved" : suggested ? "Using the suggestion" : <Pill tone="warn">Needs a fund</Pill>}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
      )}
      </Section>

      <Section title="Directors">
      <p className="hint">
        Each pillar is a group named <code>portal-pillar-…@{ORG.domain}</code>. Its Owner is the director, and its members are the team groups they
        oversee. A director sees those committees&apos; requests and can approve them alongside the chair, except Social &amp; Welfare.
      </p>
      {pillarsOf(dir).length === 0 ? (
        <Panel>
          <EmptyState>No portal-pillar groups found yet.</EmptyState>
        </Panel>
      ) : (
        <DataTable framed>
            <thead>
              <tr>
                <th>Pillar</th>
                <th>Director</th>
                <th>Committees</th>
              </tr>
            </thead>
            <tbody>
              {pillarsOf(dir).map((p) => (
                <tr key={p.group}>
                  <td data-label="Pillar">
                    <strong>{p.name}</strong>
                    <div className="hint">{p.group}</div>
                  </td>
                  <td data-label="Director">{p.directors.join(", ") || <Pill tone="warn">No director</Pill>}</td>
                  <td data-label="Committees">{p.teams.map(nameOf).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
      )}
      </Section>

      <Section title="Role groups">
      <p className="hint">Portal-wide jobs. Add people as members in Google Admin.</p>
      <DataTable framed>
          <tbody>
            {Object.entries(ORG.roleGroups).map(([role, group]) => (
              <tr key={role}>
                <td><code>{group}</code></td>
                <td>{ROLE_LABEL[role]}</td>
              </tr>
            ))}
            {accessGroup && (
              <tr>
                <td><code>{accessGroup}</code></td>
                <td>Only this group and the admins can sign in, until the portal is opened to everyone</td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </Section>

      <Section open={open === "rooms"} title={<>Rooms ({rooms.filter((r) => r.bookable).length} of {rooms.length} bookable)</>}>
      <p className="hint">
        Rooms come from Google (Admin console → Buildings and resources), each with its own calendar. Add or rename rooms there. Here you choose which ones
        can be booked through the portal and set what Google doesn&apos;t know: food, rooms that share a space (the full gym and its halves), and who may book.
      </p>
      {rooms.length === 0 ? (
        <Panel>
          <EmptyState>No room resources found in Google yet.</EmptyState>
        </Panel>
      ) : (
        <DataTable framed>
            <thead>
              <tr>
                <th>Room</th>
                <th>Settings</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td data-label="Room">
                    <strong>{r.name}</strong>
                    <div className="hint">{[r.building, r.capacity ? `${r.capacity} people` : ""].filter(Boolean).join(" · ")}</div>
                    <div className="hint">{r.calendarId}</div>
                  </td>
                  <td data-label="Settings">
                    <form action={saveRoom} className="stack">
                      <input type="hidden" name="room" value={r.id} />
                      <div className="row">
                        <Checkbox name="bookable" defaultChecked={r.bookable}>Bookable in the portal</Checkbox>
                        <Checkbox name="food" defaultChecked={r.food}>Food allowed</Checkbox>
                        <Checkbox name="mph" defaultChecked={r.mph}>Part of the MPH (cleaning gap)</Checkbox>
                        <Checkbox name="restricted" defaultChecked={r.restricted}>Leadership, imams and chairs only</Checkbox>
                      </div>
                      <Field label="Shares space with (booking one blocks the other)">
                        <select name="overlaps" multiple defaultValue={r.overlaps} size={Math.min(4, rooms.length - 1)}>
                          {rooms.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
        </Field>
                      <Field label="Note shown on the form (optional)">
                        <input name="note" defaultValue={r.note} maxLength={200} placeholder="$100/hour minimum food and drink purchase" />
        </Field>
                      <div><Button type="submit">Save</Button></div>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
      )}
      </Section>

      <Section open={open === "rules"} title="Event rules">
      <p className="hint">Room policy rules the event form checks. They flag requests for the reviewers; turning one off removes that flag. The calendar check can&apos;t be turned off.</p>
      <Panel>
        <form action={saveEventRules} className="stack">
        {RULES.map((rule) => (
          <Checkbox key={rule.id} name={rule.id} defaultChecked={ruleOn(settings.eventRules ?? {}, rule.id)}>{rule.name} <span className="hint">· {rule.policy}</span></Checkbox>
        ))}
        <Field label="Link to the room reservation policy (optional)" hint={<>The event form links to it next to “I&apos;ve read the room reservation policy”. Share the file with everyone at IAR.</>}>
          <input type="url" name="roomPolicyUrl" defaultValue={settings.roomPolicyUrl ?? ""} placeholder="https://drive.google.com/…" maxLength={500} />
        </Field>
        {policyFiles.length > 0 && (
          <Field label="Or pick it from the Library">
            <select name="roomPolicyFile" defaultValue={policyFiles.find((f) => f.url === settings.roomPolicyUrl)?.url ?? ""}>
              <option value="">Use the link above</option>
              {policyFiles.map((f) => (
                <option key={f.id} value={f.url}>
                  {f.name}{f.folder ? ` (${f.folder})` : ""}
                </option>
              ))}
            </select>
        </Field>
        )}
        <div><Button type="submit">Save rules</Button></div>
      </form>
      </Panel>
      </Section>

      <Section open={open === "library"} id="library" title="Library: the Policies drive">
      <p className="hint">
        The Library lists IAR&apos;s Policies Shared Drive for everyone at IAR, read-only; files open in Google Drive. To connect it, add{" "}
        {reader ? <code>{reader}</code> : "the portal's service account"} to the drive as a <strong>Viewer</strong> (Drive → the drive&apos;s name → Manage members), then paste the drive&apos;s address here.
      </p>
      <Panel>
        <form action={savePoliciesDrive} className="stack">
        <Field label="Policies drive (its address from the browser, or its ID)" hint={<>{library.state === "ok"
              ? `Connected: ${library.library.files.length} files in ${library.library.folders.length} folders.`
              : library.state === "error"
                ? "Set, but the portal can't read it. Check the service account is a Viewer on the drive."
                : "Not connected. Leave empty to keep the Library off."}</>}>
          <input name="policiesDrive" defaultValue={settings.policiesDrive ? `https://drive.google.com/drive/folders/${settings.policiesDrive}` : ""} placeholder="https://drive.google.com/drive/folders/…" maxLength={300} />
        </Field>
        <div><Button type="submit">Save</Button></div>
      </form>
      </Panel>
      </Section>

      <Section title="Google Chat spaces">
      <p className="hint">Alerts for a role or team are posted in its Chat space. go-live creates the spaces and fills these in.</p>
      <DataTable framed>
          <tbody>
            {Object.entries(settings.chatSpaces ?? {}).length === 0 ? (
              <tr><td className="hint">No Chat spaces yet. Until go-live sets them up, role alerts go to the role&apos;s group by email.</td></tr>
            ) : (
              Object.entries(settings.chatSpaces ?? {}).map(([role, space]) => (
                <tr key={role}>
                  <td>{SPACE_LABEL[role] ?? role}</td>
                  <td><code>{space}</code></td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
      </Section>

      <Section open={open === "cards"} title="IAR cards">
      <p className="hint">Only the last four digits are stored. Each month the cardholder sends receipts for the card&apos;s charges, choosing a sub-account for each, so one card can pay for several committees.</p>
      {settings.cards.length > 0 && (
        <DataTable framed>
            <thead>
              <tr>
                <th>Card</th>
                <th>Cardholder</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {settings.cards.map((c) => (
                <tr key={c.last4}>
                  <td data-label="Card">···{c.last4}</td>
                  <td data-label="Cardholder">{c.holderName}<div className="hint">{c.holderEmail}</div></td>
                  <td>
                    <form action={removeCard}>
                      <input type="hidden" name="last4" value={c.last4} />
                      <Button type="submit" variant="quiet" size="small">
                        Remove
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
      )}
      <Panel title="Add a card">
      <form action={addCard} className="grid">
        <Field label="Last four digits">
          <input name="last4" inputMode="numeric" maxLength={4} pattern="\d{4}" required />
        </Field>
        <Field label={<>Cardholder&apos;s name</>}>
          <input name="holderName" required />
        </Field>
        <Field label={<>Cardholder&apos;s email</>}>
          <input name="holderEmail" type="email" placeholder={`name@${ORG.domain}`} required />
        </Field>
        <div>
          <Button type="submit">Add card</Button>
        </div>
      </form>
      </Panel>
      {settings.updatedAt && <p className="hint">Last changed {fmtDateTime(settings.updatedAt)} by {settings.updatedBy}.</p>}
      </Section>

      <Section open={open === "support"} id="support" title="Sign in as someone">
        <p className="hint">
          To troubleshoot, see the portal exactly as someone else does, and do what they can, for up to an hour. Anything you save is marked as done by you on
          their behalf, and each start, stop and save is kept in the log below. To stop from any tab, open{" "}
          <a href="/admin/stop-signing-in-as">/admin/stop-signing-in-as</a>.
        </p>
        {isDevAuth() ? (
          <Note>In dev mode, switch sample users at /dev instead.</Note>
        ) : (
          <Panel title="Sign in as">
            <form action={startActingAs} className="stack">
              <PeoplePicker
                name="email"
                label="Who"
                people={signInChoices}
                required
                hint="Everyone who can use the portal."
              />
              <div>
                <Button type="submit">Sign in as them</Button>
              </div>
            </form>
          </Panel>
        )}
        {auditLog.length > 0 && (
          <DataTable framed>
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Signed in as</th>
                <th>What</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((a, i) => (
                <tr key={i}>
                  <td data-label="When">{fmtDateTime(a.at)}</td>
                  <td data-label="Admin">{a.admin}</td>
                  <td data-label="Signed in as">{a.target}</td>
                  <td data-label="What">{a.action}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>
    </>
  );
}
