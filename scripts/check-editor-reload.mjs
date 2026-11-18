/**
 * Checks that the editor survives the browser putting back what was
 * typed in it.
 *
 *   node scripts/check-editor-reload.mjs
 *
 * The dev server must be running on port 3000.
 *
 * The browser keeps what was typed into a field and puts it back when the
 * page is opened again. That is a kindness for a form, and a problem for
 * the description box: the words the browser puts back are not what the
 * server sent, and a mismatch there would take the whole page down.
 *
 * This types a description, opens the page again, and checks that the
 * editor still works and that what is typed after it has opened is kept.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, setInput, waitForLive } from "./lib/browser.mjs";
import { tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9240;

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const admin = await tokenForRole("admin");

/** Puts a description into the box, the way typing does. */
const setRichText = (html) => `(() => {
  const el = document.querySelector('[contenteditable="true"]');
  if (!el) return 'NOT_FOUND';
  el.innerHTML = ${JSON.stringify(html)};
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
  return 'SET';
})()`;

let chrome;
let cdp;

try {
  const launched = await launchChrome({
    port: PORT,
    // One profile for the whole run, so that the second visit is the
    // second visit and the browser has something to put back.
    profile: join(tmpdir(), "consoleseller-editor-reload-chrome"),
    dir: join(ROOT, ".shots"),
  });
  chrome = launched.chrome;
  cdp = launched.cdp;
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: admin,
    domain: "localhost",
    path: "/",
  });

  console.log("\n→ the first visit");
  await cdp.goto(`${BASE}/admin/products/new`);
  await waitForLive(cdp, "#name");
  await sleep(1200);
  await cdp.evaluate(
    setRichText("<p>Words the browser will keep.</p><ul><li>And a list.</li></ul>")
  );
  await cdp.evaluate(setInput("name", "Zephyr Reload Fixture"));
  await sleep(600);

  console.log("\n→ the second visit");
  await cdp.goto(`${BASE}/admin/products/new`);
  await waitForLive(cdp, "#name");
  await sleep(1500);

  const after = await cdp.evaluate(`(() => {
    const area = document.querySelector('[contenteditable="true"]');
    return {
      hasName: !!document.querySelector('#name'),
      name: document.querySelector('#name')?.value ?? null,
      sheet: !!document.querySelector('.admin-editor-sheet'),
      sections: document.querySelectorAll('.admin-editor-section').length,
      hidden: document.querySelector('input[name="description"]')?.value ?? null,
      restored: area ? area.innerHTML.slice(0, 120) : null,
    };
  })()`);

  check("the editor is there", after.sheet, "");
  check("every section is there", after.sections === 7, String(after.sections));
  check("the title field is there", after.hasName, "");

  // What is typed after the page has opened must be kept. A different
  // name from the one before, so that it is a change the browser can see.
  await cdp.evaluate(setInput("name", "Zephyr Reload Second Visit"));
  await sleep(500);
  const typed = await cdp.evaluate(`(() => ({
    name: document.querySelector('#name')?.value ?? null,
    slug: document.querySelector('#slug')?.value ?? null,
  }))()`);
  check(
    "what is typed is kept",
    typed.name === "Zephyr Reload Second Visit",
    typed.name
  );
  check(
    "the address follows the name",
    typed.slug === "zephyr-reload-second-visit",
    typed.slug
  );
} finally {
  chrome?.kill();
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — the editor survives a reload"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
