"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spotlight, createSpotlight } from "@mantine/spotlight";
import { Icon, type IconName } from "./Icon";
import styles from "./Search.module.css";

export type SearchPlace = { label: string; href: string; icon: IconName };
type Result = { id: string; title: string; sub: string; href: string };

const [store, panel] = createSpotlight();
/** Open the search from anywhere (the drawer's search box uses it). */
export const openSearch = panel.open;

/**
 * The header search. Looks like a search box; opens a search panel that finds
 * requests by number or words (only ones you can open) and the portal's
 * pages. Enter without picking a result opens the full search page.
 * Shortcut: "/" or Ctrl/⌘+K.
 */
export function Search({ places, variant = "header" }: { places: SearchPlace[]; variant?: "header" | "drawer" }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setBusy(false);
      return;
    }
    const n = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { results?: Result[] };
        if (n === seq.current) setResults(data.results ?? []);
      } catch {
        if (n === seq.current) setResults([]);
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const go = (href: string) => {
    panel.close();
    router.push(href);
  };
  const all = () => go(`/search?q=${encodeURIComponent(query.trim())}`);
  const q = query.trim().toLowerCase();
  const pages = places.filter((p) => !q || p.label.toLowerCase().includes(q));

  return (
    <>
      <button type="button" className={variant === "drawer" ? styles.drawerTrigger : styles.trigger} onClick={openSearch} aria-label="Search requests and pages">
        <Icon name="search" />
        <span>Search requests</span>
        {variant === "header" && <kbd className={styles.kbd}>/</kbd>}
      </button>
      {variant === "header" && (
        <Spotlight.Root
          store={store}
          query={query}
          onQueryChange={setQuery}
          shortcut={["mod + K", "/"]}
          clearQueryOnClose
          scrollable
          maxHeight={420}
          classNames={{
            content: styles.content,
            search: styles.search,
            action: styles.action,
            actionLabel: styles.actionLabel,
            actionDescription: styles.actionDescription,
            actionSection: styles.actionSection,
            actionsGroup: styles.group,
            empty: styles.empty,
            footer: styles.footer,
          }}
        >
          <Spotlight.Search
            placeholder="Request number (PO-12001, EV-1101) or words"
            leftSection={<Icon name="search" />}
            aria-label="Search requests and pages"
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === "NumpadEnter") && store.getState().selected === -1 && query.trim()) {
                e.preventDefault();
                all();
              }
            }}
          />
          <Spotlight.ActionsList>
            {results.length > 0 && (
              <Spotlight.ActionsGroup label="Requests">
                {results.map((r) => (
                  <Spotlight.Action key={r.id} label={r.title} description={r.sub} leftSection={<Icon name="inbox" />} onClick={() => go(r.href)} />
                ))}
              </Spotlight.ActionsGroup>
            )}
            {pages.length > 0 && (
              <Spotlight.ActionsGroup label="Pages">
                {pages.map((p) => (
                  <Spotlight.Action key={p.href} label={p.label} leftSection={<Icon name={p.icon} />} onClick={() => go(p.href)} />
                ))}
              </Spotlight.ActionsGroup>
            )}
            {q && (
              <Spotlight.Action label={`See all results for “${query.trim()}”`} leftSection={<Icon name="search" />} onClick={all} />
            )}
            {q && !busy && results.length === 0 && pages.length === 0 && (
              <Spotlight.Empty>No requests you can open match “{query.trim()}”. Press Enter to search everything.</Spotlight.Empty>
            )}
          </Spotlight.ActionsList>
          <Spotlight.Footer>
            <span className={styles.foot}>{busy ? "Searching…" : "↑ ↓ to move · Enter to open · Esc to close"}</span>
          </Spotlight.Footer>
        </Spotlight.Root>
      )}
    </>
  );
}
