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

/** The locations to offer, today the fixed list. Swap this for rooms from Google when Events has them. */
export function locationChoices(): string[] {
  return LOCATIONS;
}
