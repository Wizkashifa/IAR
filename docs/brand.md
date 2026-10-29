# IAR brand in the portal

From IAR's brand guide ("New IAR Logos & Style guides", 2026). The portal and the demo follow it. The values live in `portal/src/styles/tokens.css` and in the demo's `:root`. Pages never use a raw colour.

## Logos

| File | Use on |
|---|---|
| `portal/public/brand/iar-logo-white.png` | The dark green header and menu, and other dark backgrounds |
| `portal/public/brand/iar-logo-green.png` | White and cream backgrounds |
| `portal/public/brand/iar-logo-dark.png` | White and cream backgrounds, where the brand green would be too bright, and print |

These are the stacked mark with "IAR", trimmed, on a transparent background. The guide also has versions with "Islamic Association of Raleigh" beside or below the mark, which suit printed pieces. The portal header uses the mark with "Portal" set beside it in Montserrat.

## Fonts

| Use | Font |
|---|---|
| Page titles | Montserrat Bold |
| Home greeting | Fraunces Italic (a portal choice beyond the guide: a warmer welcome) |
| Section titles, panel titles, subheadings | Montserrat Semibold |
| Body text, forms, lists | Lato Regular (Bold for emphasis) |

The portal loads both fonts with `next/font` (`portal/src/app/fonts.ts`), so they're served by the portal itself. The demo loads them from Google Fonts.

## Colours

### Brand colours

| Colour | Hex | In the portal |
|---|---|---|
| Brand green | #008040 | The one main button on a page (a lighter #52C285 in dark mode), the step bar, selected states (`--accent`), and Events' module colour |
| Dark green | #0B3A24 | Header and menu background (`--brand-green`, with `--nav-bg` for the menu), calendar holds |
| Gold | #C7A154 | Means "needs you" and "selected": the "needs you" row edge and current step, the selected menu icon, today on the calendar. Also the header rule and pattern, and section-title lines (`--gold`). Never a module colour or a button |

### Complementary colours

| Colour | Hex | In the portal |
|---|---|---|
| Taupe | #A38C71 | Booked time on room calendars; deepened, the Payments module colour (`--mod-pay`, #6B5A44 for text) |
| Orange | #F37621 | Not used yet; a lighter tint is the dark-mode "needs attention" colour |
| Yellow | #FFD23E | Not used yet (too light for text on light backgrounds) |
| Mauve | #A78B8C | Not used yet |
| Rust | #AA5125 | "Needs attention" (`--warn`), as a deeper shade for text |
| Teal | #004D4E | "Waiting on others" (`--info`) |

### Text needs enough contrast

Gold, taupe, orange, yellow and mauve are all under 4.5:1 against white and cream, the minimum for readable text. Use them for lines, edges, fills and icons on light backgrounds, not for text. Gold is fine as text on the dark green header (5.3:1). Small gold text on cream uses `--gold-text` (#7A5D22), and the focus ring uses a darker gold, `--focus` (#8A6A2C), to stay 3:1 on white; on the green header and menu the ring is light gold.

The guide's brand green and rust are just under 4.5:1 on the tinted pill backgrounds, so text uses slightly deeper shades of them. Fills and buttons keep the guide's own values.

| Token | Value | Shade of | Contrast |
|---|---|---|---|
| `--accent-text`, `--ok` (links, "done" text) | #007038 | Brand green #008040 | 5.3:1 on the green tint, 5.8:1 on cream |
| `--warn` ("needs attention" text) | #9A4820 | Rust #AA5125 | 5.4:1 on the rust tint |
| `--info` ("waiting" text) | #004D4E | Teal, as is | 8.1:1 on the teal tint |
| White on `--accent` (main button) | #FFFFFF on #008040 | — | 5.1:1 |
| `--mod-pay` (Payments text and icons) | #6B5A44 | Taupe #A38C71 | 5.6:1 on its tint, 6.6:1 on white |

`guard.test.ts` checks every text and control colour pair in light and dark, so a token that drops below these fails the build.

Dark mode ("Dark v2") keeps warm charcoal surfaces and the dark green header with its gold line; the menu turns neutral charcoal with a thin line on its right. Fields, menus and popovers sit a step lighter than cards. Gold in dark mode is for the header line, menu counts and the selected menu item, plus "needs you". The pattern and the gold illustrations show at half strength (`--pattern-opacity`). Actions stay green there (`--accent` #52C285, with dark green text on the main button), gold keeps meaning "needs you" and "selected", status pills are outlined in their colour, and every text colour is 5:1 or more on its background.

## When the guide changes

1. Update this page.
2. Update `tokens.css`, `fonts.ts` and the logo files in `portal/public/brand/`.
3. Update the demo's `:root` and its header logo.
4. Check `/dev/styles` in light and dark.
