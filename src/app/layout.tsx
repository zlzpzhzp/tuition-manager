import type { Metadata, Viewport } from "next";
import { Geist, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const geist = Geist({ subsets: ["latin"] });
const notoSansKR = Noto_Sans_KR({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-noto" });

export const viewport: Viewport = {
  themeColor: '#1e2d6f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: "원비관리",
  description: "학원 원비 관리 시스템",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "원비관리",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${geist.className} ${notoSansKR.variable} bg-gray-50 min-h-screen`}>
        <ServiceWorkerRegistration />
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 py-6 pb-24 sm:pb-8">
          {children}
        </main>
      </body>
    </html>
  );
}
