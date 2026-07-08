import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finansial Aku",
    short_name: "Finansial",
    description: "Keuangan rumah tangga, dikelola berdua.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8f3",
    theme_color: "#116149",
    orientation: "portrait-primary",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
