"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { latestWhatsNew, whatsNewSince, type WhatsNew } from "@/lib/whats-new";
import { Icon } from "./Icon";
import styles from "./WhatsNewNote.module.css";

const KEY = "iar.whatsNew.seen";

function readSeen(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * "What's new" on the home page: the entries in lib/whats-new.ts newer than
 * the last ones this browser dismissed. Shows nothing until the browser has
 * said what was seen, and nothing once everything has been.
 */
export function WhatsNewNote() {
  const [items, setItems] = useState<WhatsNew[] | null>(null);
  useEffect(() => setItems(whatsNewSince(readSeen())), []);
  if (!items || items.length === 0) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, latestWhatsNew());
    } catch {
      // Storage blocked: it shows again next visit.
    }
    setItems([]);
  };
  const shown = items.slice(0, 3);

  return (
    <section className={styles.note} aria-labelledby="whats-new">
      <div className={styles.head}>
        <Icon name="star" />
        <h2 id="whats-new" className={styles.title}>
          What&apos;s new in the portal
        </h2>
        <button type="button" className={styles.close} onClick={dismiss} aria-label="Hide what's new" title="Hide">
          <Icon name="x" />
        </button>
      </div>
      <ul className={styles.list}>
        {shown.map((e) => (
          <li key={e.title}>
            <strong>{e.title}.</strong> {e.text}
            {e.href && (
              <>
                {" "}
                <Link href={e.href}>Try it</Link>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className={styles.foot}>
        <Link href="/help/whats-new">
          {items.length > shown.length ? `See all ${items.length} new things` : "See everything new"}
        </Link>
        <button type="button" className={styles.got} onClick={dismiss}>
          Got it
        </button>
      </div>
    </section>
  );
}
