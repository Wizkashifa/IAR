"use client";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { FormStarted } from "@/components/FormStarted";
import { ACCOUNTS, SOCIAL_WELFARE_FUND, accountLabel, accountsForFund, findAccount, isLaborAccount, shortFund } from "@/lib/purchases/accounts";
import { CHECK_DELIVERIES, DELIVERY_LABEL, KIND_LABEL, PAYMENT_METHOD_LABEL, type DeliveryMethod, type PaymentMethod, type PurchaseKind } from "@/lib/purchases/types";
import type { VendorChoice } from "@/lib/purchases/vendors";
import type { LineInput, PurchaseInput } from "@/lib/purchases/input";
import type { EventChoice } from "@/lib/events/link";
import { Button } from "@/components/Button";
import { Field, FormActions } from "@/components/Field";
import { FileDrop } from "@/components/FileDrop";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import type { FormState } from "./actions";
import styles from "./purchases.module.css";

type Line = LineInput & { key: number };

export type FormProps = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial?: PurchaseInput;
  requesterName: string;
  cards: { last4: string; fund: string }[];
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
const lastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

let keySeq = 1;
const blankLine = (): Line => ({ key: keySeq++, accountId: "", amount: "", note: "", date: "", merchant: "", hasReceipt: true, flag: "", repayBy: "" });

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

