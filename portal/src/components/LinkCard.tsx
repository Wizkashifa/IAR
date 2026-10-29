import Link from "next/link";
import type { ReactNode } from "react";
import type { Kind } from "@/lib/kinds";
import { findModule, type Accent } from "@/lib/modules";
import { Icon, IconTile, type IconName } from "./Icon";
import styles from "./LinkCard.module.css";

/**
 * A card that opens something: an icon, a title and a line about it (the
 * marketing request types, the help guides, the new-request tiles). With
 * `accent` the icon sits in the module's tile; `cta` adds a "Start →" line in
 * its colour. Put several in `LinkCards`.
 */
export function LinkCard({ href, icon, title, children, accent, cta }: { href: string; icon?: IconName; title: ReactNode; children: ReactNode; accent?: Accent; cta?: string }) {
  return (
    <li>
      <Link href={href} className={styles.card} data-mod={accent}>
        <IconTile name={icon} accent={accent} size={44} />
        <span className={styles.body}>
          <span className={styles.title}>{title}</span>
          <span className={styles.text}>{children}</span>
          {cta && (
            <span className={styles.cta}>
              {cta} <Icon name="chevR" size="sm" />
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

/** A grid of LinkCards. `tiles`: the narrower tiles of the new-request choices (two across on a phone). */
export function LinkCards({ label, tiles, children }: { label: string; tiles?: boolean; children: ReactNode }) {
  return (
    <ul className={`${styles.grid}${tiles ? ` ${styles.tiles}` : ""}`} aria-label={label}>
      {children}
    </ul>
  );
}

/** The kinds of request someone can start, as tiles (home, /requests/new). `kinds`: the ones whose module they can use. */
export function NewRequestTiles({ kinds }: { kinds: Kind[] }) {
  return (
    <LinkCards label="Start a request" tiles>
      {kinds.map((k) => (
        <LinkCard key={k.type} href={`${k.path}/new`} accent={findModule(k.module)?.accent} title={k.newLabel} cta="Start">
          {k.blurb}
        </LinkCard>
      ))}
    </LinkCards>
  );
}
