import Image from "next/image";

/**
 * The screen the shop shows when it has not been told where its database
 * is.
 *
 * A shop with no database has nothing to sell, and every page would fail
 * with the same unhelpful "something went wrong". This says what is
 * actually wrong and what to do about it, so that the fix is one line
 * rather than a hunt.
 *
 * It never shows the connection string. It says whether the variable is
 * there and whether it looks like a PostgreSQL one, and nothing else.
 */
export function NotConfigured({ reason }: { reason: "missing" | "malformed" }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-5 py-14">
      <div className="w-full max-w-xl rounded-2xl bg-paper p-7 shadow-[0_18px_50px_-12px_rgba(11,18,32,0.45)] sm:p-10">
        <Image
          src="/logo.png"
          alt="ConsoleSeller"
          width={180}
          height={35}
          priority
          className="h-auto w-[clamp(112px,38vw,164px)] object-contain"
        />

        <p className="mt-7 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-700">
          <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
          Not set up
        </p>

        <h1 className="mt-3 text-[clamp(1.6rem,5vw,2.3rem)] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          The shop cannot find its database.
        </h1>

        <p className="mt-4 text-[15px] leading-relaxed text-gray-600">
          {reason === "missing" ? (
            <>
              The shop has not been told where its database is, so every page
              that needs the catalogue cannot load. One environment variable
              fixes it.
            </>
          ) : (
            <>
              The shop has been told where its database is, but the connection
              string it was given is not a PostgreSQL one. One environment
              variable fixes it.
            </>
          )}
        </p>

        <div className="mt-7 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            What to do
          </p>
          <ol className="mt-3 space-y-3 text-[14px] leading-relaxed text-gray-700">
            <li>
              <span className="font-semibold text-ink">1.</span> Open the
              project&apos;s environment settings on the host it is deployed to
              — for Vercel,{" "}
              <span className="font-medium text-ink">
                Settings → Environment Variables
              </span>
              .
            </li>
            <li>
              <span className="font-semibold text-ink">2.</span> Add a
              variable named{" "}
              <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px] text-ink ring-1 ring-gray-200">
                DATABASE_URL
              </code>{" "}
              whose value is the shop&apos;s PostgreSQL connection string.
            </li>
            <li>
              <span className="font-semibold text-ink">3.</span> Redeploy, and
              the shop will find its database.
            </li>
          </ol>
          <p className="mt-4 border-t border-gray-200 pt-4 text-[13px] leading-relaxed text-gray-500">
            The connection string is a secret, so it belongs in the
            environment and nowhere else. It is not written into the source,
            and it is not in the repository.
          </p>
        </div>

        <p className="mt-6 text-[13px] text-gray-400">
          <code className="font-mono">/api/health</code> says the same thing
          in one line, for a script to read.
        </p>
      </div>
    </div>
  );
}
