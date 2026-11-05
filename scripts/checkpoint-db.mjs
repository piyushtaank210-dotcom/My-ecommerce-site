/**
 * Folds the write-ahead log into the database file.
 *
 * The store's database is tracked in git, so anything still sitting in the
 * log is a change that never reaches the repository — and a deployment built
 * from the repository never sees it either. Run this before committing.
 *
 *   node scripts/checkpoint-db.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(join(ROOT, "data", "store.db"));

const result = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
db.close();

if (result.busy) {
  console.warn(
    "  ! the checkpoint was busy — another process is reading the database.\n" +
      "    Stop the dev server and run this again."
  );
  process.exitCode = 1;
} else {
  console.log("✓ the database file is up to date");
}
