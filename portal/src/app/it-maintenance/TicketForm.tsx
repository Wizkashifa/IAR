"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/tickets/input";
import { TEAM_CHOICE, URGENCIES, URGENCY, type TicketTeam, type Urgency } from "@/lib/tickets/types";
import type { TicketFormState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send to the team"}
    </button>
  );
}

export default function TicketForm({ action, locations }: { action: (prev: TicketFormState, form: FormData) => Promise<TicketFormState>; locations: string[] }) {
  const [state, formAction] = useActionState(action, { errors: [] });
  const [team, setTeam] = useState<TicketTeam | "">("");
  const [room, setRoom] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");
  // Controlled, so what someone typed survives a round trip with errors.
  const [title, setTitle] = useState("");
  const [roomOther, setRoomOther] = useState("");
  const [equipment, setEquipment] = useState("");
  const [description, setDescription] = useState("");

  return (
    <form action={formAction} className="form">
      {state.errors.length > 0 && (
        <div className="error" role="alert">
          Please fix these and send it again:
          <ul>
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <fieldset className="section">
        <legend>Which team?</legend>
        <div className="choices">
          {(["facilities", "it"] as TicketTeam[]).map((t) => (
            <label key={t} className={`choice${team === t ? " on" : ""}`}>
              <input type="radio" name="team" value={t} checked={team === t} onChange={() => setTeam(t)} required />
              <strong>{TEAM_CHOICE[t].label}</strong>
              <small>{TEAM_CHOICE[t].hint}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Where and what</legend>
        <label className="field">
          <span>What do you need, in a few words?</span>
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} required placeholder={team === "it" ? "Projector in Room 240 shows no picture" : "Faucet in the wudu area keeps dripping"} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Where is it?</span>
            <select name="room" value={room} onChange={(e) => setRoom(e.target.value)} required>
              <option value="" disabled>
                Choose a room or area
              </option>
              {locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          {room === "Other" ? (
            <label className="field">
              <span>Where exactly?</span>
              <input name="roomOther" value={roomOther} onChange={(e) => setRoomOther(e.target.value)} maxLength={120} placeholder="Library, 2nd floor hallway…" />
            </label>
          ) : (
            <label className="field">
              <span>Equipment (if you know)</span>
              <input name="equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} maxLength={120} placeholder={team === "it" ? "Ceiling projector, office printer…" : "Rooftop AC unit, left faucet…"} />
            </label>
          )}
        </div>
        {room === "Other" && (
          <label className="field">
            <span>Equipment (if you know)</span>
            <input name="equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} maxLength={120} />
          </label>
        )}
        <label className="field">
          <span>Details</span>
          <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={DESCRIPTION_MAX} required placeholder="What happened or what you need, when, and anything you already tried." />
        </label>
        <label className="field">
          <span>Photos (optional)</span>
          <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.heic,.heif" />
          <small>A photo often saves the team a trip. JPEG, PNG, HEIC or WebP, up to 10 MB each.</small>
        </label>
      </fieldset>

      <fieldset className="section">
        <legend>How urgent is it?</legend>
        <div className="choices">
          {URGENCIES.map((u) => (
            <label key={u} className={`choice${urgency === u ? " on" : ""}`}>
              <input type="radio" name="urgency" value={u} checked={urgency === u} onChange={() => setUrgency(u)} />
              <strong>{URGENCY[u].label}</strong>
              <small>
                {URGENCY[u].hint} The team aims to pick it up {URGENCY[u].target}.
              </small>
            </label>
          ))}
        </div>
        {urgency === "urgent" && <p className="callout warn">If anyone is in danger (fire, gas, flooding near power), call 911 first, then tell the front office.</p>}
      </fieldset>

      <Submit />
    </form>
  );
}
