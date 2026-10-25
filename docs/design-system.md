# Design system: what makes the demo look right, and how the portal keeps it

The demo (`demo/index.html`) looks professional because of a small set of disciplined choices, not decoration. The portal is built on the same choices. This page lists them and the rules that keep the portal styled with web standards only, so it will still be easy to change in a year.

## What the demo gets right

### 1. One set of named values (tokens), used everywhere
Every colour, size, corner and shadow is a CSS custom property on `:root` (demo lines 7–49). Components never use a raw colour.

| Group | Tokens | Why it matters |
|---|---|---|
| Surfaces | `--bg`, `--surface`, `--surface-2`, `--line` | Three levels of background (page, card, sunken row or hover) give depth without heavy borders |
| Text | `--ink`, `--ink-2`, `--ink-3` | Three levels of text: content, supporting, labels and IDs. This is most of why the demo reads as calm |
| Brand | `--accent` (green), `--accent-text`, `--accent-soft`, `--gold`, `--gold-light`, `--cream` | Gold is used sparingly: the header rule, the primary button's edge, focus, and "needs you" |
| Meaning | `--ok`, `--warn`, `--bad`, `--info`, each with a `-soft` partner | Every status pill, note and list edge uses one of four tones, so colour always means the same thing |
| Space | `--s-1`…`--s-6` (4, 8, 12, 16, 24, 32px) | Every gap is on one scale, so spacing looks deliberate |
| Shape | `--r` (10px), `--r-sm` (8px), `--shadow-1`, `--shadow-2`, `--ring` | Cards get a barely-there shadow; menus and dialogs get a deeper one; focus is a soft gold ring |

### 2. Two typefaces, each with a clear job
IAR's 2026 brand guide sets the fonts (`brand.md`):
- **Lato** for body text and forms: highly readable at 13–15px.
- **Montserrat** for headings: Bold for page titles (24px), Semibold for section and panel titles (15px), and Black only for the home greeting ("Assalamu alaikum…").

The demo first used Source Sans 3, Outfit and Fraunces. The brand guide replaced them.

### 3. A few repeated building blocks
- **Panel:** a white card with a header row (`.panel-h`: title on the left, count or action on the right) and a body. Section titles sit inside the card, not floating above it.
- **List row** (`.item`): title + ID, a supporting line, and a status pill on the right. A 3px coloured inner edge says who has it: gold for you, blue for others, green for done, red for stopped. A chevron appears on hover. Section bands ("NEEDS YOU 3") are small uppercase labels on `--surface-2`.
- **Pill:** 22px tall, with a dot, in one of the four tones.
- **Key–value list** (`.kv`): label column in `--ink-2` and value column, for every details box.
- **Stages bar:** thin 4px bars, done in green, current in gold, then the label.
- **Notes:** `.note.info`, `.note.warn` and `.note.ok`, tinted with the matching soft tone.
- **Empty state:** a soft icon and one helpful sentence, centred.

### 4. Quiet controls
- **Buttons:** 36px tall, neutral border (`--line`), white, with a tiny shadow. Only the **primary** button is green with a gold edge, so there is one obvious next step per screen.
- **Inputs:** focus shows a gold border and soft ring.
- **Chips** for filters, and a **toast** with Undo for quick confirmations.
- **Motion:** short (120ms), only on colour and shadow.

### 5. Icons
About 40 line icons (Lucide/Feather style, 16px, 2px stroke) mark navigation, buttons and empty states. They make scanning faster.

### 6. Dark mode done as a palette, not a filter
Dark mode uses warm charcoal surfaces. The brand green stays on the header, and gold becomes the accent. A theme switch overrides the system setting.

## How the portal does styling

The aim is something a volunteer developer can open in six months and change confidently, with nothing that a framework upgrade can break. So: **web standards first, very few dependencies, and everything named.**

### Decisions

1. **Plain CSS with custom properties for our own pieces. No CSS framework and no CSS-in-JS.** Mantine is used only for a short list of hard widgets, wrapped in our own components (decision 8).
   - CSS custom properties, `@layer`, nesting, `:has()` and `:focus-visible` are browser standards. They don't get deprecated.
   - The demo is already written this way, so its styles move over almost one for one.
   - Tailwind, styled-components and similar tools each go through breaking major versions. They also make a future reader learn a tool on top of CSS.
