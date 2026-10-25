import { Lato, Montserrat } from "next/font/google";

/**
 * The portal's typefaces, from IAR's brand guide, downloaded at build time and
 * served by the portal itself: Montserrat for headings (Semibold for
 * subheadings, Bold for page titles, Black for the home greeting) and Lato for
 * reading and forms. tokens.css turns these into --font, --font-head and
 * --font-display.
 */
const body = Lato({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-body-face", display: "swap" });
const head = Montserrat({ subsets: ["latin"], weight: ["600", "700", "900"], variable: "--font-head-face", display: "swap" });

/** Class names for <html> that define the font variables. */
export const fontVariables = `${body.variable} ${head.variable}`;
