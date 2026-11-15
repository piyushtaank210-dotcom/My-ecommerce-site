import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/database-url";
import { getPool } from "@/lib/db";
import {
  evidenceIsPrivate,
  storageDriver,
  storageUnavailableReason,
} from "@/lib/storage";

/**
 * Says whether the shop can reach its database, and whether it has
 * somewhere to keep its files.
 *
 * The shop's pages all fail the same way when it cannot, and the first
 * question is always the same one: is the database there? This answers it
 * without asking for a sign-in and without saying anything about the
 * connection string — only whether the variable is set, whether it looks
 * like a PostgreSQL one, and whether the database answers.
 *
 * The files are the second question. A shop on a serverless deployment
 * cannot write to its own disk, so it has to have a store; when it has
 * not, the answer here says so rather than letting every upload fail
 * with a message that means nothing.
 *
 *   GET /api/health
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = databaseConfigured();
  const storage = storageDriver();
  const storageProblem = storageUnavailableReason();

  if (!configured.ok) {
    return NextResponse.json(
      {
        ok: false,
        database: configured.reason === "missing" ? "not set" : "not a PostgreSQL url",
        storage,
        storageProblem,
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
      ok: !storageProblem,
      database: "reachable",
      version,
      serverTime: row?.now ?? null,
      storage,
      storageProblem,
      // Whether a customer's evidence is in a store only the shop can
      // read. It is not a fault in itself, but it is worth knowing.
      evidenceStoreIsPrivate: storage === "blob" ? evidenceIsPrivate() : true,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        database: "unreachable",
        error: err instanceof Error ? err.message : "The database did not answer.",
        storage,
        storageProblem,
        hint:
          "The connection string is set but the database did not answer. Check that it is the right one, and that it allows this host.",
      },
      { status: 503 }
    );
  }
}
