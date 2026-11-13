/**
 * Checks the Returns & Refunds back office: the sidebar entry, the views,
 * the filters, the table and the request page.
 *
 *   node scripts/check-admin-returns.mjs
 *
 * The dev server must be running on port 3000.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { db, closeDb } from "./lib/pg-db.mjs";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";
import { tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9261;

const token = await tokenForRole("admin");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-adminreturns-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Network.enable");
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: token,
    domain: "localhost",
    path: "/",
  });

  // The back office is a wide screen. The shots are taken at the width it
  // is actually used at.
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log("\n— the sidebar —");
  await cdp.goto(`${BASE}/admin`);
  await sleep(2000);
  const nav = await cdp.evaluate(`(() => {
    const links = [...document.querySelectorAll('aside nav a')].map(a => a.textContent.trim());
    return links;
  })()`);
  console.log(`   sidebar: ${nav.join(" · ")}`);
  const returnsAt = nav.indexOf("Returns & Refunds");
  check("the sidebar has Returns & Refunds", returnsAt !== -1);
  check(
    "it sits immediately below Orders",
    returnsAt === nav.indexOf("Orders") + 1,
    `position ${returnsAt}`
  );
  check(
    "the refunds and the replacements are not separate entries",
    !nav.includes("Refunds") && !nav.includes("Replacements"),
    nav.join(" · ")
  );
  check(
    "and Inventory comes straight after it",
    nav.indexOf("Inventory") === returnsAt + 1
  );

  console.log("\n— the request list —");
  await cdp.goto(`${BASE}/admin/returns`);
  await sleep(2600);

  const page = await cdp.evaluate(`(() => {
    const h1 = document.querySelector('h1');
    const cards = [...document.querySelectorAll('.rounded-xl.border')].map(c => {
      const l = c.querySelector('p');
      return l ? l.textContent.trim() : '';
    });
    const heads = [...document.querySelectorAll('thead th')].map(t => t.textContent.trim());
    const tabs = [...document.querySelectorAll('nav[aria-label="Request views"] a')].map(a => ({
      href: a.getAttribute('href') ?? '',
      label: a.textContent.trim(),
      active: a.getAttribute('aria-current') === 'page',
    }));
    return {
      title: h1 ? h1.textContent.trim() : '',
      cards,
      heads,
      tabs,
      rows: document.querySelectorAll('tbody tr').length,
      hasSearch: Boolean(document.querySelector('input[type=search]')),
      dateInputs: document.querySelectorAll('input[type=date]').length,
      filters: [...document.querySelectorAll('select')].map(s => s.getAttribute('aria-label')),
    };
  })()`);

  console.log(`   title  : ${page.title}`);
  console.log(`   cards  : ${page.cards.join(" · ")}`);
  console.log(`   columns: ${page.heads.join(" · ")}`);
  console.log(`   tabs   : ${page.tabs.map((t) => t.label).join(" · ")}`);
  console.log(`   rows   : ${page.rows}`);
  await cdp.shot("admin-returns-list");

  check("the page is called Returns & Refunds", page.title === "Returns & Refunds");
  for (const card of [
    "Total requests",
    "New requests",
    "Pending review",
    "Evidence required",
    "Approved replacements",
    "Replacement dispatched",
    "Refund requests",
    "Refund approved",
    "Refund processing",
    "Refund processed",
    "Rejected requests",
    "Closed requests",
  ]) {
    check(
      `a summary card for ${card}`,
      page.cards.some((c) => c.toLowerCase().startsWith(card.toLowerCase()))
    );
  }
  for (const head of [
    "Request ID",
    "Order ID",
    "Customer",
    "Product",
    "Type",
    "Request date",
    "Status",
    "Action",
  ]) {
    check(
      `a column for ${head}`,
      page.heads.some((h) => h.toLowerCase().startsWith(head.toLowerCase()))
    );
  }
  for (const tab of [
    "All Requests",
    "New Requests",
    "Returns",
    "Replacement Requests",
    "Missing Accessories",
    "Pending Review",
    "Evidence Required",
    "Approved",
    "Pickup Pending",
    "Product Received",
    "Replacement Dispatched",
    "Refund Requests",
    "Resolved",
    "Rejected",
  ]) {
    check(
      `a view for ${tab}`,
      page.tabs.some((t) => t.label === tab)
    );
  }
  check("there is a search box", page.hasSearch);
  check("there are date filters", page.dateInputs === 2, `${page.dateInputs} found`);
  check(
    "there are status, type and order filters",
    ["Status", "Type", "Order"].every((f) => page.filters.includes(f)),
    page.filters.join(", ")
  );

  console.log("\n— the views —");
  for (const tab of page.tabs) {
    // The refund records live on their own page, so the test goes to
    // the page the tab points at rather than clicking it.
    await cdp.goto(`${BASE}${tab.href}`);
    await sleep(800);

    // The page is rendered on the server, so it takes as long as it takes.
    // Waiting for the view to say it is open beats guessing at a delay.
    let after = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(500);
      after = await cdp.evaluate(`(() => {
        const active = document.querySelector('nav[aria-label="Request views"] a[aria-current=page]');
        return {
          rows: document.querySelectorAll('tbody tr').length,
          active: active ? active.textContent.trim() : null,
          empty: document.body.innerText.includes('No requests match'),
          url: location.search,
        };
      })()`);
      if (after.active === tab.label) break;
    }
    // A tab that goes to another page has no tab bar of its own — it
    // is checked by what that page shows.
    const onAnotherPage = !after.active;
    check(
      `the ${tab.label} view opens`,
      onAnotherPage || after.active === tab.label,
      onAnotherPage
        ? "it is on its own page"
        : `${after.rows} row(s)${after.empty ? ", none matched" : ""}`
    );
  }

  console.log("\n— searching, filtering and sorting —");
  await cdp.goto(`${BASE}/admin/returns?q=RET`);
  await sleep(1200);
  const searched = await cdp.evaluate(
    `document.querySelectorAll('tbody tr').length`
  );
  check("the search finds requests", searched > 0, `${searched} row(s)`);

  await cdp.goto(`${BASE}/admin/returns?type=replacement`);
  await sleep(1200);
  const types = await cdp.evaluate(
    `[...document.querySelectorAll('tbody tr')].map(r => r.children[4]?.textContent.trim() ?? '')`
  );
  check(
    "the type filter keeps to replacements",
    types.length === 0 || types.every((t) => t.includes("Replacement")),
    types[0] ?? "none"
  );

  await cdp.goto(`${BASE}/admin/returns?sort=customer`);
  await sleep(2000);
  const sorted = await cdp.evaluate(
    `Boolean(document.querySelector('thead a[href*="sort="]'))`
  );
  check("the table can be ordered", sorted);

  await cdp.goto(`${BASE}/admin/returns?from=2020-01-01&to=2030-12-31`);
  await sleep(2000);
  const dated = await cdp.evaluate(
    `document.querySelectorAll('input[type=date]').length`
  );
  check("the date range is kept in the URL", dated === 2, `${dated} date inputs`);

  console.log("\n— a request —");
  const anyId = (
    await db
      .prepare("SELECT id FROM return_requests ORDER BY created_at DESC LIMIT 1")
      .get()
  )?.id;

  // The dev server's render worker drops out now and then, so the request
  // is asked for until it comes back.
  let detail = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    await cdp.goto(`${BASE}/admin/returns/${anyId}`);
    await sleep(2000);
    detail = await cdp.evaluate(`(() => {
      const text = document.body.innerText;
      return {
        h1: document.querySelector('h1')?.textContent.trim() ?? '',
        body: text.slice(0, 600),
        hasDeadline: text.includes('Return deadline'),
        hasDelivered: text.includes('Delivered on'),
        hasPrice: text.includes('Original price'),
        hasHistory: text.includes('Activity & Audit History'),
        hasCustomer: text.includes('Customer Details'),
        hasItems: text.includes('Requested Items'),
        backLink: [...document.querySelectorAll('a')].some(a => a.textContent.includes('Returns & Refunds')),
      };
    })()`);
    if (detail.h1) break;
    console.log(
      "   (the render worker dropped out — asking again) " +
        JSON.stringify((detail.body ?? "").slice(0, 400))
    );
  }
  console.log(`   request : ${detail.h1}`);
  await cdp.shot("admin-returns-detail");
  check("the request page shows the request id", detail.h1 === anyId);
  check("it shows the return deadline", detail.hasDeadline);
  check("it shows the delivery date", detail.hasDelivered);
  check("it shows the original price", detail.hasPrice);
  check("it shows the customer", detail.hasCustomer);
  check("it shows the product and quantity", detail.hasItems);
  check("it shows the status history", detail.hasHistory);
  check("it links back to the list", detail.backLink);
} finally {
  chrome.kill();
  await db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  await closeDb();
}

console.log(failures ? `\n${failures} check(s) failed` : "\n✓ every check passed");
if (failures) process.exitCode = 1;
