/**
 * A small headless-Chrome driver, shared by the test scripts.
 *
 * Node 24 ships a global WebSocket, so no puppeteer dependency is needed —
 * the browser is driven over the DevTools Protocol directly.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

export class CDP {
  constructor(ws, dir = ".") {
    this.ws = ws;
    this.dir = dir;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error
          ? reject(new Error(JSON.stringify(msg.error)))
          : resolve(msg.result);
      } else if (msg.method) {
        (this.listeners.get(msg.method) ?? []).forEach((fn) => fn(msg.params));
      }
    });
  }

  static async connect(url, dir) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    return new CDP(ws, dir);
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject })
    );
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
      throw new Error(
        exceptionDetails.exception?.description ?? "eval failed"
      );
    }
    return result.value;
  }

  async goto(url) {
    const loaded = new Promise((res) => this.on("Page.loadEventFired", res));
    await this.send("Page.navigate", { url });
    await Promise.race([loaded, sleep(20000)]);
    await sleep(700);
  }

  async shot(name, fullPage = false) {
    if (fullPage) {
      const { cssContentSize } = await this.send("Page.getLayoutMetrics");
      await this.send("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: Math.min(Math.ceil(cssContentSize.height), 9000),
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sleep(400);
    }
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(this.dir, `${name}.png`), Buffer.from(data, "base64"));
    console.log(`  📸 ${name}.png`);
    if (fullPage) await this.send("Emulation.clearDeviceMetricsOverride");
  }
}

/**
 * Starts headless Chrome and connects to it.
 *
 * The browser is given its own profile directory, so it never touches the
 * one the developer is using.
 */
export async function launchChrome({ port, profile, dir }) {
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--disable-extensions",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
        method: "PUT",
      });
      wsUrl = (await res.json()).webSocketDebuggerUrl;
      break;
    } catch {
      await sleep(400);
    }
  }
  if (!wsUrl) throw new Error("Chrome DevTools endpoint never came up");

  const cdp = await CDP.connect(wsUrl, dir);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  return { chrome, cdp };
}

/** Makes the shots directory and returns its path. */
export function shotsDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

/* ------------------------------------------------------------ page helpers */

/** Clicks the first element whose text contains the given words. */
export const clickByText = (text, tag = "button") => `(() => {
  const els = [...document.querySelectorAll('${tag}')];
  const el = els.find(e => e.textContent.trim().toLowerCase().includes(${JSON.stringify(
    text.toLowerCase()
  )}));
  if (!el) return 'NOT_FOUND';
  el.click();
  return 'CLICKED';
})()`;

/** Fills a form control the way a person would, so React notices. */
export const setInput = (name, value) => `(() => {
  // Only the form controls, never a <meta name="..."> that happens to have the
  // same name.
  const el = document.querySelector('input[name="${name}"], select[name="${name}"], textarea[name="${name}"]');
  if (!el) return 'NOT_FOUND';
  if (el instanceof HTMLSelectElement) {
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'SET';
  }
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'SET';
})()`;

/** Ticks a checkbox. */
export const setCheckbox = (name) => `(() => {
  const el = document.querySelector('[name="${name}"]');
  if (!el) return 'NOT_FOUND';
  if (!el.checked) el.click();
  return el.checked ? 'CHECKED' : 'FAILED';
})()`;
