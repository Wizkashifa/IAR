"use client";
import { Button } from "@/components/Button";
import { DataTable, cell } from "@/components/DataTable";
import { Disclosure } from "@/components/Disclosure";
import { Field } from "@/components/Field";
import { Pill } from "@/components/Pill";
import { accountLabel, shortFund, type Account } from "@/lib/purchases/accounts";
import { fmtMoney as money, fmtShortDay as day } from "@/lib/format";
import { merchantName, type ChargeGroup, type StatementCharge } from "@/lib/purchases/statement";
import styles from "./purchases.module.css";
import { ChargeReceipt, type ChargeFile } from "./ChargeReceipt";

/** What the cardholder fills in for a charge. */
export type ChargeInput = { accountId: string; note: string; flag: "" | "refund" | "repay"; repayBy: string };


type Props = {
  charges: StatementCharge[];
  groups: ChargeGroup[];
  values: Record<string, ChargeInput>;
  lumped: string[];
  accounts: Account[];
  allFunds: boolean;
  /** The sub-account list's first option ("Choose…"). */
  placeholder: string;
  onCharge: (ref: string, patch: Partial<ChargeInput>) => void;
  onGroup: (name: string, patch: Partial<ChargeInput>) => void;
  onLump: (name: string, lump: boolean) => void;
  /** The card and statement month the receipts are for. */
  last4: string;
  month: string;
  /** Each charge's receipts, by its ref. */
  receipts: Record<string, ChargeFile[]>;
  /** Add a receipt to these charges (one, or a lumped group's). */
  onReceipt: (refs: string[], f: ChargeFile) => void;
  onRemoveReceipt: (id: string) => void;
  onBusy: (delta: number) => void;
};

/** The receipts on several charges, each once. */
const filesOn = (receipts: Record<string, ChargeFile[]>, refs: string[]) => [...new Map(refs.flatMap((r) => receipts[r] ?? []).map((f) => [f.id, f])).values()];

/** The sub-account choices (the fund first when every fund is shown). */
export function AccountOptions({ accounts, allFunds }: { accounts: Account[]; allFunds: boolean }) {
  return accounts.map((a) => (
    <option key={a.id} value={a.id}>
      {allFunds ? `${shortFund(a.fund)} — ` : ""}
      {accountLabel(a)}
      {a.code ? "" : " (no number yet)"}
    </option>
  ));
}

/**
 * The charges on a card's statement, for card receipts. Date, merchant and
 * amount are the statement's and can't be changed; each charge (or each
 * lumped merchant, such as Amazon) gets a sub-account from any fund and
 * why it was bought, and its receipt, uploaded right there.
 */
