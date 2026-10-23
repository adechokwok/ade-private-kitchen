import type { Metadata } from "next";
import { PUBLIC_SITE_ORIGIN } from "./site-origin";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const origin = PUBLIC_SITE_ORIGIN;
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
