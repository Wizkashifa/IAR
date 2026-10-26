import { Fraunces, Lato, Montserrat } from "next/font/google";

/**
 * The portal's typefaces, from IAR's brand guide, downloaded at build time and
 * served by the portal itself: Montserrat for headings (Semibold for
 * subheadings, Bold for page titles) and Lato for reading and forms. The home
 * greeting alone is set in Fraunces italic, a warmer serif. tokens.css turns
 * these into --font, --font-head and --font-display.
 */
const body = Lato({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-body-face", display: "swap" });
const head = Montserrat({ subsets: ["latin"], weight: ["600", "700", "900"], variable: "--font-head-face", display: "swap" });
const display = Fraunces({ subsets: ["latin"], weight: "500", style: "italic", variable: "--font-display-face", display: "swap" });

/** Class names for <html> that define the font variables. */
export const fontVariables = `${body.variable} ${head.variable} ${display.variable}`;