export function CardCharges({ charges, groups, values, lumped, accounts, allFunds, placeholder, onCharge, onGroup, onLump, last4, month, receipts, onReceipt, onRemoveReceipt, onBusy }: Props) {
  const receiptFor = (refs: string[], label: string) => (
    <ChargeReceipt last4={last4} month={month} files={filesOn(receipts, refs)} label={label} onAdd={(f) => onReceipt(refs, f)} onRemove={onRemoveReceipt} onBusy={onBusy} />
  );
  const groupOf = (c: StatementCharge) => groups.find((g) => g.refs.includes(c.ref));
  const shown = new Set<string>();
  let n = 0;

  const accountSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <Field label="Sub-account" required className={styles.wide}>
      <select value={value} onChange={(e) => onChange(e.target.value)} required aria-label={`Sub-account, ${label}`}>
        <option value="">{placeholder}</option>
        <AccountOptions accounts={accounts} allFunds={allFunds} />
      </select>
    </Field>
  );
  const whyField = (value: string, onChange: (v: string) => void, label: string, placeholderText: string) => (
    <Field label="Why was this bought?" required className={styles.wide}>
      <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} required placeholder={placeholderText} aria-label={`Why was this bought, ${label}`} />
    </Field>
  );

  return (
    <div className={styles.lines}>
      {charges.map((c) => {
        const g = groupOf(c);
        if (g && lumped.includes(g.name)) {
          if (shown.has(g.name)) return null;
          shown.add(g.name);
          n += 1;
          const first = values[g.refs[0]];
          const label = `${g.name}, ${g.refs.length} charges`;
          const inGroup = charges.filter((x) => g.refs.includes(x.ref));
          return (
            <div key={`g-${g.name}`} className={styles.line}>
              <div className={styles.lineNo} aria-hidden="true">
                {n}
              </div>
              <div className={styles.lineBody}>
                <p className={styles.charge}>
                  <span>
                    <strong>{g.name}</strong> <span className={styles.chargeMeta}>{g.refs.length} charges, lumped together</span>
                  </span>
                  <strong className={styles.chargeAmount}>{money(g.total)}</strong>
                </p>
                <Disclosure summary={`See the ${g.refs.length} charges`}>
                  <DataTable compact caption={`${g.name} charges`}>
                    <tbody>
                      {inGroup.map((x) => (
                        <tr key={x.ref}>
                          <td data-label="Charge">
                            <span className={`${cell.nowrap} ${cell.date}`}>{day(x.date)}</span> {x.description}
                          </td>
                          <td data-label="Amount" className={cell.num}>
                            {money(x.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </Disclosure>
                <div className={styles.lineFields}>
                  {accountSelect(first?.accountId ?? "", (v) => onGroup(g.name, { accountId: v }), label)}
                  {whyField(first?.note ?? "", (v) => onGroup(g.name, { note: v }), label, `e.g. supplies for the month's ${g.name === "Amazon" ? "programs" : "work"}`)}
                </div>
                {receiptFor(g.refs, label)}
                <p className="hint">One receipt can cover them all, such as your {g.name} order history for the month.</p>
              </div>
              <div className={styles.lineRemove}>
                <Button size="small" onClick={() => onLump(g.name, false)} aria-label={`Split the ${g.name} charges into single charges`}>
                  Split up
                </Button>
              </div>
            </div>
          );
        }

        n += 1;
        const v = values[c.ref];
        const name = merchantName(c.description);
        const label = `${name}, ${day(c.date)}`;
        const firstOfGroup = g && g.refs[0] === c.ref;
        return (
          <div key={c.ref} className={styles.line}>
            <div className={styles.lineNo} aria-hidden="true">
              {n}
            </div>
            <div className={styles.lineBody}>
              <p className={styles.charge}>
                <span>
                  <strong>{name}</strong>{" "}
                  <span className={styles.chargeMeta}>
                    {day(c.date)} · {c.description}
                  </span>
                </span>
                <span className={styles.chargeAmount}>
                  {c.amount < 0 && <Pill tone="info">Credit</Pill>} <strong>{money(c.amount)}</strong>
                </span>
              </p>
              <div className={styles.lineFields}>
                {accountSelect(v?.accountId ?? "", (x) => onCharge(c.ref, { accountId: x }), label)}
                {whyField(v?.note ?? "", (x) => onCharge(c.ref, { note: x }), label, c.amount < 0 ? "e.g. returned the extra chairs" : "e.g. snacks for youth night")}
                <Field label="Expected back">
                  <select value={v?.flag ?? ""} onChange={(e) => onCharge(c.ref, { flag: e.target.value as ChargeInput["flag"] })} aria-label={`Expected back, ${label}`}>
                    <option value="">No</option>
                    <option value="refund">Refund pending</option>
                    <option value="repay">To be repaid by…</option>
                  </select>
                </Field>
                {v?.flag === "repay" && (
                  <Field label="Repaid by" required>
                    <input value={v.repayBy} onChange={(e) => onCharge(c.ref, { repayBy: e.target.value })} maxLength={120} required aria-label={`Repaid by, ${label}`} />
                  </Field>
                )}
              </div>
              {receiptFor([c.ref], label)}
            </div>
            <div className={styles.lineRemove}>
              {firstOfGroup && (
                <Button size="small" onClick={() => onLump(g.name, true)} aria-label={`Lump the ${g.refs.length} ${g.name} charges together`}>
                  Lump {g.refs.length} together
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
