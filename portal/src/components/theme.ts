import { createTheme, Input, type CSSVariablesResolver, type MantineColorsTuple } from "@mantine/core";

/**
 * Mantine's theme, pointed at our tokens (src/styles/tokens.css) so its
 * widgets share the portal's colours, fonts and corners, in light and dark.
 * No colour values live here: change a colour in tokens.css.
 */

// Mantine wants ten shades per colour. Ours come from tokens, which already switch for dark mode.
const iar: MantineColorsTuple = [
  "var(--accent-soft)", "var(--accent-soft)", "var(--accent-soft)", "var(--accent)", "var(--accent)",
  "var(--accent)", "var(--accent)", "var(--accent)", "var(--accent)", "var(--accent)",
];
// Mantine draws dark-mode inputs and menus from its "dark" colour.
const dark: MantineColorsTuple = [
  "var(--ink)", "var(--ink-2)", "var(--ink-3)", "var(--ink-3)", "var(--line)",
  "var(--line)", "var(--surface-2)", "var(--surface)", "var(--bg)", "var(--bg)",
];

export const theme = createTheme({
  primaryColor: "iar",
  colors: { iar, dark },
  primaryShade: { light: 6, dark: 6 },
  fontFamily: "var(--font)",
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, monospace",
  headings: { fontFamily: "var(--font-head)", fontWeight: "600" },
  defaultRadius: "md",
  radius: { xs: "4px", sm: "var(--r-sm)", md: "var(--r-sm)", lg: "var(--r)", xl: "var(--r)" },
  shadows: { xs: "var(--shadow-1)", sm: "var(--shadow-1)", md: "var(--shadow-2)", lg: "var(--shadow-2)", xl: "var(--shadow-2)" },
  fontSizes: { xs: "12px", sm: "13.5px", md: "15px", lg: "16px", xl: "18px" },
  cursorType: "pointer",
  focusRing: "never", // base.css draws the gold focus ring for everything
  components: {
    // Mantine's fields are as tall as the portal's own, and as large on a phone (16px, so iOS doesn't zoom).
    Input: Input.extend({ vars: () => ({ wrapper: { "--input-height": "var(--control-h)", "--input-fz": "var(--field-font)" } }) }),
  },
});

const shared = {
  "--mantine-color-body": "var(--popover-bg)",
  "--mantine-color-text": "var(--ink)",
  "--mantine-color-dimmed": "var(--ink-2)",
  "--mantine-color-placeholder": "var(--ink-3)",
  "--mantine-color-anchor": "var(--accent-text)",
  "--mantine-color-error": "var(--bad)",
  "--mantine-color-default": "var(--surface)",
  "--mantine-color-default-hover": "var(--surface-2)",
  "--mantine-color-default-color": "var(--ink)",
  "--mantine-color-default-border": "var(--ctl)",
  "--mantine-primary-color-filled": "var(--accent)",
  "--mantine-primary-color-filled-hover": "var(--accent)",
  "--mantine-primary-color-light": "var(--accent-soft)",
  "--mantine-primary-color-light-hover": "var(--accent-soft)",
  "--mantine-primary-color-light-color": "var(--accent-text)",
  "--mantine-primary-color-contrast": "var(--accent-ink)",
};

export const cssVariablesResolver: CSSVariablesResolver = () => ({ variables: {}, light: shared, dark: shared });
