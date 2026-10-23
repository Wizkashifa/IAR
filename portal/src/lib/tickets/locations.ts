/**
 * Where a problem is: the list the ticket form offers. A ticket stores the
 * location as plain text, so this list can change (the Events module will
 * later supply IAR's rooms from Google Calendar) without touching old
 * tickets. Room names are from the Program Request Form.
 */

export const LOCATIONS: string[] = [
  "MPH A – half gym",
  "MPH B – half gym",
  "MPH A&B – full gym",
  "Al-Maidah Cafe",
  "Main Prayer Hall",
  "Room behind Main Prayer Hall",
  "Room 220 – children's play room",
  "Room 230A – glass room",
  "Room 230B – glass room",
  "Room 240 – conference room",
  "Room 250 – An Noor meeting room",
  "Room 280 – EC meeting room",
  "Women's Prayer Hall",
  "3rd floor – Arabic Islamic Studies",
  "3rd floor – Language Arts",
  "3rd floor – Math classroom",
  "Red Brick – Arabic Islamic Studies",
  "Red Brick – Grade 1 room",
  "Community Flex Room",
  "Fire Pit Area",
  "Admin office",
  "Outside / parking",
  "Whole building",
  "Other",
];

/** Where it goes when nothing better is known (an imported Jira issue with no location). */
export const UNKNOWN_LOCATION = "Other";

/** Places that aren't rooms: always offered. */
const NOT_ROOMS = ["Admin office", "Outside / parking", "Whole building", "Other"];

/** The locations to offer: IAR's rooms from Google (every room, bookable or not), then places that aren't rooms. The fixed list until Google has rooms. */
export function locationChoices(roomNames: string[] = []): string[] {
  if (!roomNames.length) return LOCATIONS;
  return [...new Set([...roomNames, ...NOT_ROOMS])];
}
