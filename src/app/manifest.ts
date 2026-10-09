import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Traverso Healthy Fuel",
    short_name: "Traverso",
    description: "Pre-order breakfast from the Traverso cart.",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F1E4",
    theme_color: "#F7F1E4",
    categories: ["food"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
