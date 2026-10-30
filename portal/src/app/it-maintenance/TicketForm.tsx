"use client";
import { useActionState, useState } from "react";
import { FormStarted } from "@/components/FormStarted";
import { Button } from "@/components/Button";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, FormActions } from "@/components/Field";
import { FileDrop } from "@/components/FileDrop";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/tickets/input";
import { TEAM_CHOICE, URGENCIES, URGENCY, type TicketTeam, type Urgency } from "@/lib/tickets/types";
import { FormErrors, type FormState } from "@/components/FormErrors";
import { Choice, Choices } from "@/components/Choices";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];

export default function TicketForm({ action, locations }: { action: (prev: FormState, form: FormData) => Promise<FormState>; locations: string[] }) {
  const [state, formAction] = useActionState(action, { errors: [] });
  const [team, setTeam] = useState<TicketTeam | "">("");
  const [room, setRoom] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");
  // Controlled, so what someone typed survives a round trip with errors.
  const [title, setTitle] = useState("");
  const [roomOther, setRoomOther] = useState("");
  const [equipment, setEquipment] = useState("");
  const [description, setDescription] = useState("");

  const equipmentField = (
    <Field label="Equipment (if you know)">
      <input name="equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} maxLength={120} placeholder={team === "it" ? "Ceiling projector, office printer…" : "Rooftop AC unit, left faucet…"} />
    </Field>
  );

  return (
    <form action={formAction} className="stack">
      <FormStarted form="ticket" />
      <FormErrors errors={state.errors} />

      <Panel title="Which team?">
        <Choices legend="Which team?" legendHidden>
          {(["facilities", "it"] as TicketTeam[]).map((t) => (
            <Choice key={t} type="radio" name="team" value={t} checked={team === t} onChange={() => setTeam(t)} required label={<strong>{TEAM_CHOICE[t].label}</strong>} hint={TEAM_CHOICE[t].hint} />
          ))}
        </Choices>
      </Panel>

      <Panel title="Where and what">
        <div className="stack">
          <Field label="What do you need, in a few words?" required>
            <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} required placeholder={team === "it" ? "Projector in Room 240 shows no picture" : "Faucet in the wudu area keeps dripping"} />
          </Field>
          <div className="grid">
            <Field label="Where is it?" required>
              <select name="room" value={room} onChange={(e) => setRoom(e.target.value)} required>
                <option value="" disabled>
                  Choose a room or area
                </option>
                {locations.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            {room === "Other" ? (
              <Field label="Where exactly?">
                <input name="roomOther" value={roomOther} onChange={(e) => setRoomOther(e.target.value)} maxLength={120} placeholder="Library, 2nd floor hallway…" />
              </Field>
            ) : (
              equipmentField
            )}
          </div>
          {room === "Other" && equipmentField}
          <Field label="Details" required hint="What happened, when, and what you tried.">
            <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={DESCRIPTION_MAX} required />
          </Field>
          <FileDrop name="photos" label="Photos (optional)" hint="A photo often saves the team a trip." accept={PHOTO_TYPES} camera />
        </div>
      </Panel>

      <Panel title="How urgent is it?">
        <div className="stack">
          <Choices legend="How urgent is it?" legendHidden>
            {URGENCIES.map((u) => (
              <Choice key={u} type="radio" name="urgency" value={u} checked={urgency === u} onChange={() => setUrgency(u)} label={<strong>{URGENCY[u].label}</strong>} hint={URGENCY[u].hint} />
            ))}
          </Choices>
          {urgency === "urgent" && <Note tone="warn">If anyone is in danger (fire, gas, flooding near power), call 911 first, then tell the front office.</Note>}
        </div>
      </Panel>

      <FormActions>
        <Button href="/it-maintenance" variant="quiet">
          Cancel
        </Button>
        <SubmitButton>Send to the team</SubmitButton>
      </FormActions>
    </form>
  );
}
