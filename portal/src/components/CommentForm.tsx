"use client";
import { useId, useRef, useState } from "react";
import { COMMENT_MAX, type Mention } from "@/lib/comments";
import { initials } from "@/lib/text";
import { Button } from "./Button";
import styles from "./Activity.module.css";

/** The "@name" being typed just before the cursor, if any: where it starts and what's typed so far. */
function typing(text: string, caret: number): { at: number; q: string } | null {
  const m = /(?:^|\s)@([\p{L}\p{N}.'’-]*(?: [\p{L}\p{N}.'’-]*)?)$/u.exec(text.slice(0, caret));
  return m ? { at: caret - m[1].length - 1, q: m[1].toLowerCase() } : null;
}

const SHOWN = 6;

/**
 * The box to add a comment. Typing @ lists `people` (those who can open the
 * request) to name one: they hear about it. `replies` are ready-made answers
 * (the facilities team's): tapping one fills the box, which can be edited
 * before sending.
 */
export function CommentForm({ id, action, noun, replies, people = [] }: { id: string; action: (form: FormData) => Promise<void>; noun: string; replies?: string[]; people?: Mention[] }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [ask, setAsk] = useState<{ at: number; q: string } | null>(null);
  const [active, setActive] = useState(0);
  // A first name, last name or the start of the whole name.
  const matches = ask ? people.filter((p) => ` ${p.name.toLowerCase()}`.includes(` ${ask.q}`)).slice(0, SHOWN) : [];
  const open = matches.length > 0;

  const look = () => {
    const el = box.current;
    if (!el || !people.length) return;
    const next = typing(el.value, el.selectionStart ?? el.value.length);
    setAsk(next);
    if (next?.q !== ask?.q) setActive(0);
  };
  const pick = (p: Mention) => {
    const el = box.current;
    if (!el || !ask) return;
    const caret = el.selectionStart ?? el.value.length;
    const before = `${el.value.slice(0, ask.at)}@${p.name} `;
    el.value = before + el.value.slice(caret);
    el.focus();
    el.setSelectionRange(before.length, before.length);
    setAsk(null);
  };

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
      <div className={styles.boxWrap}>
        <textarea
          ref={box}
          name="text"
          rows={3}
          maxLength={COMMENT_MAX}
          required
          aria-label="Comment"
          className={styles.box}
          placeholder={`Ask a question or add context. Everyone who can open this ${noun} sees it.${people.length ? " Type @ to name someone." : ""}`}
          role={people.length ? "combobox" : undefined}
          aria-autocomplete={people.length ? "list" : undefined}
          aria-expanded={people.length ? open : undefined}
          aria-controls={people.length ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onInput={look}
          onClick={look}
          onBlur={() => setAsk(null)}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[Math.min(active, matches.length - 1)]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setAsk(null);
            }
          }}
        />
        {people.length > 0 && (
          <ul id={listId} role="listbox" aria-label="People to name" className={styles.mentionList} hidden={!open}>
            {matches.map((p, i) => (
              <li
                key={p.email}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={styles.mentionOption}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className={styles.av} aria-hidden="true">
                  {initials(p.name)}
                </span>
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="row end">
        <Button type="submit" size="small">
          Comment
        </Button>
      </div>
    </form>
  );
}