2. **Tokens in one file**, `portal/src/styles/tokens.css`, copied from the demo. Light and dark values live there and nowhere else. Use `light-dark()` where it's safe on the phones IAR's volunteers use (check Baseline "widely available"); otherwise keep the demo's two blocks. Light and dark follow Mantine's colour-scheme attribute, so there is only one switch.
3. **Cascade layers set the order explicitly:** `@layer reset, tokens, base, components, pages;`. A page rule can never accidentally beat a component rule, which fixes the "later rule wins" problem.
4. **Shared pieces are React components with their own CSS Module.** These go in `portal/src/components/`: `Button`, `Pill`, `Panel`, `ItemRow`, `ItemList`, `Stages`, `KeyValue`, `Note`, `EmptyState`, `Field`, `Icon`, plus thin wrappers around Mantine: `DateField`, `RoomPicker`, `FileDrop`, `PeoplePicker`, `Confirm`, `toast`. CSS Modules are built into Next.js and are plain CSS files with locally scoped class names. Each component is one `.tsx` file and one `.module.css` file next to it.
5. **Pages compose components and use layout classes** (`stack`, `row`, `grid`, with gaps from the spacing tokens) instead of `style={{ … }}`.
6. **Icons are our own:** an `Icon` component holding the ~40 SVG paths the demo already uses, with no icon package. If a new icon is needed, copy its SVG from the Lucide site (ISC licence) into the same file.
7. **Fonts via `next/font/google`** instead of the Google Fonts `<link>`. Next.js downloads the fonts at build time and serves them from the portal itself. The page makes no outside call when it loads, text doesn't jump as fonts arrive, and the font choice sits in one file (`app/fonts.ts`). Same three faces as the demo, same jobs.
8. **Native elements where they're enough, Mantine where they aren't:** `<details>` for folded sections and the `popover` attribute for simple menus. Use Mantine, through our wrappers, for date and time pickers, the room and people pickers, file drop, confirm dialogs, toasts and the header search. Pages never import `@mantine/*` directly, so a Mantine major version touches only the wrappers.
9. **A living style page at `/dev/styles`** (dev mode only, like `/dev`). It shows every token and every component in each state, in light and dark. This is the reference to check in six months, with nothing extra to install or upgrade (no Storybook).
10. **Guard tests** in `npm test` (`src/styles/guard.test.ts`), strict since wave 4:
    - No raw colour values outside `tokens.css`. The only exceptions are the theme colour in `app/layout.tsx` and the colours in `app/manifest.ts`, which browsers read before any CSS loads; a test keeps them equal to the brand tokens.
    - No `@mantine/*` imports outside `src/components/` and the root layout.
    - No inline styles, except the swatches on `/dev/styles`.

    Two scripts check what tests can't, against a running dev server: `npm run a11y` (page titles, one h1, heading levels, labels, image alt text, link and button names, tap targets and sideways scroll on phones, text contrast in light and dark) and `npm run shots` (every screen next to its demo screen at desktop and phone width, light and dark, in `portal/.shots/report.html`). Both read the screen list in `portal/scripts/screens.cjs`.
11. **Keep dependencies few and current.** The portal has seven runtime dependencies besides Mantine's packages (`portal/package.json`), and nothing else gets added without a reason written in the pull request. Dependabot (`.github/dependabot.yml`) opens one grouped pull request a month per folder for minor and patch updates, and a separate one per major version, so updates arrive small and often instead of as a painful jump later. CI (`.github/workflows/ci.yml`) already runs tests, typecheck and build on every pull request.
12. **Write it down:** a short "Styling" section in `CLAUDE.md` that points here. Rules: use tokens, use components, no raw colours, and change the demo first if a screen needs to look different.

### File layout

```
portal/src/
  styles/
    tokens.css        colours (light and dark), type, spacing, radius, shadow, ring
    base.css          reset, body, headings, links, focus, layout classes (stack, row, grid)
  app/
    fonts.ts          next/font: Lato, Montserrat (brand.md)
    globals.css       @layer order, then @imports the two files above; nothing else
    dev/styles/       the living style page
  components/
    Button.tsx        Button.module.css
    Pill.tsx          Pill.module.css
    Panel.tsx         Panel.module.css
    ItemRow.tsx       ItemRow.module.css   (plus ItemList for the grouped sections)
    Stages.tsx        Stages.module.css
    KeyValue.tsx, Note.tsx, EmptyState.tsx, Field.tsx, Icon.tsx
    DateField.tsx, RoomPicker.tsx, PeoplePicker.tsx, FileDrop.tsx, Confirm.tsx, toast.tsx   (Mantine wrappers)
    theme.ts          Mantine theme, pointing at the CSS variables in tokens.css
    RequestPage.tsx   RequestPage.module.css   (one layout for every request page)
    Activity.tsx      comments and history on every request page (CommentForm.tsx: the box, with ready-made replies)
    Chips.tsx, Crumb.tsx, FlashNote.tsx, FormErrors.tsx   filter chips, breadcrumb, ?ok=/?error= messages, a form's errors
```

## Decided (Oct 25, 2026)

- **Mantine for the hard widgets only**, through our wrappers: date and time pickers, the room and people pickers, file drop, confirm dialogs, toasts and the header search. Panels, rows, pills, the step bar and the request page stay ours, built from the demo. Magic UI (animated landing-page pieces on Tailwind) is not a fit.
- **Desktop sidebar** from about 1000px wide; the drawer stays on phones.
- **The IT & Maintenance button** reads "AV/IT/Maintenance".
- **Names** come from the read-only Workspace user scope (`admin.directory.user.readonly`), which an IAR super admin approves in go-live.
