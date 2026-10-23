import { redirect } from "next/navigation";
import { directory } from "@/lib/groups";
import { ORG } from "@/lib/org";
import { portalSettings } from "@/lib/portal-settings";
import { FUNDS, shortFund } from "@/lib/purchases/accounts";
import { QUEUE_ROLES, effectiveTeamFunds, groupSlug, pillarsOf, suggestFund, teamPeople } from "@/lib/teams";
import { requireViewer } from "@/lib/viewer";
import { fmtDateTime } from "../purchases/ui";
import { addCard, removeCard, saveTeamFund } from "./actions";

export const dynamic = "force-dynamic";

const GOOGLE_GROUPS = "https://admin.google.com/ac/groups";
const QUEUE_LABEL: Record<string, string> = { marketing: "Marketing queue", facilities: "Facilities queue", security: "Security queue", sw: "Restricted S&W purchase requests", shura: "Shura", it: "IT queue", av: "A/V queue" };
const ROLE_LABEL: Record<string, string> = {
  office: "Rentals, run sheet; submits for any committee",
  finance: "Finance review, payment, QuickBooks, restricted S&W requests; submits for any fund",
  executive: "Executive offices (Head Imam, Shura chair, CEO): final mission review of events, and executive approvals. One person can hold several",
  admins: "Sees everything and this page; never approves or pays",
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const viewer = await requireViewer();
  if (!viewer.actingRoles.includes("admins")) redirect("/");
  const [dir, settings] = await Promise.all([directory(), portalSettings()]);
  const funds = effectiveTeamFunds(dir, settings.teamFunds, FUNDS);
  const teams = [...dir.teams].sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (g: string) => dir.teams.find((t) => t.email === g)?.name ?? g;
  const gaps = teams.filter((t) => teamPeople(dir, t.email).chairs.length === 0 || !funds[t.email]).length;
  const beta = process.env.PORTAL_ACCESS_GROUP;

  return (
    <>
      <h1>Portal Settings</h1>
      <p className="lead">
        Who is on each committee or team, who chairs it and who directs it all come from Google Groups. Change people in{" "}
        <a href={GOOGLE_GROUPS} target="_blank" rel="noopener noreferrer">Google Admin → Groups</a>; the portal picks it up within 15 minutes. Here you set
        which fund each team charges and IAR&apos;s cards.
      </p>
      {ok && <div className="flash" role="status">{ok}</div>}
      {error && <div className="callout bad" role="alert">{error}</div>}

      <h2>Committees and teams ({teams.length})</h2>
      <p className="note">
        Each is a group named <code>portal-team-…@{ORG.domain}</code>. In the group, the Owner is the chair, a Manager is the vice chair (the backup
        approver), and Members are members. {gaps ? `${gaps} need a chair or a fund.` : "Every team has a chair and a fund."}
      </p>
      {teams.length === 0 ? (
        <div className="panel empty">No portal-team groups found in Google yet. Create them in Google Admin → Groups (see docs/setup.md).</div>
      ) : (
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Chair</th>
                <th>Vice chair</th>
                <th>Director</th>
                <th className="num">People</th>
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
                    <td>
                      <strong>{t.name}</strong>
                      <div className="sub">{t.email}</div>
                      {queue && <div className="sub">Also gives: {queue}</div>}
                    </td>
                    <td>{p.chairs.length ? p.chairs.join(", ") : <span className="pill changes_requested">No chair</span>}</td>
                    <td>{p.vices.join(", ") || <span className="sub">None</span>}</td>
                    <td>{p.directors.join(", ") || <span className="sub">None</span>}</td>
                    <td className="num">{p.memberCount}</td>
                    <td>
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
                        <button className="button secondary" type="submit">Save</button>
                      </form>
                      <div className="sub">{saved ? "Saved" : suggested ? "Using the suggestion" : <span className="pill changes_requested">Needs a fund</span>}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>Directors</h2>
      <p className="note">
        Each pillar is a group named <code>portal-pillar-…@{ORG.domain}</code>. Its Owner is the director, and its members are the team groups they
        oversee. A director sees those committees&apos; requests and can approve them alongside the chair, except Social &amp; Welfare.
      </p>
      {pillarsOf(dir).length === 0 ? (
        <div className="panel empty">No portal-pillar groups found yet.</div>
      ) : (
        <div className="tablewrap">
          <table className="table">
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
                  <td>
                    <strong>{p.name}</strong>
                    <div className="sub">{p.group}</div>
                  </td>
                  <td>{p.directors.join(", ") || <span className="pill changes_requested">No director</span>}</td>
                  <td>{p.teams.map(nameOf).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Role groups</h2>
      <p className="note">Portal-wide jobs. Add people as members in Google Admin.</p>
      <div className="tablewrap">
        <table className="table">
          <tbody>
            {Object.entries(ORG.roleGroups).map(([role, group]) => (
              <tr key={role}>
                <td><code>{group}</code></td>
                <td>{ROLE_LABEL[role]}</td>
              </tr>
            ))}
            {beta && (
              <tr>
                <td><code>{beta}</code></td>
                <td>During the beta, only this group and the admins can sign in</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>IAR cards</h2>
      <p className="note">Only the last four digits are stored. The cardholder can submit receipts for the card each month.</p>
      {settings.cards.length > 0 && (
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Card</th>
                <th>Cardholder</th>
                <th>Fund</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {settings.cards.map((c) => (
                <tr key={c.last4}>
                  <td>···{c.last4}</td>
                  <td>{c.holderName}<div className="sub">{c.holderEmail}</div></td>
                  <td>{shortFund(c.fund)}</td>
                  <td>
                    <form action={removeCard}>
                      <input type="hidden" name="last4" value={c.last4} />
                      <button className="button secondary" type="submit">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form action={addCard} className="panel grid2" style={{ marginTop: 12 }}>
        <label className="field">
          <span>Last four digits</span>
          <input name="last4" inputMode="numeric" maxLength={4} pattern="\d{4}" required />
        </label>
        <label className="field">
          <span>Cardholder&apos;s name</span>
          <input name="holderName" required />
        </label>
        <label className="field">
          <span>Cardholder&apos;s email</span>
          <input name="holderEmail" type="email" placeholder={`name@${ORG.domain}`} required />
        </label>
        <label className="field">
          <span>Fund</span>
          <select name="fund" required defaultValue="">
            <option value="">Choose…</option>
            {FUNDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button className="button" type="submit">Add card</button>
        </div>
      </form>
      {settings.updatedAt && <p className="note">Last changed {fmtDateTime(settings.updatedAt)} by {settings.updatedBy}.</p>}
    </>
  );
}
