import type { MetadataRoute } from "next";
import { ORG } from "@/lib/org";

/** Lets people add the portal to a phone's home screen, where it opens like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${ORG.shortName} Portal`,
    short_name: `${ORG.shortName} Portal`,
    description: `Internal tools for the ${ORG.name}`,
    start_url: "/",
    display: "standalone",
    background_color: "#faf6ea",
    theme_color: "#0b3a24",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
