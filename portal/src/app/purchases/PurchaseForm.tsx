"use client";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ACCOUNTS, accountLabel, accountsForFund, shortFund } from "@/lib/purchases/accounts";
import { DELIVERY_LABEL, KIND_LABEL, type DeliveryMethod, type PurchaseKind } from "@/lib/purchases/types";
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
  vendors: { name: string; w9OnFile: boolean }[];
  /** Files already on the request (editing). */
  existingFiles?: string[];
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

export default function PurchaseForm({ action, initial, requesterName, cards, funds, vendors, existingFiles = [], submitLabel }: FormProps) {
  const fundChoices = initial?.fund && !funds.includes(initial.fund) ? [initial.fund, ...funds] : funds;
  const [state, formAction] = useActionState(action, { errors: [] });
  const [kind, setKind] = useState<PurchaseKind>((initial?.kind as PurchaseKind) ?? "pay");
  const [fund, setFund] = useState(initial?.fund ?? "");
  const [cardLast4, setCardLast4] = useState(initial?.cardLast4 ?? cards[0]?.last4 ?? "");
  const [statementMonth, setStatementMonth] = useState(initial?.statementMonth ?? lastMonth());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [payee, setPayee] = useState(initial?.payee ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber ?? "");
  const [delivery, setDelivery] = useState<DeliveryMethod | "">((initial?.delivery as DeliveryMethod) ?? "");
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
  const vendor = vendors.find((v) => v.name.toLowerCase() === payee.trim().toLowerCase());
  const w9Needed = kind === "pay" && payee.trim() !== "" && (isLabor || !vendor) && !vendor?.w9OnFile;

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const payload: PurchaseInput = {
    kind,
    fund: chargeFund,
    description,
    payee: kind === "reimburse" ? requesterName : payee,
    invoiceNumber,
    delivery,
    mailingAddress,
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
              <input type="radio" name="kind" value={k} checked={kind === k} disabled={k === "card" && cards.length === 0} onChange={() => setKind(k)} />
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
                <input list="vendors" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Business or person" maxLength={120} required />
                <datalist id="vendors">
                  {vendors.map((v) => (
                    <option key={v.name} value={v.name} />
                  ))}
                </datalist>
                {payee.trim() && (
                  <small className={w9Needed ? "warn" : "ok"}>
                    {vendor?.w9OnFile ? "W-9 on file" : w9Needed ? "W-9 needed: the finance office will ask for it before paying" : "Saved payee"}
                  </small>
                )}
              </label>
            ) : (
              <div className="field">
                <span>Payee</span>
                <div className="static">{requesterName} (you)</div>
              </div>
            )}
            {kind === "pay" && (
              <label className="field">
                <span>Invoice number (if any)</span>
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={60} />
              </label>
            )}
            <label className="field">
              <span>How should it be paid?</span>
              <select value={delivery} onChange={(e) => setDelivery(e.target.value as DeliveryMethod)} required>
                <option value="">Choose…</option>
                {(Object.keys(DELIVERY_LABEL) as DeliveryMethod[]).map((d) => (
                  <option key={d} value={d}>
                    {DELIVERY_LABEL[d]}
                  </option>
                ))}
              </select>
            </label>
            {delivery === "mail" && (
              <label className="field">
                <span>Mailing address</span>
                <textarea value={mailingAddress} onChange={(e) => setMailingAddress(e.target.value)} rows={2} maxLength={300} required />
              </label>
            )}
          </div>
          {kind === "pay" && (
            <div className="checks">
              <label>
                <input type="checkbox" checked={isLabor} onChange={(e) => setIsLabor(e.target.checked)} /> This is payment for labor or services
              </label>
              <label>
                <input type="checkbox" checked={relatedParty} onChange={(e) => setRelatedParty(e.target.checked)} /> The payee is a Shura or committee member, a relative of one, or a business one owns
              </label>
            </div>
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
        <p className="note">Up to 10 files, 10 MB each. Don&apos;t attach W-9s here; the finance office collects those separately.</p>
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
