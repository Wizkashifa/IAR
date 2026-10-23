/**
 * The email to IAR's DNS manager asking for the portal's address records
 * (Email B in the plan). go-live only ever saves it as a draft in the admin's
 * own Gmail; the admin reads it and sends it.
 */
import type { DnsRecord } from "./google";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function dnsEmail(o: { host: string; domain: string; records: DnsRecord[]; managerName: string; adminName: string }) {
  const subject = `DNS records for ${o.host} (new IAR Portal)`;
  const rows = o.records.map((r) => ({ type: r.type, name: r.name || o.host, value: r.value, ttl: r.ttl ?? "3600" }));
  const w = (k: "type" | "name" | "value" | "ttl", head: string) => Math.max(head.length, ...rows.map((r) => r[k].length));
  const widths = { type: w("type", "Type"), name: w("name", "Name"), value: w("value", "Value"), ttl: w("ttl", "TTL") };
  const line = (t: string, n: string, v: string, l: string) => `  ${t.padEnd(widths.type)}  ${n.padEnd(widths.name)}  ${v.padEnd(widths.value)}  ${l}`;
  const table = [line("Type", "Name", "Value", "TTL"), ...rows.map((r) => line(r.type, r.name, r.value, r.ttl))];
  const notes = [
    "Please don't change any existing records, especially MX (email) and the existing Google verification records. These are additions only.",
    "If the zone has CAA records, please make sure pki.goog and letsencrypt.org are allowed, so Google can issue the security certificate. If there are no CAA records, nothing is needed.",
    `Once it's in, \`nslookup ${o.host}\` should show the value above. The secure certificate then takes up to a day to appear on Google's side, and there's nothing more to do on yours.`,
  ];
  const text = [
    `Assalamu alaikum ${o.managerName},`,
    "",
    `We're launching the IAR Portal on IAR's Google Cloud, and it needs its own address, ${o.host}. Could you add the following to the ${o.domain} DNS zone?`,
    "",
    ...table,
    "",
    "Notes:",
    ...notes.map((n) => `- ${n}`),
    "",
    "Could you reply when it's added? JazakAllahu khairan.",
    "",
    o.adminName,
  ].join("\n");
  const td = 'style="border:1px solid #ccc;padding:4px 8px;font-family:monospace"';
  const html = [
    `<p>Assalamu alaikum ${esc(o.managerName)},</p>`,
    `<p>We're launching the IAR Portal on IAR's Google Cloud, and it needs its own address, ${esc(o.host)}. Could you add the following to the ${esc(o.domain)} DNS zone?</p>`,
    `<table style="border-collapse:collapse"><tr><th ${td}>Type</th><th ${td}>Name</th><th ${td}>Value</th><th ${td}>TTL</th></tr>`,
    ...rows.map((r) => `<tr><td ${td}>${esc(r.type)}</td><td ${td}>${esc(r.name)}</td><td ${td}>${esc(r.value)}</td><td ${td}>${esc(r.ttl)}</td></tr>`),
    "</table>",
    "<p>Notes:</p><ul>",
    ...notes.map((n) => `<li>${esc(n).replace(/`([^`]+)`/g, "<code>$1</code>")}</li>`),
    "</ul>",
    "<p>Could you reply when it's added? JazakAllahu khairan.</p>",
    `<p>${esc(o.adminName)}</p>`,
  ].join("\n");
  return { subject, text, html };
}
