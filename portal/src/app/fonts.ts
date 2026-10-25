import { Fraunces, Outfit, Source_Sans_3 } from "next/font/google";

/**
 * The portal's three typefaces, downloaded at build time and served by the
 * portal itself. Each has one job: Source Sans 3 for reading and forms, Outfit
 * for headings, Fraunces italic only for the brand and the home greeting.
 * tokens.css turns these into --font, --font-head and --font-display.
 */
const body = Source_Sans_3({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body-face", display: "swap" });
const head = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-head-face", display: "swap" });
const display = Fraunces({ subsets: ["latin"], weight: "500", style: "italic", variable: "--font-display-face", display: "swap" });

/** Class names for <html> that define the three font variables. */
export const fontVariables = `${body.variable} ${head.variable} ${display.variable}`;
