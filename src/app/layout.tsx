import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import { Toaster } from "@/components/Toaster";
import { NotConfigured } from "@/components/NotConfigured";
import { databaseConfigured } from "@/lib/database-url";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://consoleseller.in"),
  title: {
    default: "ConsoleSeller — Consoles & Controllers",
    template: "%s · ConsoleSeller",
  },
  description:
    "Buy gaming consoles and controllers — PS5, PS5 Pro, PS4, Xbox and DualSense on consoleseller.in. Genuine stock with Indian warranty, fast delivery.",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The check is made at request time, never while the site is being
  // built: a build machine has no database, and a page that baked in
  // "not set up" would be baked in for good.
  await connection();

  const configured = databaseConfigured();
  if (!configured.ok) {
    return (
      <html lang="en" className={inter.variable} data-scroll-behavior="smooth">
        <body className="min-h-screen antialiased">
          <NotConfigured reason={configured.reason} />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className={inter.variable} data-scroll-behavior="smooth">
      <body className="min-h-screen antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
