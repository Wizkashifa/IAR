import { fileSize, fmtDate } from "@/lib/format";
import styles from "./FileList.module.css";

export type ListedFile = { name: string; url?: string; size: number; /** Who added it, in words ("you", a name). */ by?: string; at?: string };

/** The files on a request (receipts, artwork, photos): each opens in Google Drive, with its size and who added it when. */
export function FileList({ files, empty }: { files: ListedFile[]; empty: string }) {
  if (files.length === 0) return <p className={styles.empty}>{empty}</p>;
  return (
    <ul className={styles.list}>
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`}>
          {f.url ? (
            <a href={f.url} target="_blank" rel="noreferrer" className={styles.name}>
              {f.name}
              <span className="sr-only"> (opens in Google Drive)</span>
            </a>
          ) : (
            <span className={styles.name}>{f.name}</span>
          )}
          <span className={styles.meta}>{[fileSize(f.size), [f.by, f.at && fmtDate(f.at)].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
        </li>
      ))}
    </ul>
  );
}
