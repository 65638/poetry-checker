/* global process, console, fetch, setTimeout, Buffer, WebSocket */
/**
 * D3 故障注入 + 视口 + 键盘 + reduced-motion（D07–D09）。
 *
 * 故障用 CDP Fetch 拦截注入（模拟故障类记录，与真实成功记录分开存放）。
 * 不改 apps/api，不改 presentation。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = "C:/Users/lenovo/Documents/deepseek-harness/default-workspace/poetry-checker";
const OUT = join(ROOT, "tests/e2e/artifacts/d3-faults");
const CHROME = "C:\\Users\\lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9361;
const WEB = "http://127.0.0.1:5180/";

mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
const start = (args, cwd) => {
  const child = spawn(process.execPath, args, { cwd, stdio: "ignore" });
  children.push(child);
  return child;
};
const stopAll = () => { for (const c of children) { try { c.kill(); } catch { /* ignore */ } } };

async function waitUrl(url, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* wait */ }
    await sleep(500);
  }
  return false;
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = [];
    this.intercept = null; // "fulfill503" | "hang" | null
    this.pausedIds = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined) {
        const w = this.pending.get(msg.id);
        if (w) {
          this.pending.delete(msg.id);
          if (msg.error) w.reject(new Error(JSON.stringify(msg.error)));
          else w.resolve(msg.result);
        }
        return;
      }
      if (msg.method === "Runtime.exceptionThrown") {
        this.errors.push("exception: " + (msg.params.exceptionDetails.exception?.description?.split("\n")[0] ?? ""));
      }
      if (msg.method === "Fetch.requestPaused") {
        const { requestId, request } = msg.params;
        if (!request.url.includes("/api/v1/analyze")) {
          this.send("Fetch.continueRequest", { requestId }).catch(() => undefined);
          return;
        }
        if (this.intercept === "fulfill503") {
          const body = JSON.stringify({
            error: {
              code: "DATA_NOT_READY",
              message: "合成故障注入：快照 pingshui 未审核，拒绝支撑读音结论",
              fieldErrors: [],
            },
          });
          this.send("Fetch.fulfillRequest", {
            requestId,
            responseCode: 503,
            responseHeaders: [
              { name: "content-type", value: "application/json" },
              { name: "content-length", value: String(Buffer.byteLength(body)) },
            ],
            body: Buffer.from(body).toString("base64"),
          }).catch(() => undefined);
          return;
        }
        if (this.intercept === "hang") {
          this.pausedIds.push(requestId); // 故意不回应，模拟超时
          return;
        }
        this.send("Fetch.continueRequest", { requestId }).catch(() => undefined);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout ${method}`)); } }, 40000);
    });
  }
}

const results = [];
const record = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};

const POEM = "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。";

const main = async () => {
  start([`${ROOT}/node_modules/tsx/dist/cli.mjs`, "src/server.ts"], `${ROOT}/apps/api`);
  start([`${ROOT}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", "5180"], `${ROOT}/apps/web`);
  const apiUp = await waitUrl("http://127.0.0.1:3000/healthz");
  const webUp = await waitUrl(WEB);
  console.log(`api=${apiUp} web=${webUp}`);
  if (!apiUp || !webUp) { stopAll(); process.exit(1); }

  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${join(tmpdir(), "d3-chrome-profile-faults")}`,
    "--window-size=1440,900", WEB,
  ], { stdio: "ignore" });
  children.push(chrome);

  let targets = [];
  for (let i = 0; i < 80; i += 1) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch { /* wait */ }
    await sleep(250);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const cdp = new Cdp(ws);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");

  const evaluate = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
    return r.result?.value;
  };
  const shot = async (name) => {
    const s = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, name), Buffer.from(s.data, "base64"));
  };
  const setViewport = async (w, h, mobile = false) => {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    await sleep(500);
  };
  const typePoem = (text) => evaluate(`(() => {
    const ta = document.querySelector('textarea');
    const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    s.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return ta.value.length;
  })()`);
  const clickAnalyze = () => evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^分析/.test(x.textContent.trim()));
    if (!b || b.disabled) return 'unavailable';
    b.click();
    return 'clicked';
  })()`);
  const snapshot = () => evaluate(`({
    busy: /分析中/.test(document.body.innerText),
    tokens: document.querySelectorAll('[data-token-id]').length,
    error: document.querySelector('.pc-banner--error')?.textContent?.trim().slice(0, 200) ?? null,
    text: (document.querySelector('textarea') || {}).value ?? '',
    stale: !!document.querySelector('.pc-stale'),
    feedback: document.querySelector('.pc-feedback')?.textContent?.trim() ?? '',
  })`);

  await sleep(3000);

  // ---------- D07 503 ----------
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  cdp.intercept = "fulfill503";
  await typePoem(POEM);
  await sleep(300);
  const click503 = await clickAnalyze();
  await sleep(2500);
  const s503 = await snapshot();
  record("D07 503：保留输入、忙碌结束、显示可执行原因",
    click503 === "clicked" && s503.text === POEM && s503.busy === false &&
      (s503.error ?? "").includes("原因") && (s503.error ?? "").includes("快照 pingshui 未审核"),
    `click=${click503}, busy=${s503.busy}, 输入保留=${s503.text === POEM}, 错误=${(s503.error ?? "").slice(0, 80)}`);
  record("D07 503：首次失败不伪造报告", s503.tokens === 0, `字位=${s503.tokens}`);
  await shot("d07-503.png");

  cdp.intercept = null;

  // ---------- D07 离线 ----------
  await cdp.send("Network.emulateNetworkConditions", {
    offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  const clickOff = await clickAnalyze();
  await sleep(2500);
  const sOff = await snapshot();
  record("D07 离线：保留输入、忙碌结束、提示网络问题",
    clickOff === "clicked" && sOff.text === POEM && sOff.busy === false &&
      /无法连接|网络/.test(sOff.error ?? ""),
    `busy=${sOff.busy}, 输入保留=${sOff.text === POEM}, 错误=${(sOff.error ?? "").slice(0, 70)}`);
  await shot("d07-offline.png");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });

  // ---------- D07 超时（请求被挂起不应答） ----------
  // 客户端默认 30s 超时；轮询到 busy 结束为止，最多等 35s。
  cdp.intercept = "hang";
  const clickHang = await clickAnalyze();
  let hangEnded = false;
  let hangWaited = 0;
  for (let i = 0; i < 70; i += 1) {
    await sleep(500);
    hangWaited += 500;
    const busy = await evaluate(`/分析中/.test(document.body.innerText)`);
    if (busy === false) { hangEnded = true; break; }
    if (hangWaited >= 35000) break;
  }
  const sHang = await snapshot();
  record("D07 超时：忙碌能在客户端结束（可重试）",
    clickHang === "clicked" && hangEnded && sHang.busy === false,
    `等待 ${hangWaited}ms 后 busy=${sHang.busy}, 错误码文案=${(sHang.error ?? "").slice(0, 60)}`);
  record("D07 超时：保留输入且不伪造报告",
    sHang.text === POEM && sHang.tokens === 0,
    `输入保留=${sHang.text === POEM}, 字位=${sHang.tokens}`);
  await shot("d07-timeout.png");
  cdp.intercept = null;
  for (const requestId of cdp.pausedIds) {
    await cdp.send("Fetch.failRequest", { requestId, errorReason: "Aborted" }).catch(() => undefined);
  }
  cdp.pausedIds = [];

  // ---------- D08 视口与溢出（真实报告下） ----------
  await cdp.send("Fetch.disable").catch(() => undefined);
  for (const [label, w, h, mobile] of [["375", 375, 720, true], ["768", 768, 1024, false], ["1440", 1440, 900, false]]) {
    await setViewport(w, h, mobile);
    await typePoem(POEM);
    await sleep(300);
    await clickAnalyze();
    await sleep(3500);
    const m = await evaluate(`(() => {
      const de = document.documentElement;
      // 开发壳（DEV 场景面板）不进生产包，不计入正式 UI 触控要求，单独报告。
      const devPanel = document.querySelector('[data-testid="dev-shell-panel"]');
      const btns = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null);
      const official = btns.filter(b => !devPanel || !devPanel.contains(b));
      const minOf = (list) => list.length === 0 ? null : Math.round(Math.min(...list.map(b => {
        const r = b.getBoundingClientRect();
        return Math.min(r.width, r.height);
      })));
      return {
        scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
        overflow: de.scrollWidth - de.clientWidth,
        minBtn: minOf(official),
        devMin: minOf(btns.filter(b => devPanel && devPanel.contains(b))),
        tokens: document.querySelectorAll('[data-token-id]').length,
      };
    })()`);
    record(`D08 ${label}px 无横向溢出`,
      m.overflow <= 2,
      `scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth} 溢出=${m.overflow}px, 字位=${m.tokens}`);
    record(`D08 ${label}px 触控目标 ≥44px（正式 UI）`,
      m.minBtn !== null && m.minBtn >= 44,
      `正式按钮最小边=${m.minBtn}px；开发壳最小边=${m.devMin}px（仅 DEV，不计入）`);
    await shot(`d08-${label}.png`);
  }

  // ---------- D08 键盘：Tab / Escape / 焦点返回 ----------
  await setViewport(1440, 900, false);
  await typePoem(POEM);
  await sleep(300);
  await clickAnalyze();
  await sleep(3500);
  await evaluate(`(() => { document.querySelector('[data-token-id]').focus(); return 1; })()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { type: "char", text: "\r", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(900);
  const opened = await evaluate(`!!document.querySelector('[role="dialog"]')`);
  const focusIn = await evaluate(`(() => { const d = document.querySelector('[role="dialog"]'); return d ? d.contains(document.activeElement) : false; })()`);
  record("D08 Enter 打开抽屉且焦点进入", opened && focusIn, `open=${opened}, focusInside=${focusIn}`);

  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await sleep(800);
  const afterEsc = await evaluate(`(() => {
    const el = document.activeElement;
    return { open: !!document.querySelector('[role="dialog"]'), tokenId: el?.dataset?.tokenId ?? null };
  })()`);
  record("D08 Escape 关闭且焦点返回字位",
    afterEsc.open === false && afterEsc.tokenId !== null,
    `关闭=${!afterEsc.open}, 焦点字位=${afterEsc.tokenId}`);
  await shot("d08-keyboard.png");

  // ---------- D09 reduced-motion ----------
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await typePoem(POEM);
  await sleep(300);
  const t0 = Date.now();
  await clickAnalyze();
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    const n = await evaluate(`document.querySelectorAll('[data-token-id]').length`);
    if (n > 0) { ready = true; break; }
  }
  const elapsed = Date.now() - t0;
  const d09 = await snapshot();
  record("D09 reduced-motion 下仍可完成分析且不人为延迟",
    ready && elapsed < 8000 && d09.tokens === 20,
    `耗时=${elapsed}ms, 字位=${d09.tokens}`);
  await shot("d09-reduced-motion.png");
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });

  console.log("\n=== 运行时错误 ===");
  if (cdp.errors.length === 0) console.log("(none)");
  else cdp.errors.slice(0, 10).forEach((e) => console.log(" ", e));

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n=== 汇总: ${passed} 通过 / ${failed} 失败 / ${results.length} ===`);
  writeFileSync(join(OUT, "d07-d09-results.json"), JSON.stringify({ results, errors: cdp.errors }, null, 2));

  stopAll();
  process.exit(failed > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error("失败:", error.message);
  stopAll();
  process.exit(1);
});
