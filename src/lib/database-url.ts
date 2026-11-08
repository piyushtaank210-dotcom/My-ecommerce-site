/**
 * Where the shop's database is.
 *
 * The connection string is read from the environment and nowhere else. It
 * names a real database and carries a real password, so it lives in
 * `.env.local` — which Git ignores — or in the environment settings of
 * whichever machine is running the shop.
 *
 * It is deliberately not written into the source. A string in the source is
 * a string in the repository's history, where it stays for good, and
 * everybody who can read the repository can read the password with it.
 */

/**
 * The error the shop raises when it has not been told where its database
 * is.
 *
 * It is a kind of its own, because it is a mistake in how the shop was set
 * up rather than a fault in the shop's own work, and the two are worth
 * telling apart when one of them is logged.
 */
export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

/**
 * The connection string the shop should use.
 *
 * There is no second answer to this. A shop that has not been told where
 * its database is has nothing to serve, and saying so plainly is much
 * better than quietly talking to some other database.
 */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new DatabaseConfigurationError(
      "DATABASE_URL is not set, so the shop has no database to talk to.\n" +
        "  Put the connection string in .env.local in the project root:\n" +
        '    DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<database>"\n' +
        "  That file is ignored by Git, so the password stays out of the repository."
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new DatabaseConfigurationError(
      "DATABASE_URL is set, but it is not a PostgreSQL connection string.\n" +
        "  It should begin with postgresql://, for example:\n" +
        '    DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<database>"'
    );
  }
  return url;
}

/**
 * The sslmode in the connection string, if it names one.
 */
function sslModeFromUrl(url: string): string | undefined {
  return /(?:[?&])sslmode=([^&#]+)/.exec(url)?.[1]?.toLowerCase();
}

/**
 * Whether the connection is encrypted.
 *
 * A hosted database wants TLS; a PostgreSQL running on this machine
 * usually does not, and is reached over a plain socket. DATABASE_SSL
 * decides it when it is set, and the connection string's own sslmode
 * decides it when it is not — so a connection string that says require is
 * encrypted in development too.
 */
export function sslOption(
  url: string
): { rejectUnauthorized: boolean } | undefined {
  const mode = (
    process.env.DATABASE_SSL ??
    sslModeFromUrl(url) ??
    ""
  ).toLowerCase();

  if (mode === "disable") return undefined;
  if (mode === "require" || mode === "verify-ca" || mode === "verify-full") {
    return { rejectUnauthorized: false };
  }
  if (mode === "prefer") return undefined;

  // Nothing said either way: a hosted database wants TLS, a local one
  // does not.
  return process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined;
}
