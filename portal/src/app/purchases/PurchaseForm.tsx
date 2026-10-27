"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { FormStarted } from "@/components/FormStarted";
import { ACCOUNTS, SOCIAL_WELFARE_FUND, accountsForFund, findAccount, isLaborAccount, shortFund } from "@/lib/purchases/accounts";
import { CHECK_DELIVERIES, DELIVERY_LABEL, KIND_LABEL, type DeliveryMethod, type PurchaseKind } from "@/lib/purchases/types";
import type { VendorChoice } from "@/lib/purchases/vendors";
import type { LineInput, PurchaseInput } from "@/lib/purchases/input";
import type { EventChoice } from "@/lib/events/link";
import { Button } from "@/components/Button";
import { Field, FormActions } from "@/components/Field";
import { FileDrop } from "@/components/FileDrop";
import { Note } from "@/components/Note";
import { AddressField } from "@/components/AddressField";
import { Panel } from "@/components/Panel";
import styles from "./purchases.module.css";
import { FormErrors, type FormState } from "@/components/FormErrors";
import { Checkbox, Choice, Choices } from "@/components/Choices";
import { groupCharges, type StatementChoice } from "@/lib/purchases/statement";
import { fmtMonth } from "@/lib/format";
import { AccountOptions, CardCharges, type ChargeInput } from "./CardCharges";

type Line = LineInput & { key: number };

export type FormProps = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial?: PurchaseInput;
  requesterName: string;
  cards: { last4: string }[];
  /** Card receipts: each imported month's charges on this person's cards, most recent first. */
  statements?: StatementChoice[];
  /** Open on card receipts for this card and month (the link in "your statement is in"). */
  start?: { last4: string; month: string };
  /** Funds this person may charge: their committees and teams' (all of them for office and finance). */
  funds: string[];
  /** Saved vendors every committee shares. */
  vendors: VendorChoice[];
  /** Social & Welfare payees: only for S&W and finance, and only matched on S&W requests. */
  restrictedVendors?: VendorChoice[];
  /** The address on the requester's last reimbursement by check, to fill in. */
  lastAddress?: string;
  /** Files already on the request (editing). */
  existingFiles?: string[];
  /** A W-9 was already uploaded with this request (editing). */
  existingW9?: string;
  /** Events this person can link the purchase to (their own and their committees'). */
  events?: EventChoice[];
  submitLabel: string;
  /** Where Cancel goes. */
  cancelHref: string;
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const toNum = (v: string | number) => {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
/** The fields for each charge: as the request had them (editing), otherwise blank with the suggested sub-account. */
function chargeValues(choice: StatementChoice | undefined, initial?: LineInput[]): { values: Record<string, ChargeInput>; lumped: string[] } {
  const values: Record<string, ChargeInput> = {};
  if (!choice) return { values, lumped: [] };
  for (const c of choice.charges) {
    const was = initial?.find((l) => l.ref === c.ref);
    values[c.ref] = was
      ? { accountId: was.accountId, note: was.note ?? "", flag: was.flag ?? "", repayBy: was.repayBy ?? "" }
      : { accountId: choice.suggested[c.ref] ?? "", note: "", flag: "", repayBy: "" };
  }
  const groups = groupCharges(choice.charges);
  const lumped = initial?.length ? [...new Set(initial.map((l) => l.group).filter((g): g is string => Boolean(g)))] : groups.filter((g) => g.lumpByDefault).map((g) => g.name);
  return { values, lumped: lumped.filter((name) => groups.some((g) => g.name === name)) };
}

let keySeq = 1;
const blankLine = (): Line => ({ key: keySeq++, accountId: "", amount: "", note: "" });

const fmtW9Date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "");

const RECEIPT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
];
const W9_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/heic", "image/heif", "image/webp"];

