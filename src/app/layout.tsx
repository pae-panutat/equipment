import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

// LINE Seed Sans TH is used for the whole site (Thai + Latin).
const lineSeed = localFont({
  variable: "--font-line-seed",
  display: "swap",
  src: [
    { path: "./fonts/LINESeedSansTH_W_Th.woff2", weight: "100", style: "normal" },
    { path: "./fonts/LINESeedSansTH_W_Rg.woff2", weight: "400", style: "normal" },
    { path: "./fonts/LINESeedSansTH_W_Bd.woff2", weight: "700", style: "normal" },
    { path: "./fonts/LINESeedSansTH_W_XBd.woff2", weight: "800", style: "normal" },
    { path: "./fonts/LINESeedSansTH_W_He.woff2", weight: "900", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "CMU Asset & Maintenance",
  description: "ระบบทะเบียนอุปกรณ์และติดตามการบำรุงรักษา",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${lineSeed.variable} dark`} suppressHydrationWarning>
      <head>
        {/* dark is the default; only an explicit saved "light" choice removes it (runs before paint, no flash) */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("theme")==="light")document.documentElement.classList.remove("dark")}catch(e){}` }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
