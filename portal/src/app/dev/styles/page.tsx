import { notFound } from "next/navigation";
import { isDevAuth } from "@/lib/dev";
import { Button } from "@/components/Button";
import { Pill, type Tone } from "@/components/Pill";
import { Panel } from "@/components/Panel";
import { Note } from "@/components/Note";
import { KeyValue } from "@/components/KeyValue";
import { EmptyState } from "@/components/EmptyState";
import { Field, FormActions } from "@/components/Field";
import { Icon, IconTile, ICON_NAMES } from "@/components/Icon";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Widgets } from "./Widgets";
import { Pieces } from "./Pieces";
import { RequestExamples } from "./RequestExamples";
import styles from "./styles.module.css";

export const dynamic = "force-dynamic";

const COLOURS: [string, string[]][] = [
  ["Surfaces", ["--bg", "--surface", "--surface-2", "--line"]],
  ["Text", ["--ink", "--ink-2", "--ink-3"]],
  ["Brand", ["--accent", "--accent-text", "--accent-soft", "--gold", "--gold-light", "--cream", "--brand-green"]],
  ["Meaning", ["--ok", "--ok-soft", "--warn", "--warn-soft", "--bad", "--bad-soft", "--info", "--info-soft"]],
  ["Calendar", ["--hold-booking", "--hold-request"]],
  ["Controls and focus", ["--ctl", "--focus", "--gold-text", "--empty-stroke"]],
  ["Menu and header", ["--nav-bg", "--nav-on", "--nav-text", "--nav-group", "--nav-on-text", "--header-input-bg", "--header-placeholder"]],
  ["Page heads", ["--head-band", "--news-bg", "--news-line"]],
  ["Module accents", ["--mod-events", "--mod-events-soft", "--mod-pay", "--mod-pay-soft", "--mod-mkt", "--mod-mkt-soft", "--mod-it", "--mod-it-soft"]],
];
const TONES: Tone[] = ["neutral", "ok", "warn", "bad", "info", "accent"];

/**
 * Every token and shared component in one place, in light and dark (dev mode
 * only). Start here when changing how the portal looks; see docs/design-system.md.
 */
export default function StylesPage() {
  if (!isDevAuth()) notFound();
  return (
    <div className="stack loose">
      <div className="row between">
        <div>
          <h1>Styles</h1>
          <p className="lead">Every colour, type size and shared component. Values live in src/styles/tokens.css; components in src/components.</p>
        </div>
        <ThemeSwitch />
      </div>

      <Panel title="Colours" right="tokens.css">
        <div className="stack">
          {COLOURS.map(([group, names]) => (
            <div key={group}>
              <h3>{group}</h3>
              <div className={styles.swatches}>
                {names.map((n) => (
                  <div key={n} className={styles.swatch}>
                    <span className={styles.chip} style={{ background: `var(${n})` }} />
                    <code>{n}</code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Type">
        <div className="stack">
          <p className="greet">Assalamu alaikum, Sample</p>
          <h1>Page title (Montserrat Bold 24)</h1>
          <h2>Section title (Montserrat Semibold 15)</h2>
          <p>Body text in Lato at 15px. Requests, forms and lists use this size so they read easily on a phone.</p>
          <p className="lead">A lead line: one sentence under a page title saying what the page is for.</p>
          <p className="muted small">Small supporting text, for dates, IDs and hints.</p>
        </div>
      </Panel>

      <Panel title="Buttons">
        <div className="stack">
          <div className="row">
            <Button variant="primary">Send request</Button>
            <Button>Save draft</Button>
            <Button variant="danger">Withdraw</Button>
            <Button variant="quiet">More</Button>
            <Button icon="plus">With an icon</Button>
            <Button disabled>Not available</Button>
          </div>
          <div className="row">
            <Button size="small" variant="primary">Small main</Button>
            <Button size="small">Small</Button>
            <Button href="/dev/styles" size="small" icon="chevR">A link that looks like a button</Button>
          </div>
        </div>
      </Panel>

      <Panel title="Module accents" right="IconTile in components/Icon.tsx: menu chip, item tile, page-head tile">
        <div className="row">
          {(["events", "pay", "mkt", "it"] as const).map((a) => (
            <span key={a} className="row">
              <IconTile accent={a} size={56} tone="solid" />
              <IconTile accent={a} size={44} />
              <IconTile accent={a} />
            </span>
          ))}
          <IconTile name="book" />
        </div>
      </Panel>

      <Panel title="Status pills" right="Triangle = you need to act · clock = waiting on others · check = done · slashed circle = stopped or late">
        <div className="stack">
          <div className="row">
            {TONES.map((t) => (
              <Pill key={t} tone={t} status>
                {t}
              </Pill>
            ))}
          </div>
          <div className="row">
            <Pill tone="warn" status>Changes requested</Pill>
            <Pill tone="info" status>Chair approval</Pill>
            <Pill tone="ok" status>Approved</Pill>
            <Pill tone="bad" status>Declined</Pill>
            <Pill>3</Pill>
          </div>
        </div>
      </Panel>

      <div className={styles.two}>
        <Panel title="A panel with a header row" right={<Pill tone="warn">2</Pill>}>
          <p>Section titles sit inside the card. The right side holds a count or an action.</p>
        </Panel>
        <Panel title="Details" right="Set by the IT team">
          <KeyValue
            items={[
              { label: "Requested by", value: "Sample Chair" },
              { label: "Committee", value: "Youth" },
              { label: "Waiting on", value: "Sample Director (director)" },
              { label: "Not shown when empty", value: "" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Notes">
        <div className="stack">
          <Note tone="info">Marketing unlocks after approval. No advertising before then.</Note>
          <Note tone="warn">13 days away. Marketing asks for 3 weeks to promote public events.</Note>
          <Note tone="ok">Sent. Sample Director will review it.</Note>
          <Note tone="bad">The receipt for the snacks is missing. Please attach it.</Note>
        </div>
      </Panel>

      <Panel title="Empty state" flush>
        <div className={styles.two}>
          <EmptyState title="All caught up">Nothing is waiting on you right now.</EmptyState>
          <EmptyState action={<Button size="small">New event request</Button>}>You haven&apos;t asked for anything here yet.</EmptyState>
        </div>
      </Panel>

      <Panel title="Form fields">
        <form className="stack">
          <div className="grid">
            <Field label="Program title" required hint="A few words people will recognise.">
              <input name="title" defaultValue="Youth Game Night" />
            </Field>
            <Field label="Sponsoring committee">
              <select name="committee" defaultValue="Youth">
                <option>Youth</option>
                <option>Education</option>
              </select>
            </Field>
            <Field label="Expected attendance" error="Room 220 holds 20 people." htmlFor="att">
              <input id="att" name="att" type="number" defaultValue={60} aria-describedby="att-error" />
            </Field>
            <Field label="Tell us about the event" className="wide">
              <textarea name="about" rows={3} />
            </Field>
          </div>
          <FormActions>
            <Button type="button" variant="primary">Send request</Button>
            <Button type="button" variant="quiet">Cancel</Button>
          </FormActions>
        </form>
      </Panel>

      <Pieces />

      <Widgets />

      <RequestExamples />

      <Panel title={`Icons (${ICON_NAMES.length})`} right="components/Icon.tsx">
        <div className={styles.icons}>
          {ICON_NAMES.map((n) => (
            <div key={n} className={styles.icon}>
              <Icon name={n} size="lg" />
              <code>{n}</code>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
