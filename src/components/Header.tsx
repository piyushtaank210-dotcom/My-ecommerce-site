import Link from "next/link";
import Image from "next/image";
import { Search, User, ShoppingCart, Menu, LogOut } from "lucide-react";
import { getCartCount } from "@/lib/cart";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { logoutAction } from "@/lib/actions";
import { SearchBox } from "./SearchBox";
import { MobileMenu } from "./MobileMenu";
import { MainNav } from "./MainNav";

export async function Header() {
  const [cartCount, user] = await Promise.all([
    getCartCount(),
    getCurrentUser(),
  ]);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="container-x">
        {/*
          Three tracks. The outer two are both 1fr, so they are always the
          same width — which puts the centre track, sized to its own
          content, exactly in the middle of the bar whatever the logo and
          the right-hand group weigh. Nothing here is absolutely
          positioned, so the whole thing reflows with the viewport.
        */}
        <div className="grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 lg:h-[72px] lg:grid-cols-[1fr_auto_1fr] lg:gap-8">
          {/* Left — the brand */}
          <Link
            href="/"
            className="flex min-w-0 items-center justify-self-start"
            aria-label="ConsoleSeller Home"
          >
            <Image
              src="/logo.png"
              alt="ConsoleSeller"
              width={180}
              height={35}
              priority
              className="h-auto w-[clamp(112px,38vw,164px)] object-contain sm:h-9 sm:w-auto"
            />
          </Link>

          {/* Centre — the three primary destinations */}
          <MainNav />

          {/* Right — search, sign in, cart */}
          <div className="flex shrink-0 items-center justify-end gap-0.5 sm:gap-1">
            <Link
              href="/search"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink md:hidden"
              aria-label="Search"
            >
              <Search className="h-[18px] w-[18px]" />
            </Link>

            <div className="hidden min-w-0 flex-1 md:block lg:max-w-sm">
              <SearchBox />
            </div>

            {user ? (
              <div className="group relative">
                <Link
                  href="/account"
                  className="flex h-10 items-center gap-2 rounded-lg px-2 text-[14px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink xl:px-2.5"
                >
                  <User className="h-[18px] w-[18px]" />
                  {/* Icons only below xl — the text would squeeze the
                      search box down to an unusable width. */}
                  <span className="hidden xl:inline">Account</span>
                </Link>
                <div className="invisible absolute right-0 top-full z-50 w-56 translate-y-1 rounded-xl border border-gray-200 bg-white p-2 opacity-0 shadow-pop transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  <p className="truncate px-3 py-2 text-[13px] text-gray-500">
                    Signed in as
                    <span className="block truncate font-semibold text-ink">
                      {user.email}
                    </span>
                  </p>
                  <Link
                    href="/account"
                    className="block rounded-lg px-3 py-2 text-[13.5px] font-medium text-gray-700 hover:bg-gray-100"
                  >
                    My account
                  </Link>
                  {isStaff(user.role) && (
                    <Link
                      href="/admin"
                      className="block rounded-lg px-3 py-2 text-[13.5px] font-medium text-gray-700 hover:bg-gray-100"
                    >
                      Admin panel
                    </Link>
                  )}
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-gray-700 hover:bg-gray-100"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex h-10 shrink-0 items-center gap-2 rounded-lg px-2 text-[14px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink xl:px-2.5"
              >
                <User className="h-[18px] w-[18px]" />
                <span className="hidden xl:inline">Sign in</span>
              </Link>
            )}

            <Link
              href="/cart"
              className="relative flex h-10 shrink-0 items-center gap-2 rounded-lg px-2 text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-ink xl:px-2.5"
              aria-label={`Cart, ${cartCount} items`}
            >
              <ShoppingCart className="h-[18px] w-[18px]" />
              <span className="hidden xl:inline">Cart</span>
              {cartCount > 0 && (
                <span className="tnum grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </Link>

            <MobileMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
