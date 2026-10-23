/**
 * Writes members-template.xlsx: the blank members Sheet (no people), for the
 * office to upload to IAR's Drive and fill in. `npm run template:xlsx`.
 * go-live --template makes the same Sheet straight in Google Drive.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { templateTabs } from "./sheet";
import { xlsx } from "./xlsx";

const domain = process.argv[2] ?? "islam1.org";
const out = join(__dirname, "..", "..", "..", "..", "members-template.xlsx");
writeFileSync(out, xlsx(templateTabs(domain)));
console.log(`Wrote ${out}`);
