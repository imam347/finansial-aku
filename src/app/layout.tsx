import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finansial Aku — Keuangan berdua, lebih tertata",
  description: "Catat pemasukan, pengeluaran, dan anggaran rumah tangga bersama pasangan.",
  applicationName: "Finansial Aku",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Finansial Aku" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#101a17" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
