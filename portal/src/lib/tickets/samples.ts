import "server-only";
import { todayLocal } from "../away";
import type { Card } from "../cards";
import type { Role } from "../org";
import { addFrequency, type TicketSchedule } from "./schedules";
import * as wf from "./workflow";

/**
 * Sample tickets and preventive schedules for local development, built by
 * running the real workflow so every status, history line and permission is
 * what the app would produce. Problems are made up; the rooms are IAR's.
 * There's one of each thing to try: a new ticket to pick up, one waiting
 * past its response time (the daily job reminds), one marked fixed a week
 * ago (the daily job closes it), and one waiting for Sample Volunteer to confirm.
 */

const person = (email: string, name: string, roles: Role[], leads: wf.TicketActor["leads"] = []): wf.TicketActor => ({ email, name, roles, leads });
const volunteer = person("volunteer@dev.local", "Sample Volunteer", ["member"]);
const chair = person("chair@dev.local", "Sample Chair", ["member", "chairs", "facilities"], ["facilities"]);
const office = person("office@dev.local", "Sample Office", ["member", "office"]);
const facilities = person("facilities@dev.local", "Sample Facilities", ["member", "facilities"]);
const it = person("it@dev.local", "Sample IT", ["member", "it", "av"]);

const MEMBERS = { facilities: ["chair@dev.local", "facilities@dev.local", "vice@dev.local"], it: ["it@dev.local"] };

export function sampleTickets(): Card[] {
  const t = (daysAgo: number, hour = 10) => {
    const d = new Date(Date.now() - daysAgo * 864e5);
    d.setUTCHours(hour + 4, 0, 0, 0);
    return d.toISOString();
  };
  let n = 1001;
  const make = (reporter: wf.TicketActor, input: wf.NewTicketInput, at: string) => {
    const c = wf.newTicket(input, reporter, at);
    c.id = `TK-${n++}`;
    return c;
  };
  const out: Card[] = [];

  // Urgent, picked up and being worked on.
  let c = make(office, { team: "facilities", kind: "request", title: "MPH is not cooling before Family Night", room: "MPH A&B – full gym", equipment: "Rooftop HVAC unit 2", urgency: "urgent", description: "It's 84°F inside and setup starts at 4.\nThe unit 2 compressor sounds like it's struggling." }, t(2, 9));
  c = wf.assign(c, facilities, t(2, 10), facilities.email, MEMBERS.facilities);
  c = wf.start(c, facilities, t(1, 11));
  out.push(c);

  // New: waiting for someone to pick it up.
  out.push(make(volunteer, { team: "facilities", kind: "request", title: "Wudu area faucet on the left keeps dripping", room: "Women's Prayer Hall", urgency: "normal", description: "The left faucet drips all the time, even when it's turned off all the way." }, t(1, 18)));

  // Waiting on parts.
  c = make(chair, { team: "facilities", kind: "request", title: "Main hall side door doesn't latch", room: "Main Prayer Hall", equipment: "Side door by the shoe racks", urgency: "high", description: "The door swings open in the wind. It's chained shut for now." }, t(5, 9));
  c = wf.assign(c, chair, t(5, 10), facilities.email, MEMBERS.facilities);
  c = wf.start(c, facilities, t(4, 9));
  c = wf.waitForParts(c, facilities, t(4, 15), "New strike plate ordered from the locksmith, due Thursday.");
  out.push(c);

  // High, nobody has started it: the daily job sends one reminder.
  c = make(volunteer, { team: "it", kind: "request", title: "Projector in Room 240 flickers", room: "Room 240 – conference room", equipment: "Ceiling projector", urgency: "high", description: "The picture flickers every few seconds on HDMI." }, t(1, 8));
  c.ticket.watchers.push(office.email);
  out.push(c);

  // Marked fixed 8 days ago and never confirmed: the daily job closes it.
  c = make(office, { team: "it", kind: "request", title: "Office printer jams on tray 2", room: "Admin office", equipment: "Office printer", urgency: "normal", description: "Paper jams about every 20 pages from tray 2." }, t(10, 9));
  c = wf.start(c, it, t(9, 10));
  c = wf.resolve(c, it, t(8, 14), "Replaced the tray 2 pickup roller.");
  out.push(c);

  // Fixed yesterday: Sample Volunteer is asked to confirm.
  c = make(volunteer, { team: "it", kind: "request", title: "Wi-Fi drops in the conference room", room: "Room 240 – conference room", urgency: "normal", description: "Wi-Fi drops every few minutes, mostly on video calls." }, t(3, 13));
  c = wf.assign(c, it, t(3, 15), it.email, MEMBERS.it);
  c = wf.start(c, it, t(2, 10));
  c = wf.resolve(c, it, t(1, 16), "Moved the access point off the crowded channel and updated its firmware.");
  out.push(c);

  // Done and confirmed.
  c = make(volunteer, { team: "facilities", kind: "request", title: "Replace burnt-out lights by the east entrance", room: "Outside / parking", urgency: "low", description: "Two light poles by the east entrance are dark after Isha." }, t(14, 20));
  c = wf.assign(c, facilities, t(13, 9), facilities.email, MEMBERS.facilities);
  c = wf.resolve(c, facilities, t(12, 15), "Replaced both bulbs.");
  c = wf.confirm(c, volunteer, t(11, 19));
  out.push(c);

  return out;
}

/** Two schedules: one due today (run the daily job on /dev to open its ticket) and one next week. */
export function sampleSchedules(): TicketSchedule[] {
  const today = todayLocal();
  const at = new Date(Date.now() - 30 * 864e5).toISOString();
  const base = { createdAt: at, updatedAt: at, paused: false };
  return [
    {
      ...base,
      id: "PM-1",
      team: "facilities",
      name: "HVAC filter check",
      frequency: "monthly",
      next: addFrequency(today, "weekly"),
      room: "Main Prayer Hall",
      equipment: "Rooftop HVAC units 1 and 2",
      description: "Inspect and replace the filters on both rooftop units. Note the supply air temperature.",
      urgency: "normal",
      assigneeEmail: "facilities@dev.local",
      createdBy: "chair@dev.local",
    },
    {
      ...base,
      id: "PM-2",
      team: "it",
      name: "Printer toner and paper check",
      frequency: "weekly",
      next: today,
      room: "Admin office",
      equipment: "Office printer",
      urgency: "low",
      createdBy: "it@dev.local",
    },
  ];
}
