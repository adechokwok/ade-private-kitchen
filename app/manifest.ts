import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "阿德小厨房",
    short_name: "阿德小厨房",
    description: "朋友点菜，阿德下厨。只招待我喜欢的人。",
    start_url: "/",
    display: "standalone",
    background_color: "#a83f35",
    theme_color: "#a83f35",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
