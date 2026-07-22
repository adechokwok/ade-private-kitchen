import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost").split(",")[0].trim();
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host);
  const protocol = localHost ? forwardedProtocol || "http" : "https";
  const origin = `${protocol}://${host}`;
  const title = "阿德小厨房 · 私房菜单";
  const description = "选几道想吃的家常菜，我来认真准备。朋友点菜、主厨接单、食材自动汇总。";
  const shareImage = `${origin}/wechat-share.jpg`;
  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical: origin },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "阿德小厨房",
      locale: "zh_CN",
      url: origin,
      images: [{ url: shareImage, secureUrl: shareImage, type: "image/jpeg", width: 800, height: 800, alt: "阿德小厨房 · 好好吃饭" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [{ url: shareImage, alt: "阿德小厨房私房菜单" }] },
    other: { image: shareImage },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
