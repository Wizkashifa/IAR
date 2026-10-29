import { Button, buttonClass } from "./Button";
import styles from "./SearchForm.module.css";

/**
 * A search box with its button, on a page that lists things (the Library,
 * Who's who, saved vendors, search). It reloads the page with ?q=…, so the
 * server does the searching. `clear` adds a link back to the full list once
 * something is searched.
 */
export function SearchForm({ action, label, placeholder, value, clear, autoFocus }: { action: string; label: string; placeholder: string; value?: string; clear?: boolean; autoFocus?: boolean }) {
  return (
    <form action={action} className={styles.form} role="search">
      <input type="search" name="q" defaultValue={value} placeholder={placeholder} aria-label={label} maxLength={100} autoFocus={autoFocus} />
      <Button type="submit" icon="search">
        Search
      </Button>
      {clear && value && (
        <a href={action} className={buttonClass({ variant: "quiet" })}>
          Clear
        </a>
      )}
    </form>
  );
}
