/**
 * The shop's environment, for the scripts.
 *
 * Next.js loads `.env.local` for the app itself, but the scripts run on
 * plain Node, which loads nothing. They are pointed at the same database
 * the app is, so they read the same file.
 *
 * A variable already in the environment wins over the file, which is what
 * Next.js does too: `DATABASE_URL=... npm run check:database` points a
 * script somewhere else without touching the file.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Reads one `.env` file into the environment.
 *
 * The file is read the way Next.js reads it: `KEY=value`, or
 * `KEY="value"` when the value holds something the shell would read as
 * more than a word, and `#` for a comment. A variable that is already set
 * is left alone.
 */
function load(file) {
  const path = join(ROOT, file);
  if (!existsSync(path)) return;
  process.loadEnvFile(path);
}

// The files in the order of their weight, so that the one that overrides
// the other is read last: `.env` holds the shared defaults, and
// `.env.local` holds the ones that are this machine's.
load(".env");
load(".env.local");
