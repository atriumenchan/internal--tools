import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ADMEXO Workspace",
    short_name: "ADMEXO",
    description: "Tasks, chat, attendance, and the handbook for the ADMEXO team.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f9f7",
    theme_color: "#f6f9f7",
    orientation: "any",
    lang: "en",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
