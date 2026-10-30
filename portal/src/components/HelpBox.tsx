"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { helpGuide, type HelpKey } from "@/lib/help";
import { findModule } from "@/lib/modules";
import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./HelpBox.module.css";

const storageKey = (key: HelpKey) => `iar.help.hidden.${key}`;

function readHidden(key: HelpKey): boolean {
  try {
    return window.localStorage.getItem(storageKey(key)) === "1";
  } catch {
    return false;
  }
}

function writeHidden(key: HelpKey, hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(storageKey(key), "1");
    else window.localStorage.removeItem(storageKey(key));
  } catch {
    // Storage blocked (private window): the box just shows again next time.
  }
}

/**
 * "How this works": three to five plain steps at the top of a page, from
 * lib/help.ts, with a link to the full guide. Hiding it is remembered in this
 * browser; a small "How this works" link brings it back. Shows nothing until
 * the browser has said which, so it never flashes open for someone who hid it.
 */
export function HelpBox({ module }: { module: HelpKey }) {
  const guide = helpGuide(module);
  const accent = guide?.module ? findModule(guide.module)?.accent : undefined;
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => setHidden(readHidden(module)), [module]);
  if (!guide || hidden === null) return null;

  const set = (h: boolean) => {
    writeHidden(module, h);
    setHidden(h);
  };

  if (hidden) {
    return (
      <p className={styles.reopen} data-mod={accent}>
        <Button variant="quiet" size="small" icon="help" onClick={() => set(false)} aria-expanded="false">
          How this works
        </Button>
      </p>
    );
  }

  const id = `help-${module}`;
  return (
    <section className={styles.box} aria-labelledby={id} data-mod={accent}>
      <div className={styles.head}>
        <Icon name="book" />
        <h2 id={id} className={styles.title}>
          How this works
        </h2>
        <Button variant="quiet" size="small" icon="x" iconOnly onClick={() => set(true)} title="Hide" className={styles.close}>
          Hide how this works
        </Button>
      </div>
      <ol className={styles.steps}>
        {guide.short.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <div className={styles.foot}>
        <Link href={`/help/${guide.key}`} className={styles.more}>
          More help: the full guide
          <Icon name="chevR" size="sm" />
        </Link>
        <Button variant="quiet" size="small" onClick={() => set(true)}>
          Got it, hide this
        </Button>
      </div>
    </section>
  );
}
