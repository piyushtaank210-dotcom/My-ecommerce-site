import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

/**
 * The shop shell — site header and footer.
 * Kept out of the root layout so the sign-in / register pages can run
 * full-height without the site chrome.
 */
export default function ShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Header />
      <main className="min-h-[60vh]">{children}</main>
      <Footer />
    </>
  );
}
