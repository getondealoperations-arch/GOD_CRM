import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import "./globals.css";

const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"] });
const heading = Bricolage_Grotesque({ variable: "--font-heading", subsets: ["latin"] });

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
    <html lang="en" suppressHydrationWarning className={`${body.variable} ${heading.variable} h-full antialiased ${theme === "dark" ? "dark" : ""}`}>
      <body className="min-h-full font-sans">
        {!theme && <Script id="system-theme" strategy="beforeInteractive">{systemTheme}</Script>}
        {children}
      </body>
    </html>
  );
}
