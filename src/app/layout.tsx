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
    /*
      Each size is named, so a browser downloads the one it will actually
      use: a 32-pixel mark for the tab, a 180-pixel one for the home
      screen of a phone. The drawing they are all cut from is 395KB, and
      a phone downloading all of it to put a small mark on the screen is
      the sort of thing that makes a shop feel slow. `npm run icons`
      makes them.
    */
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  /*
    `cover` lets the page reach into the area behind the notch and the
    home indicator, and it is the switch that turns the safe-area
    insets on: without it, `env(safe-area-inset-*)` is always zero and
    the padding in globals.css has nothing to measure. On a phone held
    sideways the notch cuts into the side of the screen, and the header
    would otherwise sit underneath it.
  */
  viewportFit: "cover",
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
