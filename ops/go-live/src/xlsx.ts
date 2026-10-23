/**
 * A small .xlsx writer for the members template, so the office can open it in
 * Excel or upload it to Google Drive as a Sheet without anyone running
 * go-live first. Bold, frozen header rows; dropdowns from a hidden "Lists"
 * sheet. No dependencies: an .xlsx is a zip of XML files, stored uncompressed.
 */
import type { Tab } from "./sheet";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const sheetRef = (name: string) => `'${name.replace(/'/g, "''")}'`;

function cellXml(ref: string, v: string, style: number): string {
  const s = style ? ` s="${style}"` : "";
  if (/^-?\d+(\.\d+)?$/.test(v) && !/^0\d/.test(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(tab: Tab, listRefs: Map<string, string>, headed = true): string {
  const rows = [tab.header, ...tab.rows];
  const cols = (tab.widths ?? []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const data = rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === "" ? "" : cellXml(`${colName(ci)}${ri + 1}`, v, headed && ri === 0 ? 1 : 0))).join("")}</row>`)
    .join("");
  const last = Math.max(rows.length + 200, 300);
  const dv = Object.entries(tab.lists ?? {}).map(([ci, values]) => {
    const c = colName(Number(ci));
    return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${c}2:${c}${last}"><formula1>${esc(listRefs.get(values.join("\u0001"))!)}</formula1></dataValidation>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    headed ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "",
    cols ? `<cols>${cols}</cols>` : "",
    `<sheetData>${data}</sheetData>`,
    dv.length ? `<dataValidations count="${dv.length}">${dv.join("")}</dataValidations>` : "",
    "</worksheet>",
  ].join("");
}

/** The workbook's files, with a hidden "Lists" sheet holding every dropdown's values. */
export function workbookFiles(tabs: Tab[]): { name: string; data: string }[] {
  const lists: string[][] = [];
  const listRefs = new Map<string, string>();
  for (const t of tabs) for (const values of Object.values(t.lists ?? {})) {
    const key = values.join("\u0001");
    if (listRefs.has(key)) continue;
    const c = colName(lists.length);
    lists.push(values);
    listRefs.set(key, `${sheetRef("Lists")}!$${c}$1:$${c}$${values.length}`);
  }
  const height = Math.max(0, ...lists.map((l) => l.length));
  // The Lists sheet has no header: its first row is each list's first value.
  const listTab: Tab = { name: "Lists", header: lists.map((l) => l[0] ?? ""), rows: [], hidden: true };
  for (let r = 1; r < height; r++) listTab.rows.push(lists.map((l) => l[r] ?? ""));

  const all = [...tabs, listTab];
  const sheets = all.map((t, i) => `<sheet name="${esc(t.name)}" sheetId="${i + 1}"${t.hidden ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`).join("");
  return [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${all.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${all.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${all.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" xfId="0"/><xf fontId="1" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    },
    ...tabs.map((t, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(t, listRefs) })),
    { name: `xl/worksheets/sheet${all.length}.xml`, data: sheetXml(listTab, listRefs, false) },
  ];
}

// ---- Zip (stored, no compression) -----------------------------------------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files: { name: string; data: string }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.from(f.data, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(0x00210000, 10); // a fixed date (1980-01-01): the file is the same every time it's built
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt32LE(0x00210000, 12);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

export function xlsx(tabs: Tab[]): Buffer {
  return zip(workbookFiles(tabs));
}
