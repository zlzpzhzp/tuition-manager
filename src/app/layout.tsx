import type { Metadata, Viewport } from "next";
import { Geist, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import SWRProvider from "@/components/SWRProvider";
import { queryGradesTree, mapGradesTree } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

const geist = Geist({ subsets: ["latin"] });
const notoSansKR = Noto_Sans_KR({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-noto" });

export const viewport: Viewport = {
  themeColor: '#1e2d6f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const dynamic = 'force-dynamic'

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 서버에서 미리 데이터 fetch → SWR 캐시에 주입
  const [gradesResult, paymentsResult] = await Promise.all([
    queryGradesTree(),
    supabase.from('tuition_payments').select('*').eq('billing_month', currentMonth).order('payment_date', { ascending: false }),
  ])

  const fallback: Record<string, unknown> = {}
  if (!gradesResult.error && gradesResult.data) {
    fallback['/api/grades'] = mapGradesTree(gradesResult.data)
  }
  if (!paymentsResult.error && paymentsResult.data) {
    fallback[`/api/payments?billing_month=${currentMonth}`] = paymentsResult.data
  }

  return (
    <html lang="ko">
      <body className={`${geist.className} ${notoSansKR.variable} bg-gray-50 min-h-screen`}>
        <SWRProvider fallback={fallback}>
          <ServiceWorkerRegistration />
          <Navbar />
          <main className="max-w-4xl mx-auto px-4 py-6 pb-24 sm:pb-8">
            {children}
          </main>
        </SWRProvider>
      </body>
    </html>
  );
}
