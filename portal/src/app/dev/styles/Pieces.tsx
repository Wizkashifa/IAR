import { Checkbox, Choice, Choices } from "@/components/Choices";
import { Panel } from "@/components/Panel";

/** The pieces module pages are built from, beyond the basics above: one example of each. */
export function Pieces() {
  return (
    <>
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
