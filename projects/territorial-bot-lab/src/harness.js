import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const instrumentationPath = path.join(moduleDir, "instrumentation.js");

export async function createHarness(options = {}) {
  const {
    url = "https://territorial.io/",
    headless = false,
    viewport = { width: 1440, height: 900 },
    slowMo = 0,
  } = options;

  const browser = await chromium.launch({ headless, slowMo });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const networkLog = createNetworkLog(page);
  await page.addInitScript({ path: instrumentationPath });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 15000 });

  return new TerritorialHarness(browser, context, page, networkLog);
}

export class TerritorialHarness {
  constructor(browser, context, page, networkLog = []) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.networkLog = networkLog;
  }

  async close() {
    await this.context.close().catch(() => {});
    await this.browser.close().catch(() => {});
  }

  async wait(milliseconds) {
    await this.page.waitForTimeout(milliseconds);
  }

  async snapshot() {
    return this.page.evaluate(() => {
      if (!window.__territorialBotLab) {
        throw new Error("Territorial Bot Lab instrumentation did not load.");
      }
      return window.__territorialBotLab.getSnapshot();
    });
  }

  async domSnapshot() {
    return this.page.evaluate(() => {
      function visible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width > 0 &&
          rect.height > 0;
      }

      const elements = Array.from(document.querySelectorAll("button, input, textarea, select, a, [role], div, span"))
        .filter(visible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const text = String(element.innerText || element.textContent || element.value || "").trim();
          return {
            tag: element.tagName.toLowerCase(),
            role: element.getAttribute("role"),
            id: element.id || null,
            className: typeof element.className === "string" ? element.className : null,
            text,
            value: "value" in element ? String(element.value ?? "") : "",
            placeholder: "placeholder" in element ? String(element.placeholder ?? "") : "",
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          };
        })
        .filter((element) => element.text || element.value || element.placeholder || element.role);

      return {
        now: Date.now(),
        url: location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        bodyText: String(document.body?.innerText ?? "").trim(),
        elements,
      };
    });
  }

  networkSnapshot() {
    return this.networkLog.slice();
  }

  async screenshot(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await this.page.screenshot({ path: filePath, fullPage: false });
  }

  async canvasPng(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const dataUrl = await this.page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) throw new Error("No canvas found.");
      return canvas.toDataURL("image/png");
    });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    await fs.writeFile(filePath, Buffer.from(base64, "base64"));
  }

  async sampleCanvasGrid(options = {}) {
    const cols = options.cols ?? 48;
    const rows = options.rows ?? 32;
    return this.page.evaluate(
      ({ cols: evalCols, rows: evalRows }) => {
        const canvas = document.querySelector("canvas");
        if (!canvas) throw new Error("No canvas found.");
        const ctx = canvas.getContext("2d");
        const samples = [];
        for (let row = 0; row < evalRows; row += 1) {
          for (let col = 0; col < evalCols; col += 1) {
            const x = Math.floor(((col + 0.5) / evalCols) * canvas.width);
            const y = Math.floor(((row + 0.5) / evalRows) * canvas.height);
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            samples.push({
              col,
              row,
              x,
              y,
              rgba: [pixel[0], pixel[1], pixel[2], pixel[3]],
            });
          }
        }
        return {
          width: canvas.width,
          height: canvas.height,
          cols: evalCols,
          rows: evalRows,
          samples,
        };
      },
      { cols, rows },
    );
  }

  async clickCanvas(normalizedX, normalizedY) {
    const box = await this.canvasBox();
    await this.page.mouse.click(
      box.x + box.width * normalizedX,
      box.y + box.height * normalizedY,
    );
  }

  async hoverCanvas(normalizedX, normalizedY) {
    const box = await this.canvasBox();
    await this.page.mouse.move(
      box.x + box.width * normalizedX,
      box.y + box.height * normalizedY,
    );
  }

  async dragCanvas(from, to, options = {}) {
    const box = await this.canvasBox();
    const steps = options.steps ?? 12;
    await this.page.mouse.move(box.x + box.width * from.x, box.y + box.height * from.y);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width * to.x, box.y + box.height * to.y, { steps });
    await this.page.mouse.up();
  }

  async canvasBox() {
    const handle = await this.page.$("canvas");
    if (!handle) throw new Error("No canvas found.");
    const box = await handle.boundingBox();
    if (!box) throw new Error("Canvas is not visible.");
    return box;
  }

  async setAttackPercent(normalizedX) {
    const clamped = Math.max(0.02, Math.min(0.98, normalizedX));
    const box = await this.canvasBox();
    await this.page.mouse.click(box.x + box.width * clamped, box.y + box.height * 0.965);
  }

  async setPlayerName(playerName) {
    const value = String(playerName ?? "").trim();
    if (!value) return false;
    const input = this.page.locator('input[placeholder*="Kingdom"]').first();
    const count = await input.count();
    if (!count) return false;
    await input.fill(value);
    await this.page.waitForTimeout(150);
    return true;
  }

  async writeJson(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
  }
}

function createNetworkLog(page) {
  const maxEvents = 500;
  const log = [];
  const push = (event) => {
    log.push({ at: Date.now(), ...event });
    if (log.length > maxEvents) log.splice(0, log.length - maxEvents);
  };

  page.on("request", (request) => {
    push({
      type: "request",
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
    });
  });
  page.on("response", (response) => {
    push({
      type: "response",
      status: response.status(),
      url: response.url(),
    });
  });
  page.on("websocket", (socket) => {
    const socketId = log.filter((entry) => entry.type?.startsWith("websocket")).length + 1;
    push({ type: "websocket-open", id: socketId, url: socket.url() });
    socket.on("framesent", (frame) => {
      push({ type: "websocket-frame-sent", id: socketId, opcode: frame.opcode, bytes: String(frame.payload ?? "").length });
    });
    socket.on("framereceived", (frame) => {
      push({ type: "websocket-frame-received", id: socketId, opcode: frame.opcode, bytes: String(frame.payload ?? "").length });
    });
    socket.on("close", () => {
      push({ type: "websocket-close", id: socketId, url: socket.url() });
    });
  });
  page.on("console", (message) => {
    push({ type: "console", level: message.type(), text: message.text().slice(0, 500) });
  });
  page.on("pageerror", (error) => {
    push({ type: "pageerror", text: String(error?.message ?? error).slice(0, 500) });
  });

  return log;
}
