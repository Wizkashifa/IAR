import { Checkbox, Choice, Choices } from "@/components/Choices";
import { DataTable, cell } from "@/components/DataTable";
import { ItemRow, Rows } from "@/components/ItemRow";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { Button } from "@/components/Button";

/** The pieces module pages are built from, beyond the basics above: one example of each. */
export function Pieces() {
  return (
    <>
      <Panel title="Rows that aren't requests" right="components/ItemRow.tsx: state=plain" flush>
        <Rows>
          <ItemRow state="plain" icon="book" title="Room reservation policy" href="https://drive.google.com" external="Google Drive" sub="Google Doc · Facilities · updated Oct 2, 2026" right={<Pill tone="warn" dot>Review due Nov 1, 2026</Pill>} />
          <ItemRow state="plain" href="/dev/styles" title={<>Youth <Pill tone="accent">You&apos;re on it</Pill></>} sub="Chair: Sample Chair · Vice chair: Sample Vice Chair" extra="Programs, trips and halaqas for IAR's youth." right="12 people" />
          <ItemRow state="done" title="MPH A" sub="Holds 75 · Main · Food allowed" right={<Button size="small">Request this room</Button>} />
          <ItemRow state="act" title="PO-12007 is waiting on you" sub="Oct 24, 10:00 AM" href="/dev/styles" />
        </Rows>
      </Panel>

      <Panel title="Data table" right="components/DataTable.tsx: rows become cards on a phone" flush>
        <DataTable caption="Line items">
          <thead>
            <tr>
              <th>Sub-account</th>
              <th>Note</th>
              <th className={cell.num}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Sub-account">56000 · Program Expenses</td>
              <td data-label="Note">
                Snacks
                <span className={cell.sub}>Costco receipt</span>
              </td>
              <td data-label="Amount" className={cell.num}>$184.50</td>
            </tr>
            <tr>
              <td data-label="Sub-account">50300 · Supplies</td>
              <td data-label="Note"></td>
              <td data-label="Amount" className={cell.num}>$32.00</td>
            </tr>
          </tbody>
        </DataTable>
      </Panel>

      <Panel title="Choices" right="components/Choices.tsx">
        <div className="stack">
          <Choices legend="Which team?">
            <Choice type="radio" name="team" value="facilities" defaultChecked label={<strong>Building or maintenance</strong>} hint="Heating and cooling, plumbing, lights, doors." />
            <Choice type="radio" name="team" value="it" label={<strong>IT, A/V or tech</strong>} hint="Wi-Fi, computers, printers, projectors." />
            <Choice type="radio" name="team" value="none" disabled label="Not available" hint="A disabled choice." />
          </Choices>
          <Choices legend="Details (checkboxes)">
            <Choice type="checkbox" defaultChecked label="Food served" />
            <Choice type="checkbox" label="Open to the public" />
          </Choices>
          <Choices legend="A plain list" plain hint="For long questions, like the marketing forms.">
            <Choice type="radio" name="plain" value="a" defaultChecked label="Yes" />
            <Choice type="radio" name="plain" value="b" label="No" />
          </Choices>
          <Choice type="checkbox" label={<strong>A single choice on its own</strong>} hint="Quiet overnight, on notification settings." />
          <Checkbox defaultChecked>
            I confirm this request is accurate and for IAR business. <small>(Checkbox: a plain tick box)</small>
          </Checkbox>
          <Checkbox quiet>Select all 4 (quiet, for a panel header)</Checkbox>
        </div>
      </Panel>
    </>
  );
}
