import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/database-url";
import { getPool } from "@/lib/db";

/**
 * Says whether the shop can reach its database.
 *
 * The shop's pages all fail the same way when it cannot, and the first
 * question is always the same one: is the database there? This answers it
 * without asking for a sign-in and without saying anything about the
 * connection string — only whether the variable is set, whether it looks
 * like a PostgreSQL one, and whether the database answers.
 *
 *   GET /api/health
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = databaseConfigured();

  if (!configured.ok) {
    return NextResponse.json(
      {
        ok: false,
        database: configured.reason === "missing" ? "not set" : "not a PostgreSQL url",
        hint:
          "Set DATABASE_URL in the environment of the host this is deployed to, and redeploy.",
      },
      { status: 503 }
    );
  }

  try {
    const result = await getPool().query<{ version: string; now: string }>(
      "SELECT version() AS version, now()::text AS now"
    );
    const row = result.rows[0];

    // The version of the server, but not the whole line: it carries the
    // machine's build and its path.
    const version = String(row?.version ?? "").split(" ").slice(0, 2).join(" ");

    return NextResponse.json({
      ok: true,
      database: "reachable",
      version,
      serverTime: row?.now ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        database: "unreachable",
        error: err instanceof Error ? err.message : "The database did not answer.",
        hint:
          "The connection string is set but the database did not answer. Check that it is the right one, and that it allows this host.",
      },
      { status: 503 }
    );
  }
}
