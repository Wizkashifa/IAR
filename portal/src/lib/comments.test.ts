/**
 * Naming people in comments with @. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findMentions, mentionParts } from "./comments";

const sam = { email: "Sam@x.org", name: "Sam Lee" };
const samira = { email: "samira@x.org", name: "Samira Khan" };
const sa = { email: "sa@x.org", name: "Sam" };

test("mentions: whole names only, longest first, each person once, never the commenter", () => {
  assert.deepEqual(findMentions("@Sam Lee can you look? cc @samira khan", [sa, sam, samira], "me@x.org"), [
    { email: "samira@x.org", name: "Samira Khan" },
    { email: "sam@x.org", name: "Sam Lee" },
  ]);
  assert.deepEqual(findMentions("@Samira", [sa], "me@x.org"), []);
  assert.deepEqual(findMentions("@Sam, thanks. @Sam again", [sa], "me@x.org"), [{ email: "sa@x.org", name: "Sam" }]);
  assert.deepEqual(findMentions("note to self @Sam Lee", [sam], "sam@x.org"), []);
  assert.deepEqual(findMentions("email sam about it", [sa], "me@x.org"), []);
});

test("mention parts: picks out each named person in the words", () => {
  const mentions = [{ email: "sam@x.org", name: "Sam Lee" }];
  assert.deepEqual(mentionParts("Hi @sam lee, see above", mentions), [{ text: "Hi " }, { text: "@sam lee", mention: mentions[0] }, { text: ", see above" }]);
  assert.deepEqual(mentionParts("No one named", []), [{ text: "No one named" }]);
});
