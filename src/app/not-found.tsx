import Link from "next/link";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="container-x flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="text-[64px] font-bold leading-none text-brand">404</p>
      <h1 className="mt-4 text-[24px] font-bold text-ink">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-gray-500">
        The link may be broken, or the product may have sold out and been
        retired.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-primary">
          <Home className="h-4 w-4" />
          Back to home
        </Link>
        <Link href="/search" className="btn btn-outline">
          <Search className="h-4 w-4" />
          Browse the store
        </Link>
      </div>
    </div>
  );
}
