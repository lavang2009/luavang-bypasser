import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://luavang-bypasser.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LÙ A VANG — Link Resolver",
    template: "%s | LÙ A VANG",
  },
  description:
    "Phân tích đường dẫn chuyển hướng HTTP/HTTPS, xem URL đích và kiểm tra từng bước trước khi mở liên kết.",
  applicationName: "LÙ A VANG Link Resolver",
  openGraph: {
    title: "LÙ A VANG — Link Resolver",
    description:
      "Tìm địa chỉ đích của một liên kết và xem rõ từng bước chuyển hướng.",
    url: siteUrl,
    siteName: "LÙ A VANG",
    locale: "vi_VN",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f7f4",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
