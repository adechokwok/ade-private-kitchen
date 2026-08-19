import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost").split(",")[0].trim();
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host);
  const directHttpPort = /:(?:3000|3099)$/.test(host);
  const requestProtocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : localHost || directHttpPort ? "http" : "https";
  let origin = `${requestProtocol}://${host}`;
  const configuredOrigin = process.env.PUBLIC_ORIGIN?.trim();
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") origin = parsed.origin;
    } catch {
      // Ignore an invalid optional origin and keep the request-derived address.
    }
  }
  const title = "阿德小厨房 · 私房菜单";
  const description = "选几道想吃的家常菜，我来准备";
  // Keep the established red chopsticks-and-braised-pork illustration while
  // bumping the URL so WeChat refreshes its cached share card.
  const shareImage = `${origin}/wechat-share.jpg?v=20260819-red-chopsticks`;
  const shareImageMetadata = {
    url: shareImage,
    ...(shareImage.startsWith("https://") ? { secureUrl: shareImage } : {}),
    type: "image/jpeg",
    width: 800,
    height: 800,
    alt: "阿德小厨房 · 红烧肉家宴图标",
  };
  return {
    metadataBase: new URL(origin),
    title,
    description,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [{ url: "/icon.png", type: "image/png", sizes: "1024x1024" }],
      apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
    },
    appleWebApp: { capable: true, title: "阿德小厨房", statusBarStyle: "black-translucent" },
    alternates: { canonical: origin },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "阿德小厨房",
      locale: "zh_CN",
      url: origin,
      images: [shareImageMetadata],
    },
    twitter: { card: "summary_large_image", title, description, images: [{ url: shareImage, alt: "阿德小厨房私房菜单" }] },
    other: { image: shareImage },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
