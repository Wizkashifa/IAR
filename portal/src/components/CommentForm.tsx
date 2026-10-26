"use client";
import { useRef } from "react";
import { COMMENT_MAX } from "@/lib/comments";
import { Button } from "./Button";
import styles from "./Activity.module.css";

/** The box to add a comment. `replies` are ready-made answers (the facilities team's): tapping one fills the box, which can be edited before sending. */
export function CommentForm({ id, action, noun, replies }: { id: string; action: (form: FormData) => Promise<void>; noun: string; replies?: string[] }) {
  const box = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="id" value={id} />
      {replies && replies.length > 0 && (
        <div className={styles.replies} role="group" aria-label="Ready-made replies">
          {replies.map((r) => (
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
      <textarea ref={box} name="text" rows={3} maxLength={COMMENT_MAX} required aria-label="Comment" className={styles.box} placeholder={`Ask a question or add context. Everyone who can open this ${noun} sees it.`} />
      <div className="row end">
        <Button type="submit" size="small">
          Comment
        </Button>
      </div>
    </form>
  );
}
