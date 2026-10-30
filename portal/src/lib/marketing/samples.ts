import "server-only";
import type { Card } from "../cards";
import type { Role } from "../org";
import { addDays, todayLocal } from "../dates";
import { parseMarketingInput, type MarketingInput } from "./forms";
import * as wf from "./workflow";

/**
 * Sample marketing requests for local development, built by running the real
 * workflow so every stage, history line and permission is what the app would
 * produce. Sample people are the dev personas (lib/dev.ts); requests are made up.
 */

const person = (email: string, name: string, roles: Role[]): wf.Actor => ({ email, name, roles });
const volunteer = person("volunteer@dev.local", "Sample Volunteer", ["member"]);
const chair = person("chair@dev.local", "Sample Chair", ["member", "chairs"]);
const office = person("office@dev.local", "Sample Office", ["member", "office"]);
const facilities = person("facilities@dev.local", "Sample Facilities", ["member", "facilities"]);
const marketing = person("marketing@dev.local", "Sample Marketing", ["member", "marketing"]);

export function sampleMarketing(): Card[] {
  const t = (daysAgo: number, hour = 10) => {
    const d = new Date(Date.now() - daysAgo * 864e5);
    d.setUTCHours(hour + 4, 0, 0, 0);
    return d.toISOString();
  };
  const today = todayLocal();
  const ahead = (n: number) => addDays(today, n);
  let n = 1001;
  const make = (owner: wf.Actor, input: MarketingInput, daysAgo: number) => {
    // Checked against the day it was "submitted", so a due date that's now close still passes.
    const r = parseMarketingInput(input, { today: todayLocal(new Date(t(daysAgo))), committees: [input.committee] });
    if (!r.ok) throw new Error(`Bad sample: ${r.errors.join("; ")}`);
    const c = wf.newMarketing(r.details, owner, t(daysAgo));
    c.id = `MK-${n++}`;
    return c;
  };
  const out: wf.MarketingCard[] = [];

  // Done: a custom redirect.
  let c = make(office, { kind: "redirect", committee: "Administration", answers: { from: "raleighmasjid.org/rooms", to: "https://forms.gle/room-request-example" } }, 20);
  c = wf.schedule(c, marketing, t(14), ahead(-10));
  c = wf.start(c, marketing, t(12));
  c = wf.finish(c, marketing, t(10), "Live at raleighmasjid.org/rooms.");
  out.push(c);

  // In progress, due in two days.
  c = make(chair, {
    kind: "highlight", committee: "Youth",
    answers: { desc: "Our youth basketball team won the regional Muslim youth tournament. Shout-out to the players and their coaches.", due: ahead(3) },
    driveLink: "https://drive.google.com/drive/folders/youth-basketball-final",
  }, 8);
  c = wf.schedule(c, marketing, t(3), ahead(2));
  c = wf.start(c, marketing, t(1));
  out.push(c);

  // Scheduled, due tomorrow: the daily job reminds the team.
  c = make(chair, {
    kind: "announce", committee: "Imam Office",
    answers: { text: "The IAR Food Pantry is now open Wednesdays 10 AM - 12 PM as well as Saturdays. Families in need can visit or call the office. Volunteers are welcome too!", due: ahead(2) },
  }, 6);
  c = wf.schedule(c, marketing, t(3), ahead(1));
  out.push(c);

  // Marketing asked the volunteer a question.
  c = make(volunteer, {
    kind: "graphic", committee: "Youth",
    answers: { desc: "A certificate for the kids who finish the summer Quran reading challenge. Our logo and last year's design are in the Drive folder.", due: ahead(16) },
    driveLink: "https://drive.google.com/drive/folders/quran-challenge-certificate",
  }, 5);
  c = wf.ask(c, marketing, t(2), "How many certificates, and should each one have the child's name printed, or a blank line?");
  out.push(c);

  // New: a staff badge.
  c = make(facilities, { kind: "badge", committee: "Facility Maintenance", answers: { first: "New", last: "Hire", title: "Facilities Technician", photo: "onsite" }, notes: "For the facilities technician starting next week." }, 1);
  out.push(c);

  // New, needed soon.
  c = make(volunteer, { kind: "signage", committee: "Education", answers: { desc: "Room signs for the new weekend classrooms on the second floor: 2A, 2B and 2C.", due: ahead(9) } }, 0);
  out.push(c);

  // Declined.
  c = make(volunteer, { kind: "webpage", committee: "Youth", answers: { desc: "A page for each youth sports team with rosters and photos." } }, 12);
  c = wf.decline(c, marketing, t(7), "We don't publish rosters or photos of minors on the website. We can make one page for the youth sports program instead: submit a new request if that helps.");
  out.push(c);

  return out;
}