export default function PurchaseForm({ action, initial, requesterName, cards, statements = [], start, funds, vendors, restrictedVendors = [], lastAddress = "", existingFiles = [], existingW9, events = [], submitLabel, cancelHref }: FormProps) {
  const eventChoices = initial?.eventCardId && !events.some((e) => e.id === initial.eventCardId) ? [{ id: initial.eventCardId, label: initial.eventCardId }, ...events] : events;
  const [eventCardId, setEventCardId] = useState(initial?.eventCardId ?? "");
  const fundChoices = initial?.fund && !funds.includes(initial.fund) ? [initial.fund, ...funds] : funds;
  const [state, formAction] = useActionState(action, { errors: [] });
  const [kind, setKind] = useState<PurchaseKind>((initial?.kind as PurchaseKind) ?? (start ? "card" : "pay"));
  const [fund, setFund] = useState(initial?.fund ?? "");
  const startLast4 = initial?.cardLast4 ?? start?.last4 ?? cards[0]?.last4 ?? "";
  const [cardLast4, setCardLast4] = useState(startLast4);
  const monthsFor = (last4: string) => statements.filter((x) => x.last4 === last4);
  // Start with the most recent statement this card hasn't sent receipts for.
  const firstMonth = (last4: string) => (monthsFor(last4).find((x) => !x.sentAs) ?? monthsFor(last4)[0])?.month ?? "";
  const [statementMonth, setStatementMonth] = useState(initial?.statementMonth ?? start?.month ?? firstMonth(startLast4));
  const choiceFor = (last4: string, month: string) => statements.find((x) => x.last4 === last4 && x.month === month);
  const choice = choiceFor(cardLast4, statementMonth);
  const [charges, setCharges] = useState(() => chargeValues(choice, initial?.kind === "card" ? initial.lines : undefined));
  const [description, setDescription] = useState(initial?.description ?? (start ? "Card statement receipts" : ""));
  const [payee, setPayee] = useState(initial?.payee ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber ?? "");
  // Requests are paid by check. An older request sent by ACH starts with nothing picked, so the requester chooses how the check goes.
  const initialDelivery = (initial?.delivery as DeliveryMethod | undefined) ?? "";
  const [checkTo, setCheckTo] = useState<DeliveryMethod | "">(initialDelivery && initialDelivery !== "ach" ? initialDelivery : "");
  const [mailingAddress, setMailingAddress] = useState(initial?.mailingAddress ?? "");
  const [isLabor, setIsLabor] = useState(Boolean(initial?.isLabor));
  const [relatedParty, setRelatedParty] = useState(Boolean(initial?.relatedParty));
  const [lines, setLines] = useState<Line[]>(() => (initial?.lines?.length && initial.kind !== "card" ? initial.lines.map((l) => ({ ...blankLine(), ...l })) : [blankLine()]));
  const [allFunds, setAllFunds] = useState(false);
  const [attestationName, setAttestationName] = useState(initial?.attestationName ?? "");
  const [agreed, setAgreed] = useState(Boolean(initial));

  const card = kind === "card";
  // A card isn't tied to a fund: its charges can go to any fund's sub-accounts. The server files the request under the main one.
  const chargeFund = card ? "" : fund;
  const showAllFunds = card || allFunds;
  const accountChoices = useMemo(() => (showAllFunds || !chargeFund ? ACCOUNTS : accountsForFund(chargeFund)), [showAllFunds, chargeFund]);
  const total = card ? (choice?.charges ?? []).reduce((s, c) => s + c.amount, 0) : lines.reduce((s, l) => s + toNum(l.amount), 0);
  const groups = useMemo(() => groupCharges(choice?.charges ?? []), [choice]);
  const delivery: DeliveryMethod | "" = checkTo;
  // S&W requests match only S&W payees; everything else only the shared list. The two never mix.
  const vendorList = chargeFund === SOCIAL_WELFARE_FUND ? restrictedVendors : vendors;
  const findVendor = (name: string) => vendorList.find((v) => v.name.toLowerCase() === name.trim().toLowerCase());
  const vendor = findVendor(payee);
  const laborLine = lines.some((l) => isLaborAccount(findAccount(l.accountId)));
  const labor = isLabor || laborLine;
  const w9Needed = kind === "pay" && payee.trim() !== "" && labor && !vendor?.w9OnFile;

  const choosePayee = (name: string) => {
    setPayee(name);
    const v = findVendor(name);
    if (v?.address && !mailingAddress.trim()) setMailingAddress(v.address);
  };
  const chooseKind = (k: PurchaseKind) => {
    setKind(k);
    if (k === "reimburse" && !mailingAddress.trim() && lastAddress) setMailingAddress(lastAddress);
    if (k === "card" && !description.trim()) setDescription("Card statement receipts");
  };

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Card receipts: picking another card or month starts its charges afresh.
  const chooseStatement = (last4: string, month: string) => {
    setCardLast4(last4);
    setStatementMonth(month);
    setCharges(chargeValues(choiceFor(last4, month)));
  };
  const setCharge = (ref: string, patch: Partial<ChargeInput>) => setCharges((c) => ({ ...c, values: { ...c.values, [ref]: { ...c.values[ref], ...patch } } }));
  const groupRefs = (name: string) => groups.find((g) => g.name === name)?.refs ?? [];
  const setGroup = (name: string, patch: Partial<ChargeInput>) =>
    setCharges((c) => ({ ...c, values: { ...c.values, ...Object.fromEntries(groupRefs(name).map((ref) => [ref, { ...c.values[ref], ...patch }])) } }));
  // Lumping gives every charge the first one's sub-account and reason; nothing is expected back on a lumped charge.
  const lump = (name: string, on: boolean) =>
    setCharges((c) => {
      const refs = groupRefs(name);
      const first = c.values[refs[0]];
      return {
        lumped: on ? [...c.lumped, name] : c.lumped.filter((x) => x !== name),
        values: on ? { ...c.values, ...Object.fromEntries(refs.map((ref) => [ref, { ...first, flag: "" as const, repayBy: "" }])) } : c.values,
      };
    });
  const cardLinesOut: LineInput[] = (choice?.charges ?? []).map((ch) => {
    const v = charges.values[ch.ref];
    const g = groups.find((x) => x.refs.includes(ch.ref));
    return { ref: ch.ref, amount: ch.amount, accountId: v?.accountId ?? "", note: v?.note ?? "", flag: v?.flag ?? "", repayBy: v?.repayBy ?? "", group: g && charges.lumped.includes(g.name) ? g.name : "" };
  });

  const payload: PurchaseInput = {
    kind,
    fund: chargeFund,
    description,
    payee: kind === "reimburse" ? requesterName : payee,
    invoiceNumber,
    paymentMethod: "check",
    delivery,
    mailingAddress,
    isLabor,
    relatedParty,
    cardLast4: card ? cardLast4 : undefined,
    statementMonth: card ? statementMonth : undefined,
    lines: card ? cardLinesOut : lines.map(({ key: _k, ...l }) => l),
    attestationName,
    eventCardId,
  };

  return (
    <form action={formAction} className={styles.fieldsets}>
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <FormStarted form="purchase" />

      <FormErrors errors={state.errors} />

      <Panel title="What do you need?">
        <Choices legend="What do you need?" legendHidden>
          {(Object.keys(KIND_LABEL) as PurchaseKind[]).map((k) => (
            <Choice key={k} type="radio" name="kind" value={k} checked={kind === k} disabled={k === "card" && cards.length === 0} onChange={() => chooseKind(k)} label={KIND_LABEL[k]} hint={k === "card" && cards.length === 0 ? "For people who hold an IAR card" : undefined} />
          ))}
        </Choices>
      </Panel>

      <Panel title={card ? "Card and statement" : "About the request"}>
        <div className="stack">
          <div className="grid">
            {card ? (
              <>
                <Field label="Card">
                  <select value={cardLast4} onChange={(e) => chooseStatement(e.target.value, firstMonth(e.target.value))}>
                    {cards.map((c) => (
                      <option key={c.last4} value={c.last4}>
                        Card ending {c.last4}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Statement" required>
                  <select value={statementMonth} onChange={(e) => chooseStatement(cardLast4, e.target.value)} required disabled={monthsFor(cardLast4).length === 0}>
                    {monthsFor(cardLast4).length === 0 && <option value="">None in yet</option>}
                    {monthsFor(cardLast4).map((x) => (
                      <option key={x.month} value={x.month}>
                        {fmtMonth(x.month)} · {x.charges.length} charge{x.charges.length === 1 ? "" : "s"}
                        {x.sentAs ? " · already sent" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <Field
                label="Fund or committee"
                required
                hint={fundChoices.length === 0 ? "You can charge your own committees' and teams' funds. Ask a portal admin to add you to your committee in Google Groups." : undefined}
              >
                <select value={fund} onChange={(e) => setFund(e.target.value)} required>
                  <option value="">{fundChoices.length ? "Choose…" : "You're not on a committee yet"}</option>
                  {fundChoices.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="What is it for?" required>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={card ? "Card statement receipts" : "e.g. Snacks and supplies for Youth Game Night"} maxLength={200} required />
            </Field>
          </div>
          {(eventChoices.length > 0 || eventCardId) && (
            <Field label="Which event is it for? (optional)" hint="Linking it adds this cost to the event, so its final costs add up when it's closed out.">
              <select value={eventCardId} onChange={(e) => setEventCardId(e.target.value)}>
                <option value="">Not for an event</option>
                {eventChoices.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {card && monthsFor(cardLast4).length === 0 && <Note tone="warn">There are no charges on this card in the statements the finance office has uploaded. Once a month&apos;s statement is in, its charges show up here for you to add receipts.</Note>}
          {card && choice?.sentAs && (
            <Note tone="warn">
              Receipts for this card and month were already sent as <Link href={`/purchases/${choice.sentAs}`}>{choice.sentAs}</Link>. Choose another statement, or open that request.
            </Note>
          )}
          {chargeFund === SOCIAL_WELFARE_FUND && <Note>Social &amp; Welfare requests are visible only to Social &amp; Welfare and the finance office.</Note>}
        </div>
      </Panel>

      {!card && (
        <Panel title={kind === "reimburse" ? "Paying you back" : "Who gets paid"}>
          <div className="stack">
            <div className="grid">
              {kind === "pay" ? (
                <Field
                  label="Payee"
                  required
                  hint={
                    payee.trim() ? (
                      <span className={w9Needed ? styles.hintWarn : styles.hintOk}>
                        {vendor
                          ? `Saved vendor${vendor.funds.length ? ` · used by ${vendor.funds.map(shortFund).join(", ")}` : ""} · ${vendor.w9OnFile ? `W-9 on file${vendor.w9Date ? ` (${fmtW9Date(vendor.w9Date)})` : ""}` : `no W-9 on file${w9Needed ? ", needed because this is labor" : ""}`}`
                          : `New payee${w9Needed ? " · a W-9 is needed because this is labor" : ""}`}
                      </span>
                    ) : (
                      "Start typing to find a saved vendor."
                    )
                  }
                >
                  <input list="vendors" value={payee} onChange={(e) => choosePayee(e.target.value)} placeholder="Business or person" maxLength={120} required />
                  <datalist id="vendors">
                    {vendorList.map((v) => (
                      <option key={v.name} value={v.name} />
                    ))}
                  </datalist>
                </Field>
              ) : (
                <Field label="Pay to" hint="Reimbursement · no W-9 needed">
                  <span className={styles.static}>{requesterName} (you)</span>
                </Field>
              )}
              {kind === "pay" && (
                <Field label="Invoice number (if any)">
                  <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={60} />
                </Field>
              )}
            </div>
            <div className="grid">
              <Field label="How should we send the check?" required>
                <select value={checkTo} onChange={(e) => setCheckTo(e.target.value as DeliveryMethod)} required>
                  <option value="">Choose…</option>
                  {CHECK_DELIVERIES.map((d) => (
                    <option key={d} value={d}>
                      {DELIVERY_LABEL[d]}
                    </option>
                  ))}
                </select>
              </Field>
              <AddressField label={kind === "reimburse" ? "Your mailing address" : "Payee's mailing address"} required hint="Start typing to pick it from Google Maps. Needed for every check, even one picked up in person." value={mailingAddress} onChange={setMailingAddress} />
            </div>
            {kind === "pay" && (
              <div className="stack tight">
                <Checkbox checked={labor} disabled={laborLine} onChange={(e) => setIsLabor(e.target.checked)}>
                  This payment is for labor or services
                  {laborLine && <small> (a line is charged to a labor sub-account)</small>}
                </Checkbox>
                <Checkbox checked={relatedParty} onChange={(e) => setRelatedParty(e.target.checked)}>The payee is a Shura or committee member, a relative of one, or a business one owns</Checkbox>
              </div>
            )}
            {w9Needed && (
              <FileDrop
                name="w9"
                label={existingW9 ? "The payee's W-9 (already uploaded; add one only to replace it)" : "The payee's W-9"}
                required={!existingW9}
                multiple={false}
                maxFiles={1}
                accept={W9_TYPES}
                hint="Labor needs a W-9 on file before IAR can pay. It goes only to the finance office's restricted W-9 drive; you won't be able to open it after you send the request."
              />
            )}
          </div>
        </Panel>
      )}

      <Panel
        title={card ? "Charges" : "Line items"}
        right={
          <span className={styles.total}>
            Total <strong>{money(total)}</strong>
          </span>
        }
      >
        <div className="stack">
          <p className="hint">
            {card
              ? "These are the charges on the statement. For each one, choose its sub-account and say why it was bought. Charges from the same store can be lumped together, so one receipt covers them."
              : "Split the total across as many sub-accounts as it really covers."}
          </p>
          {!card && <Checkbox checked={allFunds} onChange={(e) => setAllFunds(e.target.checked)}>Show sub-accounts from every fund</Checkbox>}
          {card ? (
            choice && (
              <CardCharges
                charges={choice.charges}
                groups={groups}
                values={charges.values}
                lumped={charges.lumped}
                accounts={accountChoices}
                allFunds
                placeholder="Choose…"
                onCharge={setCharge}
                onGroup={setGroup}
                onLump={lump}
              />
            )
          ) : (
            <div className={styles.lines}>
                {lines.map((l, i) => (
                  <div key={l.key} className={styles.line}>
                    <div className={styles.lineNo} aria-hidden="true">
                      {i + 1}
                    </div>
                    <div className={styles.lineFields}>
                      <Field label="Sub-account" required className={styles.wide}>
                        <select value={l.accountId} onChange={(e) => setLine(l.key, { accountId: e.target.value })} required aria-label={`Sub-account, line ${i + 1}`}>
                          <option value="">{chargeFund || allFunds ? "Choose…" : "Choose a fund first"}</option>
                          <AccountOptions accounts={accountChoices} allFunds={allFunds} />
                        </select>
                      </Field>
                      <Field label="Amount" required>
                        <input inputMode="decimal" value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} placeholder="0.00" required aria-label={`Amount, line ${i + 1}`} />
                      </Field>
                      <Field label="Note">
                        <input value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })} maxLength={200} placeholder="What's on the receipt" aria-label={`Note, line ${i + 1}`} />
                      </Field>
                    </div>
                    <div className={styles.lineRemove}>
                      <Button variant="quiet" size="small" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
          <div className={styles.lineFoot}>
            {!card && (
              <Button icon="plus" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                Add a line
              </Button>
            )}
            <span className={styles.total}>
              Total <strong>{money(total)}</strong>
            </span>
          </div>
        </div>
      </Panel>

      <Panel title="Receipts and invoices">
        <div className="stack">
          {existingFiles.length > 0 && <Note>Already attached: {existingFiles.join(", ")}</Note>}
          <FileDrop
            name="attachments"
            label={existingFiles.length > 0 ? "Add more receipts and invoices" : "Receipts and invoices"}
            required={existingFiles.length === 0}
            camera
            maxFiles={10}
            accept={RECEIPT_TYPES}
            hint={
              card
                ? "Every charge needs its receipt or invoice. One file can cover several charges, such as your Amazon order history for the month. Photos or PDFs, up to 10 files."
                : "Every request needs its receipt or invoice. Photos or PDFs, up to 10 files. On a phone, take a photo of each receipt. Don't attach W-9s here; they have their own upload, for labor."
            }
          />
        </div>
      </Panel>

      <Panel title="Sign">
        <div className="stack">
          <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required>I confirm this request is accurate and for IAR business.</Checkbox>
          <Field label="Type your full name" required className={styles.narrow}>
            <input value={attestationName} onChange={(e) => setAttestationName(e.target.value)} maxLength={120} required autoComplete="name" />
          </Field>
        </div>
      </Panel>

      <FormActions>
        <Button href={cancelHref}>Cancel</Button>
        <Submit label={submitLabel} />
      </FormActions>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Sending…" : label}
    </Button>
  );
}
