import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Navet – personlig arbetsyta",
    short_name: "Navet",
    description: "Uppgifter, åtaganden, idéer och kalender på ett ställe.",
    lang: "sv",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f3ee",
    theme_color: "#f5f3ee",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Fånga", url: "/?fanga=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Inkorg", url: "/inkorg" },
    ],
  };
}
