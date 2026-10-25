"use client";
import { useRef } from "react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import styles from "./tickets.module.css";

/** Ready-made replies for the team, as in the demo. Tapping one fills the box; it can be edited before sending. */
const REPLIES = ["Need more info: can you add a photo or the exact room?", "On it. I'll update you by end of day.", "Fixed. Please confirm it works for you."];

/** The comment box on a ticket. `replies` shows the ready-made replies (for the team). */
export function CommentBox({ id, max, action, replies }: { id: string; max: number; action: (form: FormData) => Promise<void>; replies?: boolean }) {
  const box = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="id" value={id} />
      {replies && (
        <div className={styles.replies} role="group" aria-label="Ready-made replies">
          {REPLIES.map((r) => (
            <button
              key={r}
              type="button"
              className={styles.reply}
              onClick={() => {
                if (!box.current) return;
                box.current.value = r;
                box.current.focus();
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      <Field label="Add a comment" hint="Everyone who can open this ticket sees it.">
        <textarea ref={box} name="text" rows={3} maxLength={max} required className={styles.textarea} />
      </Field>
      <div>
        <Button type="submit">
          Comment
        </Button>
      </div>
    </form>
  );
}
