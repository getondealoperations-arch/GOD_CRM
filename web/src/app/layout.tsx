import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GetOnDeal CRM",
  description: "Lead-to-sales and calling operations CRM",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// No saved choice → follow the OS setting (runs before paint, so no flash).
const systemTheme = `if(window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark")`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${theme === "dark" ? "dark" : ""}`}>
      <body className="min-h-full font-sans">
        {!theme && <Script id="system-theme" strategy="beforeInteractive">{systemTheme}</Script>}
        {children}
      </body>
    </html>
  );
}
