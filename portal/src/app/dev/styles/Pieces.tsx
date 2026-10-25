import { Checkbox, Choice, Choices } from "@/components/Choices";
import { DataTable, cell } from "@/components/DataTable";
import { Disclosure } from "@/components/Disclosure";
import { FileList } from "@/components/FileList";
import { ItemRow, Rows } from "@/components/ItemRow";
import { Chips } from "@/components/Chips";
import { Panel } from "@/components/Panel";
import { SearchForm } from "@/components/SearchForm";
import { Pill } from "@/components/Pill";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";

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

      <Panel title="Folded away" right="components/Disclosure.tsx">
        <div className="stack">
          <div className="row">
            <Button variant="primary">Approve</Button>
          </div>
          <Disclosure summary="Something wrong? Send it back" divided>
            <p className="muted small">The form to send it back goes here.</p>
          </Disclosure>
          <div className="row">
            <Disclosure summary="Mark done" button="primary">
              <p className="muted small">A note for the requester, then Done.</p>
            </Disclosure>
            <Disclosure summary="Ask the requester" button="quiet">
              <p className="muted small">A question, added as a comment.</p>
            </Disclosure>
          </div>
        </div>
      </Panel>

      <Panel title="Layout classes" right="styles/base.css: stack, row, grid, grid two, grid split, grow, push">
        <div className="grid split">
          <Field label="Done by">
            <input defaultValue="Tue, Nov 3" />
          </Field>
          <Field label="Note">
            <input placeholder="grid split: a narrow field beside a wide one" />
          </Field>
        </div>
      </Panel>

      <Panel title="Search and filter" right="components/SearchForm.tsx, components/Chips.tsx">
        <div className="stack">
          <SearchForm action="/dev/styles" label="Search the Library" placeholder="Search policies by name or by words inside them" />
          <Chips label="Folders" chips={[{ label: "All folders", href: "/dev/styles", on: true }, { label: "Purchasing", href: "/dev/styles?f=p", count: 3 }, { label: "Rooms and rentals", href: "/dev/styles?f=r", count: 2 }]} />
        </div>
      </Panel>

      <Panel title="Files on a request" right="components/FileList.tsx">
        <div className="stack">
          <FileList files={[{ name: "receipt-costco.jpg", url: "https://drive.google.com", size: 180_000, by: "you", at: "2026-10-24T14:00:00Z" }, { name: "flyer-draft.pdf", size: 2_400_000 }]} empty="No files yet." />
          <FileList files={[]} empty="No photos yet." />
        </div>
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
