/**
 * Captures a screenshot of any page over the Chrome DevTools Protocol.
 * No Puppeteer dependency — Node 24 ships a global WebSocket.
 *
 *   node scripts/screenshot.mjs <url> <name> [width] [height] [waitMs] [fullPage] [cookie] [click]
 *
 * `cookie` is `name=value` — it is set before the page loads, which is how
 * the signed-in pages (the back office, the customer panel) are captured.
 *
 * `click` is a CSS selector. It is clicked once the page has loaded and
 * before the picture is taken, so a carousel can be caught on a slide other
 * than the first.
 *
 * Writes .shots/<name>.png.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, ".shots");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9223;

const url = process.argv[2] ?? "http://localhost:3000/";
const name = process.argv[3] ?? "shot";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 900);
const waitMs = Number(process.argv[6] ?? 1200);
const fullPage = process.argv[7] === "full";
const cookie = process.argv[8] ?? "";
const click = process.argv[9] ?? "";

mkdirSync(SHOTS, { recursive: true });

/* --------------------------------------------------------- CDP connection */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        (this.listeners.get(msg.method) ?? []).forEach((fn) => fn(msg.params));
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    return new CDP(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? "eval failed");
    }
    return result.value;
  }

  async goto(url) {
    const loaded = new Promise((res) => this.on("Page.loadEventFired", res));
    await this.send("Page.navigate", { url });
    await Promise.race([loaded, sleep(20000)]);
    await sleep(700);
  }
}

let chrome;
try {
  chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--disable-extensions",
      "--hide-scrollbars",
      `--remote-debugging-port=${PORT}`,
      "--user-data-dir=" + join(ROOT, ".chrome-profile"),
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
        method: "PUT",
      });
      wsUrl = (await res.json()).webSocketDebuggerUrl;
      break;
    } catch {
      await sleep(400);
    }
  }
  if (!wsUrl) throw new Error("Chrome DevTools endpoint never came up");

  const cdp = await CDP.connect(wsUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });

  // A signed-in page needs its session cookie before the first request.
  if (cookie.includes("=")) {
    const at = cookie.indexOf("=");
    await cdp.send("Network.setCookie", {
      name: cookie.slice(0, at),
      value: cookie.slice(at + 1),
      domain: "localhost",
      path: "/",
    });
  }

  await cdp.goto(url);
  await sleep(waitMs);

  // Optional: put the page into a particular state first — the third slide
  // of the hero carousel, say — so the picture shows that and not the first.
  if (click) {
    await cdp.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(click)});
      if (el) el.click();
      return Boolean(el);
    })()`);
    await sleep(1200);
  }

  if (fullPage) {
    const { cssContentSize } = await cdp.send("Page.getLayoutMetrics");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: Math.min(Math.ceil(cssContentSize.height), 9000),
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(400);
  }

  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`📸 .shots/${name}.png`);
} finally {
  chrome?.kill();
}
