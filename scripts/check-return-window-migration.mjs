/**
 * Checks that the return window the shop publishes is the one the
 * database holds, and that it stays that way.
 *
 *   node scripts/check-return-window-migration.mjs
 *
 * The migration runs on every database open, so it has to be safe to
 * run again and again: it must write the published window exactly
 * once, and it must leave a window a person has set alone.
 */
import { registerTsResolver } from "./lib/ts-loader.mjs";
import "./lib/env.mjs";

registerTsResolver();

const { getDb } = await import("../src/lib/db.ts");
const { applyMigrations } = await import("../src/lib/migrations.ts");
const {
  getSetting,
  setSetting,
  getReturnWindowDays,
  setReturnWindowDays,
} = await import("../src/lib/settings.ts");
const {
  RETURN_WINDOW_DAYS,
  RETURN_WINDOW_POLICY_REVISION,
  RETURN_WINDOW_REVISION_SETTING,
  RETURN_WINDOW_SETTING,
} = await import("../src/lib/return-policy.ts");

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`   ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const section = (title) => console.log(`\n→ ${title}`);

const db = getDb();

/** What the shop was set to, so it can be put back. */
const before = await getSetting(RETURN_WINDOW_SETTING, "");
const beforeRevision = await getSetting(RETURN_WINDOW_REVISION_SETTING, "");

try {
  section("the published window reaches the database");
  {
    await applyMigrations(db);
    const stored = await getSetting(RETURN_WINDOW_SETTING, "");
    check(
      stored === String(RETURN_WINDOW_DAYS),
      "the stored window is the published one",
      stored
    );
    check(
      (await getReturnWindowDays()) === RETURN_WINDOW_DAYS,
      "and the shop reads it back",
      `${await getReturnWindowDays()} days`
    );
    const revision = await getSetting(RETURN_WINDOW_REVISION_SETTING, "");
    check(
      revision === RETURN_WINDOW_POLICY_REVISION,
      "the revision of the applied window is recorded",
      revision
    );
  }

  section("running it again changes nothing");
  {
    await applyMigrations(db);
    const stored = await getSetting(RETURN_WINDOW_SETTING, "");
    check(
      stored === String(RETURN_WINDOW_DAYS),
      "the window is still the published one",
      stored
    );
  }

  section("a window a person has set is left alone");
  {
    await setReturnWindowDays(3);
    check(
      (await getReturnWindowDays()) === 3,
      "the window can be made shorter",
      `${await getReturnWindowDays()} days`
    );
    // The migration runs on every database open, so it has to leave a
    // window a person set alone.
    await applyMigrations(db);
    check(
      (await getReturnWindowDays()) === 3,
      "and the migration does not put it back",
      `${await getReturnWindowDays()} days`
    );
  }

  section("the window cannot be longer than the published one");
  {
    await setReturnWindowDays(30);
    check(
      (await getReturnWindowDays()) === RETURN_WINDOW_DAYS,
      "a longer window is refused",
      `${await getReturnWindowDays()} days`
    );
  }
} finally {
  // Put the shop back as it was found.
  if (before) await setSetting(RETURN_WINDOW_SETTING, before);
  else await setSetting(RETURN_WINDOW_SETTING, String(RETURN_WINDOW_DAYS));
  if (beforeRevision) {
    await setSetting(RETURN_WINDOW_REVISION_SETTING, beforeRevision);
  }
  console.log("\n→ the shop's policy is put back");
  const after = await getSetting(RETURN_WINDOW_SETTING, "");
  check(after === before || !before, "it is as it was found", after);
}

console.log(
  failures ? `\n✗ ${failures} check(s) failed` : "\n✓ every check passed"
);
if (failures) process.exit(1);
