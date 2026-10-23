"use client";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ACCOUNTS, SOCIAL_WELFARE_FUND, accountLabel, accountsForFund, findAccount, isLaborAccount, shortFund } from "@/lib/purchases/accounts";
import { CHECK_DELIVERIES, DELIVERY_LABEL, KIND_LABEL, PAYMENT_METHOD_LABEL, type DeliveryMethod, type PaymentMethod, type PurchaseKind } from "@/lib/purchases/types";
import type { VendorChoice } from "@/lib/purchases/vendors";
import type { LineInput, PurchaseInput } from "@/lib/purchases/input";
import type { FormState } from "./actions";

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
  submitLabel: string;
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

export default function PurchaseForm({ action, initial, requesterName, cards, funds, vendors, restrictedVendors = [], lastAddress = "", existingFiles = [], existingW9, submitLabel }: FormProps) {
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
  };

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {state.errors.length > 0 && (
        <div className="error" role="alert">
          <strong>Please fix:</strong>
          <ul>
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <fieldset className="section">
        <legend>What do you need?</legend>
        <div className="choices">
          {(Object.keys(KIND_LABEL) as PurchaseKind[]).map((k) => (
            <label key={k} className={`choice${kind === k ? " on" : ""}${k === "card" && cards.length === 0 ? " disabled" : ""}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} disabled={k === "card" && cards.length === 0} onChange={() => chooseKind(k)} />
              <span>{KIND_LABEL[k]}</span>
              {k === "card" && cards.length === 0 && <small>You don&apos;t hold an IAR card</small>}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>{card ? "Card and statement" : "About the request"}</legend>
        <div className="grid2">
          {card ? (
            <>
              <label className="field">
                <span>Card</span>
                <select value={cardLast4} onChange={(e) => setCardLast4(e.target.value)}>
                  {cards.map((c) => (
                    <option key={c.last4} value={c.last4}>
                      ···{c.last4} · {shortFund(c.fund)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Statement month</span>
                <input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} required />
              </label>
            </>
          ) : (
            <label className="field">
              <span>Fund / committee</span>
              <select value={fund} onChange={(e) => setFund(e.target.value)} required>
                <option value="">{fundChoices.length ? "Choose…" : "You're not on a committee yet"}</option>
                {fundChoices.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              {fundChoices.length === 0 && <small>You can charge your own committees&apos; and teams&apos; funds. Ask a portal admin to add you to your committee in Google Groups.</small>}
            </label>
          )}
          <label className="field">
            <span>What is it for?</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={card ? "Card statement receipts" : "e.g. Youth night supplies"} maxLength={200} required />
          </label>
        </div>
        {chargeFund === "Social & Welfare" && (
          <p className="note">Social &amp; Welfare requests are visible only to S&amp;W and the finance office.</p>
        )}
      </fieldset>

      {!card && (
        <fieldset className="section">
          <legend>{kind === "reimburse" ? "Reimbursement" : "Who gets paid"}</legend>
          <div className="grid2">
            {kind === "pay" ? (
              <label className="field">
                <span>Payee</span>
                <input list="vendors" value={payee} onChange={(e) => choosePayee(e.target.value)} placeholder="Business or person" maxLength={120} required />
                <datalist id="vendors">
                  {vendorList.map((v) => (
                    <option key={v.name} value={v.name} />
                  ))}
                </datalist>
                {payee.trim() && (
                  <small className={w9Needed ? "warn" : "ok"}>
                    {vendor
                      ? `Saved vendor${vendor.funds.length ? ` · used by ${vendor.funds.map(shortFund).join(", ")}` : ""} · ${vendor.w9OnFile ? `W-9 on file${vendor.w9Date ? ` (${fmtW9Date(vendor.w9Date)})` : ""}` : `no W-9 on file${w9Needed ? ", needed because this is labor" : ""}`}`
                      : `New payee${w9Needed ? " · W-9 required because this is labor" : ""}`}
                  </small>
                )}
              </label>
            ) : (
              <div className="field">
                <span>Payee</span>
                <div className="static">{requesterName} (you)</div>
                <small className="ok">Reimbursement · no W-9 needed</small>
              </div>
            )}
            {kind === "pay" && (
              <label className="field">
                <span>Invoice number (if any)</span>
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={60} />
              </label>
            )}
          </div>
          <div className="choices spaced" role="radiogroup" aria-label="Check or ACH">
            {(["check", "ach"] as PaymentMethod[]).map((m) => (
              <label key={m} className={`choice${method === m ? " on" : ""}`}>
                <input type="radio" name="paymentMethod" value={m} checked={method === m} onChange={() => setMethod(m)} required />
                <span>{PAYMENT_METHOD_LABEL[m]}</span>
              </label>
            ))}
          </div>
          {method === "ach" && <p className="note">The finance office gets the bank details from {kind === "reimburse" ? "you" : "the payee"} directly. Don&apos;t type bank details here.</p>}
          {method === "check" && (
            <div className="grid2">
              <label className="field">
                <span>Where should the check go?</span>
                <select value={checkTo} onChange={(e) => setCheckTo(e.target.value as DeliveryMethod)} required>
                  <option value="">Choose…</option>
                  {CHECK_DELIVERIES.map((d) => (
                    <option key={d} value={d}>
                      {DELIVERY_LABEL[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{kind === "reimburse" ? "Your mailing address" : "Payee's mailing address"}</span>
                <textarea value={mailingAddress} onChange={(e) => setMailingAddress(e.target.value)} rows={2} maxLength={300} placeholder="Street, city, state, ZIP" required />
                <small>Needed for every check, even one picked up in person.</small>
              </label>
            </div>
          )}
          {kind === "pay" && (
            <div className="checks">
              <label>
                <input type="checkbox" checked={labor} disabled={laborLine} onChange={(e) => setIsLabor(e.target.checked)} /> This payment is for labor or services
                {laborLine && <small> (a line is charged to a labor sub-account)</small>}
              </label>
              <label>
                <input type="checkbox" checked={relatedParty} onChange={(e) => setRelatedParty(e.target.checked)} /> The payee is a Shura or committee member, a relative of one, or a business one owns
              </label>
            </div>
          )}
          {w9Needed && (
            <label className="field">
              <span>The payee&apos;s W-9{existingW9 ? " (already uploaded; add a new one only to replace it)" : ""}</span>
              <input type="file" name="w9" accept=".pdf,.png,.jpg,.jpeg,.heic,.webp" required={!existingW9} />
              <small>Labor needs a W-9 on file before IAR can pay. It goes only to the finance office&apos;s restricted W-9 drive; you won&apos;t be able to open it after you submit.</small>
            </label>
          )}
        </fieldset>
      )}

      <fieldset className="section">
        <legend>{card ? "Charges" : "Line items"}</legend>
        <p className="note">
          {card
            ? "One line per charge on the statement, each with its sub-account. Mark charges that will be refunded or repaid."
            : "Split the total across as many sub-accounts as it really covers."}{" "}
          <label className="inline">
            <input type="checkbox" checked={allFunds} onChange={(e) => setAllFunds(e.target.checked)} /> Show sub-accounts from every fund
          </label>
        </p>
        <div className="lines">
          {lines.map((l, i) => (
            <div key={l.key} className="line">
              <div className="lineno">{i + 1}</div>
              {card && (
                <>
                  <label className="field">
                    <span>Date</span>
                    <input type="date" value={l.date} onChange={(e) => setLine(l.key, { date: e.target.value })} required />
                  </label>
                  <label className="field grow">
                    <span>Merchant</span>
                    <input value={l.merchant} onChange={(e) => setLine(l.key, { merchant: e.target.value })} maxLength={120} required />
                  </label>
                </>
              )}
              <label className="field grow2">
                <span>Sub-account</span>
                <select value={l.accountId} onChange={(e) => setLine(l.key, { accountId: e.target.value })} required>
                  <option value="">{chargeFund || allFunds ? "Choose…" : "Choose a fund first"}</option>
                  {accountChoices.map((a) => (
                    <option key={a.id} value={a.id}>
                      {allFunds ? `${shortFund(a.fund)} — ` : ""}
                      {accountLabel(a)}
                      {a.code ? "" : " (no number yet)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field amt">
                <span>Amount</span>
                <input inputMode="decimal" value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} placeholder="0.00" required />
              </label>
              {!card && (
                <label className="field grow">
                  <span>Note</span>
                  <input value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })} maxLength={200} />
                </label>
              )}
              {card && (
                <>
                  <label className="field">
                    <span>Expected back</span>
                    <select value={l.flag} onChange={(e) => setLine(l.key, { flag: e.target.value as Line["flag"] })}>
                      <option value="">No</option>
                      <option value="refund">Refund pending</option>
                      <option value="repay">To be repaid by…</option>
                    </select>
                  </label>
                  {l.flag === "repay" && (
                    <label className="field">
                      <span>Repaid by</span>
                      <input value={l.repayBy} onChange={(e) => setLine(l.key, { repayBy: e.target.value })} maxLength={120} required />
                    </label>
                  )}
                  <label className="inline nr">
                    <input type="checkbox" checked={l.hasReceipt === false} onChange={(e) => setLine(l.key, { hasReceipt: !e.target.checked })} /> No receipt
                  </label>
                </>
              )}
              <button type="button" className="linkbtn" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="linefoot">
          <button type="button" className="button secondary" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            Add {card ? "a charge" : "a line"}
          </button>
          <div className="total">
            Total <strong>{money(total)}</strong>
          </div>
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Receipts and invoices</legend>
        {existingFiles.length > 0 && <p className="note">Already attached: {existingFiles.join(", ")}</p>}
        <input type="file" name="attachments" multiple accept=".pdf,.png,.jpg,.jpeg,.heic,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt" />
        <p className="note">Up to 10 files, 10 MB each. Don&apos;t attach W-9s here; they have their own upload above, for labor.</p>
      </fieldset>

      <fieldset className="section">
        <legend>Sign</legend>
        <label className="inline">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required /> I confirm this request is accurate and for IAR business.
        </label>
        <label className="field narrow">
          <span>Type your full name</span>
          <input value={attestationName} onChange={(e) => setAttestationName(e.target.value)} maxLength={120} required />
        </label>
      </fieldset>

      <Submit label={submitLabel} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? "Submitting…" : label}
    </button>
  );
}
