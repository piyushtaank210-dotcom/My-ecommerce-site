/**
 * Writes scripts/schema.sql from src/lib/schema.ts, which is the single
 * source of truth for the database shape.
 *
 *   node scripts/write-schema.mjs
 *
 * Run it after changing the schema, so the plain-SQL copy cannot drift.
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_SQL } from "../src/lib/schema.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const header = `-- PlayForge store schema (SQLite).
--
-- Generated from src/lib/schema.ts by scripts/write-schema.mjs, which is the
-- single source of truth. Edit that file, then run:
--
--   npm run schema
--
`;

writeFileSync(join(ROOT, "scripts/schema.sql"), header + SCHEMA_SQL.trim() + "\n");

console.log("✓ wrote scripts/schema.sql");
