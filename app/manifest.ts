import type { MetadataRoute } from "next";

/** Web app manifest — makes GLS Plus installable to the iOS/Android home screen.
 *  Next serves this at /manifest.webmanifest and links it automatically. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GLS Plus - Techno Thai",
    short_name: "GLS Plus",
    description: "Gold business management portal",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf8f5",
    theme_color: "#faf8f5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