export default function PurchaseForm({ action, initial, requesterName, cards, funds, vendors, restrictedVendors = [], lastAddress = "", existingFiles = [], existingW9, events = [], submitLabel, cancelHref }: FormProps) {
  const eventChoices = initial?.eventCardId && !events.some((e) => e.id === initial.eventCardId) ? [{ id: initial.eventCardId, label: initial.eventCardId }, ...events] : events;
  const [eventCardId, setEventCardId] = useState(initial?.eventCardId ?? "");
  const fundChoices = initial?.fund && !funds.includes(initial.fund) ? [initial.fund, ...funds] : funds;
  const [state, formAction] = useActionState(action, { errors: [] });
  const [kind, setKind] = useState<PurchaseKind>((initial?.kind as PurchaseKind) ?? "pay");
  const [fund, setFund] = useState(initial?.fund ?? "");
  const [cardLast4, setCardLast4] = useState(initial?.cardLast4 ?? cards[0]?.last4 ?? "");
  const [statementMonth, setStatementMonth] = useState(initial?.statementMonth ?? lastMonth());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [payee, setPayee] = useState(initial?.payee ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber ?? "");
  const initialDelivery = (initial?.delivery as DeliveryMethod | undefined) ?? "";
  const [method, setMethod] = useState<PaymentMethod | "">(initialDelivery === "ach" ? "ach" : initialDelivery ? "check" : "");
  const [checkTo, setCheckTo] = useState<DeliveryMethod | "">(initialDelivery && initialDelivery !== "ach" ? initialDelivery : "");
  const [mailingAddress, setMailingAddress] = useState(initial?.mailingAddress ?? "");
  const [isLabor, setIsLabor] = useState(Boolean(initial?.isLabor));
  const [relatedParty, setRelatedParty] = useState(Boolean(initial?.relatedParty));
  const [lines, setLines] = useState<Line[]>(() => (initial?.lines?.length ? initial.lines.map((l) => ({ ...blankLine(), ...l, flag: l.flag ?? "" })) : [blankLine()]));
  const [allFunds, setAllFunds] = useState(false);
  const [attestationName, setAttestationName] = useState(initial?.attestationName ?? "");
  const [agreed, setAgreed] = useState(Boolean(initial));

  const card = kind === "card";
  const chargeFund = card ? cards.find((c) => c.last4 === cardLast4)?.fund ?? "" : fund;
  const accountChoices = useMemo(() => (allFunds || !chargeFund ? ACCOUNTS : accountsForFund(chargeFund)), [allFunds, chargeFund]);
  const total = lines.reduce((s, l) => s + toNum(l.amount), 0);
  const delivery: DeliveryMethod | "" = method === "ach" ? "ach" : method === "check" ? checkTo : "";
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
    // Reimbursements are paid by check unless the requester asks for ACH.
    if (k === "reimburse" && !method) setMethod("check");
    if (k === "reimburse" && !mailingAddress.trim() && lastAddress) setMailingAddress(lastAddress);
  };

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const payload: PurchaseInput = {
    kind,
    fund: chargeFund,
    description,
    payee: kind === "reimburse" ? requesterName : payee,
    invoiceNumber,
    paymentMethod: method,
    delivery,
    mailingAddress: method === "check" ? mailingAddress : "",
    isLabor,
    relatedParty,
    cardLast4: card ? cardLast4 : undefined,
    statementMonth: card ? statementMonth : undefined,
    lines: lines.map(({ key: _k, ...l }) => l),
    attestationName,
    eventCardId,
  };

  return (
    <form action={formAction} className={styles.fieldsets}>
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <FormStarted form="purchase" />

      {state.errors.length > 0 && (
        <Note tone="bad">
          <strong>Please fix these, then send it again:</strong>
          <ul className={styles.errors}>
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Note>
      )}

      <Panel title="What do you need?">
        <div className={styles.choices} role="radiogroup" aria-label="What do you need?">
          {(Object.keys(KIND_LABEL) as PurchaseKind[]).map((k) => (
            <label key={k} className={styles.choice}>
              <input type="radio" name="kind" value={k} checked={kind === k} disabled={k === "card" && cards.length === 0} onChange={() => chooseKind(k)} />
              <span>{KIND_LABEL[k]}</span>
              {k === "card" && cards.length === 0 && <small>For people who hold an IAR card</small>}
            </label>
          ))}
        </div>
      </Panel>

      <Panel title={card ? "Card and statement" : "About the request"}>
        <div className="stack">
          <div className={styles.grid2}>
            {card ? (
              <>
                <Field label="Card">
                  <select value={cardLast4} onChange={(e) => setCardLast4(e.target.value)}>
                    {cards.map((c) => (
                      <option key={c.last4} value={c.last4}>
                        ···{c.last4} · {shortFund(c.fund)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Statement month" required>
                  <input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} required />
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
          {chargeFund === SOCIAL_WELFARE_FUND && <Note>Social &amp; Welfare requests are visible only to Social &amp; Welfare and the finance office.</Note>}
        </div>
      </Panel>

      {!card && (
        <Panel title={kind === "reimburse" ? "Paying you back" : "Who gets paid"}>
          <div className="stack">
            <div className={styles.grid2}>
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
            <div className={styles.choices} role="radiogroup" aria-label="How should it be paid?">
              {(["check", "ach"] as PaymentMethod[]).map((m) => (
                <label key={m} className={styles.choice}>
                  <input type="radio" name="paymentMethod" value={m} checked={method === m} onChange={() => setMethod(m)} required />
                  <span>{PAYMENT_METHOD_LABEL[m]}</span>
                </label>
              ))}
            </div>
            {method === "ach" && <Note>The finance office gets the bank details from {kind === "reimburse" ? "you" : "the payee"} directly. Don&apos;t type bank details here.</Note>}
            {method === "check" && (
              <div className={styles.grid2}>
                <Field label="Where should the check go?" required>
                  <select value={checkTo} onChange={(e) => setCheckTo(e.target.value as DeliveryMethod)} required>
                    <option value="">Choose…</option>
                    {CHECK_DELIVERIES.map((d) => (
                      <option key={d} value={d}>
                        {DELIVERY_LABEL[d]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={kind === "reimburse" ? "Your mailing address" : "Payee's mailing address"} required hint="Needed for every check, even one picked up in person.">
                  <textarea value={mailingAddress} onChange={(e) => setMailingAddress(e.target.value)} rows={2} maxLength={300} placeholder="Street, city, state, ZIP" required />
                </Field>
              </div>
            )}
            {kind === "pay" && (
              <div className={styles.checks}>
                <label className={styles.check}>
                  <input type="checkbox" checked={labor} disabled={laborLine} onChange={(e) => setIsLabor(e.target.checked)} />
                  <span>
                    This payment is for labor or services
                    {laborLine && <small> (a line is charged to a labor sub-account)</small>}
                  </span>
                </label>
                <label className={styles.check}>
                  <input type="checkbox" checked={relatedParty} onChange={(e) => setRelatedParty(e.target.checked)} />
                  <span>The payee is a Shura or committee member, a relative of one, or a business one owns</span>
                </label>
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
          <p className={styles.why}>
            {card
              ? "One line per charge on the statement, each with its sub-account. Mark charges that will be refunded or repaid."
              : "Split the total across as many sub-accounts as it really covers."}
          </p>
          <label className={styles.check}>
            <input type="checkbox" checked={allFunds} onChange={(e) => setAllFunds(e.target.checked)} />
            <span>Show sub-accounts from every fund</span>
          </label>
          <div className={styles.lines}>
            {lines.map((l, i) => (
              <div key={l.key} className={styles.line}>
                <div className={styles.lineNo} aria-hidden="true">
                  {i + 1}
                </div>
                <div className={styles.lineFields}>
                  {card && (
                    <>
                      <Field label="Date" required>
                        <input type="date" value={l.date} onChange={(e) => setLine(l.key, { date: e.target.value })} required aria-label={`Date, line ${i + 1}`} />
                      </Field>
                      <Field label="Merchant" required>
                        <input value={l.merchant} onChange={(e) => setLine(l.key, { merchant: e.target.value })} maxLength={120} required aria-label={`Merchant, line ${i + 1}`} />
                      </Field>
                    </>
                  )}
                  <Field label="Sub-account" required className={styles.wide}>
                    <select value={l.accountId} onChange={(e) => setLine(l.key, { accountId: e.target.value })} required aria-label={`Sub-account, line ${i + 1}`}>
                      <option value="">{chargeFund || allFunds ? "Choose…" : "Choose a fund first"}</option>
                      {accountChoices.map((a) => (
                        <option key={a.id} value={a.id}>
                          {allFunds ? `${shortFund(a.fund)} — ` : ""}
                          {accountLabel(a)}
                          {a.code ? "" : " (no number yet)"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Amount" required>
                    <input inputMode="decimal" value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} placeholder="0.00" required aria-label={`Amount, line ${i + 1}`} />
                  </Field>
                  {!card && (
                    <Field label="Note">
                      <input value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })} maxLength={200} placeholder="What's on the receipt" aria-label={`Note, line ${i + 1}`} />
                    </Field>
                  )}
                  {card && (
                    <>
                      <Field label="Expected back">
                        <select value={l.flag} onChange={(e) => setLine(l.key, { flag: e.target.value as Line["flag"] })} aria-label={`Expected back, line ${i + 1}`}>
                          <option value="">No</option>
                          <option value="refund">Refund pending</option>
                          <option value="repay">To be repaid by…</option>
                        </select>
                      </Field>
                      {l.flag === "repay" && (
                        <Field label="Repaid by" required>
                          <input value={l.repayBy} onChange={(e) => setLine(l.key, { repayBy: e.target.value })} maxLength={120} required aria-label={`Repaid by, line ${i + 1}`} />
                        </Field>
                      )}
                      <label className={styles.check}>
                        <input type="checkbox" checked={l.hasReceipt === false} onChange={(e) => setLine(l.key, { hasReceipt: !e.target.checked })} />
                        <span>No receipt</span>
                      </label>
                    </>
                  )}
                </div>
                <div className={styles.lineRemove}>
                  <Button variant="quiet" size="small" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.lineFoot}>
            <Button icon="plus" onClick={() => setLines((ls) => [...ls, blankLine()])}>
              Add {card ? "a charge" : "a line"}
            </Button>
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
            label="Add receipts and invoices"
            camera
            maxFiles={10}
            accept={RECEIPT_TYPES}
            hint="Photos or PDFs, up to 10 files. On a phone, take a photo of each receipt. Don't attach W-9s here; they have their own upload, for labor."
          />
        </div>
      </Panel>

      <Panel title="Sign">
        <div className="stack">
          <label className={styles.check}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
            <span>I confirm this request is accurate and for IAR business.</span>
          </label>
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
