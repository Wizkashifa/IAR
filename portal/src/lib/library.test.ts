/**
 * The Library: the drive link an admin pastes, folders, review dates, search,
 * and which file a form links to. Run with `npm test`. (library.ts itself is
 * server-only; these are its plain functions.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLibrary, driveSearchQuery, kindOf, matchFiles, parseDriveId, reviewDate, reviewState, type DriveItem } from "./library-core";
import { policyFile } from "./policy-links";

const DRIVE = "0AbCdEfGhIjKlUk9PVA";
const DIR = "application/vnd.google-apps.folder";

test("library: the drive ID from its address, or the ID itself", () => {
  assert.equal(parseDriveId(`https://drive.google.com/drive/folders/${DRIVE}`), DRIVE);
  assert.equal(parseDriveId(`https://drive.google.com/drive/u/1/folders/${DRIVE}?usp=sharing`), DRIVE);
  assert.equal(parseDriveId(`  ${DRIVE}  `), DRIVE);
  assert.equal(parseDriveId("https://example.com/drive/folders/abc"), null);
  assert.equal(parseDriveId("not a drive"), null);
  assert.equal(parseDriveId(""), null);
});

test("library: review date from the description or a property", () => {
  assert.equal(reviewDate({ description: "Approved by the Shura. Review by 2027-01-23." }), "2027-01-23");
  assert.equal(reviewDate({ description: "review: 2027-03-01" }), "2027-03-01");
  assert.equal(reviewDate({ properties: { reviewBy: "2026-12-01" }, description: "Review by 2027-01-01" }), "2026-12-01");
  assert.equal(reviewDate({ description: "Updated 2026-01-01" }), undefined);
  assert.equal(reviewDate({}), undefined);
});

test("library: review pill is red when overdue, warn within 30 days, plain after", () => {
  assert.equal(reviewState("2026-10-01", "2026-10-25").tone, "bad");
  assert.match(reviewState("2026-10-01", "2026-10-25").label, /overdue since Oct 1, 2026/);
  assert.equal(reviewState("2026-10-25", "2026-10-25").label, "Review due today");
  assert.equal(reviewState("2026-11-20", "2026-10-25").tone, "warn");
  assert.equal(reviewState("2027-05-01", "2026-10-25").tone, "neutral");
});

test("library: files under their top-level folder, newest first, with kinds", () => {
  const items: DriveItem[] = [
    { id: "rooms", name: "Rooms and rentals", mimeType: DIR, parents: [DRIVE] },
    { id: "old", name: "Old versions", mimeType: DIR, parents: ["rooms"] },
    { id: "a", name: "Room reservation policy", mimeType: "application/vnd.google-apps.document", parents: ["rooms"], modifiedTime: "2026-03-01T00:00:00Z", description: "Review by 2026-10-01" },
    { id: "b", name: "Room policy 2019", mimeType: "application/pdf", parents: ["old"], modifiedTime: "2019-01-01T00:00:00Z" },
    { id: "c", name: "Welcome", mimeType: "application/msword", parents: [DRIVE], modifiedTime: "2026-09-01T00:00:00Z", webViewLink: "https://drive.google.com/file/d/c/view" },
    { id: "lost", name: "Orphan", mimeType: "application/pdf", parents: ["gone"], modifiedTime: "2026-01-01T00:00:00Z" },
  ];
  const lib = buildLibrary(items, DRIVE);
  assert.deepEqual(lib.folders, [{ id: "rooms", name: "Rooms and rentals", count: 2 }]);
  assert.deepEqual(lib.files.map((f) => [f.id, f.folder]), [["c", ""], ["a", "Rooms and rentals"], ["lost", ""], ["b", "Rooms and rentals"]]);
  assert.equal(lib.files.find((f) => f.id === "a")?.reviewBy, "2026-10-01");
  assert.equal(lib.files.find((f) => f.id === "a")?.url, "https://drive.google.com/file/d/a/view");
  assert.equal(lib.files.find((f) => f.id === "c")?.kind.label, "Word document");
  assert.equal(kindOf("application/pdf").icon, "receipt");
  assert.equal(kindOf("image/png").label, "File");
});

test("library: Drive search query escapes quotes; local match needs every word", () => {
  assert.equal(driveSearchQuery("imam's office"), "trashed = false and mimeType != 'application/vnd.google-apps.folder' and (name contains 'imam\\'s office' or fullText contains 'imam\\'s office')");
  const lib = buildLibrary(
    [
      { id: "p", name: "Purchasing and reimbursement policy", mimeType: "application/pdf", parents: [DRIVE] },
      { id: "r", name: "Room reservation policy", mimeType: "application/pdf", parents: [DRIVE] },
    ],
    DRIVE,
  );
  assert.deepEqual(matchFiles(lib.files, "room policy").map((f) => f.id), ["r"]);
  assert.deepEqual(matchFiles(lib.files, "POLICY").map((f) => f.id).sort(), ["p", "r"]);
  assert.deepEqual(matchFiles(lib.files, "  "), []);
});

test("library: a form links the current policy, never the archive or a draft", () => {
  const lib = buildLibrary(
    [
      { id: "arch", name: "Archive", mimeType: DIR, parents: [DRIVE] },
      { id: "new", name: "Room reservation policy", mimeType: "application/pdf", parents: [DRIVE], modifiedTime: "2026-01-01T00:00:00Z" },
      { id: "old", name: "Room reservation policy", mimeType: "application/pdf", parents: ["arch"], modifiedTime: "2026-06-01T00:00:00Z" },
      { id: "v23", name: "Room reservation policy (2023 version)", mimeType: "application/pdf", parents: [DRIVE], modifiedTime: "2026-07-01T00:00:00Z" },
      { id: "draft", name: "Room use policy draft", mimeType: "application/pdf", parents: [DRIVE], modifiedTime: "2026-08-01T00:00:00Z" },
    ],
    DRIVE,
  );
  assert.equal(policyFile("rooms", lib.files)?.id, "new");
  assert.equal(policyFile("purchasing", lib.files), undefined);
});
