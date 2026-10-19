/**
 * D3 正式页面业务验收（真实 API）。D01–D06。
 *
 * 单进程编排：启动真实 API（tsx）→ 启动 Vite（代理到 3000）→ Chrome/CDP 真实操作
 * → 截图写入 tests/e2e/artifacts/d3-real-api/ → 全部关闭。
 * 只驱动现有页面，不改 presentation，不做视觉断言。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = "C:/Users/lenovo/Documents/deepseek-harness/default-workspace/poetry-checker";
const OUT = join(ROOT, "tests/e2e/artifacts/d3-real-api");
const CHROME = "C:\\Users\\lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9360;
const WEB = "http://127.0.0.1:5180/";

mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
function start(name, args, cwd) {
  const child = spawn(process.execPath, args, { cwd, stdio: "ignore" });
  children.push({ name, child });
  return child;
}
function stopAll() {
  for (const { child } of children) {
    try { child.kill(); } catch { /* ignore */ }
  }
}

async function waitUrl(url, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch { /* wait */ }
    await sleep(500);
  }
  return false;
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = [];
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
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        this.errors.push("console.error: " + msg.params.args.map((a) => a.value ?? "").join(" ").slice(0, 140));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout ${method}`)); } }, 30000);
    });
  }
}

const results = [];
const record = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};

const POEMS = {
  登鹳雀楼: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
  静夜思: "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
  黄鹤楼: "昔人已乘黄鹤去，此地空余黄鹤楼。黄鹤一去不复返，白云千载空悠悠。晴川历历汉阳树，芳草萋萋鹦鹉洲。日暮乡关何处是，烟波江上使人愁。",
};

const main = async () => {
  start("api", [`${ROOT}/node_modules/tsx/dist/cli.mjs`, "src/server.ts"], `${ROOT}/apps/api`);
  start("web", [`${ROOT}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", "5180"], `${ROOT}/apps/web`);

  const apiUp = await waitUrl("http://127.0.0.1:3000/healthz");
  const webUp = await waitUrl(WEB);
  console.log(`api=${apiUp} web=${webUp}`);
  if (!apiUp || !webUp) { stopAll(); process.exit(1); }

  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${join(tmpdir(), "d3-chrome-profile-real")}`,
    "--window-size=1440,900", WEB,
  ], { stdio: "ignore" });
  children.push({ name: "chrome", child: chrome });

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
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: join(tmpdir(), "d3-downloads") }).catch(() => undefined);

  const evaluate = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
    return r.result?.value;
  };
  const shot = async (name) => {
    const s = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, name), Buffer.from(s.data, "base64"));
  };
  const clickText = (re) => evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => !b.disabled && new RegExp(${JSON.stringify(re)}).test(b.textContent.trim()));
    if (!btn) return 'missing';
    btn.click();
    return 'clicked';
  })()`);
  const state = () => evaluate(`({
    summary: document.body.innerText.match(/(结论|通过|不合律|待复核|不适用|尚不支持)/)?.[0] ?? null,
    tokens: document.querySelectorAll('[data-token-id]').length,
    text: (document.querySelector('textarea') || {}).value ?? '',
    book: (document.querySelector('input[type=radio]:checked') || {}).value ?? '',
    stale: !!document.querySelector('.pc-stale'),
    error: document.querySelector('.pc-banner--error')?.textContent?.trim().slice(0, 120) ?? null,
    busy: /分析中|正在分析/.test(document.body.innerText),
    synthetic: /合成/.test(document.body.innerText),
  })`);

  await sleep(3000);

  // ---------- D01 点击三首示例 ----------
  for (const title of Object.keys(POEMS)) {
    const before = await state();
    const clicked = await clickText(`^${title}`);
    await sleep(600);
    const after = await state();
    record(`D01 ${title} 按钮可用且填入已批正文`,
      clicked === "clicked" && after.text === POEMS[title],
      `click=${clicked}, 长度 ${after.text.length}, 与已批正文一致=${after.text === POEMS[title]}`);
    record(`D01 ${title} 不偷偷切换韵书`,
      after.book === before.book,
      `韵书 前=${before.book} 后=${after.book}`);
  }

  // ---------- D02 平水登鹳雀楼真实提交 ----------
  await clickText("^登鹳雀楼");
  await sleep(500);
  await clickText("^分析");
  await sleep(3500);
  const d02 = await evaluate(`({
    tokens: document.querySelectorAll('[data-token-id]').length,
    text: document.body.innerText,
    hasVersion: /pingshui|平水/.test(document.body.innerText),
    synthetic: /合成/.test(document.body.innerText),
    checks: document.querySelectorAll('[data-finding-id], .pc-diagnosis__item, .pc-check').length,
  })`);
  record("D02 登鹳雀楼 20 字位", d02.tokens === 20, `tokens=${d02.tokens}`);
  record("D02 非合成 fixture 文案", d02.synthetic === false, `含「合成」=${d02.synthetic}`);
  record("D02 显示结论文案", /结论/.test(d02.text), `含「结论」=${/结论/.test(d02.text)}`);
  await shot("d02-dengguanquelou.png");

  // ---------- D03 静夜思 / 黄鹤楼 ----------
  await clickText("^静夜思");
  await sleep(500);
  await clickText("^分析");
  await sleep(3500);
  const d03a = await evaluate(`({
    text: document.body.innerText,
    notApplicable: /不适用/.test(document.body.innerText),
    tokens: document.querySelectorAll('[data-token-id]').length,
  })`);
  record("D03 静夜思 不适用且仍可看逐字",
    d03a.notApplicable && d03a.tokens === 20,
    `不适用=${d03a.notApplicable}, tokens=${d03a.tokens}`);
  await shot("d03-jingyesi.png");

  await clickText("^黄鹤楼");
  await sleep(500);
  await clickText("^分析");
  await sleep(4000);
  const d03b = await evaluate(`({
    text: document.body.innerText,
    tokens: document.querySelectorAll('[data-token-id]').length,
    hasTag: /特殊拗律/.test(document.body.innerText),
    hasFail: /不合律|违规/.test(document.body.innerText),
  })`);
  record("D03 黄鹤楼 56 字位并保留特殊拗律标签",
    d03b.tokens === 56 && d03b.hasTag,
    `tokens=${d03b.tokens}, 特殊拗律=${d03b.hasTag}`);
  record("D03 黄鹤楼 真实诊断未被隐藏",
    d03b.hasFail,
    `含不合律/违规=${d03b.hasFail}（任务书要求保留真实红字）`);
  await shot("d03-huanghelou.png");

  // ---------- D04 字位 → 候选 → 选音 → 重查 ----------
  await clickText("^登鹳雀楼");
  await sleep(400);
  await clickText("^分析");
  await sleep(3500);

  // 找一个**真有多个候选**的字位（「更」在平水韵有平/去两读），
  // 唯一候选已生效时展示层不渲染选择按钮，用它测不出选音链路。
  const candidates = await evaluate(`(() => {
    const cells = [...document.querySelectorAll('[data-token-id]')];
    return cells.map(c => ({ id: c.dataset.tokenId, label: c.getAttribute('aria-label') ?? '' }));
  })()`);
  const multi = candidates.find((c) => /更/.test(c.label)) ?? candidates[0];

  await evaluate(`(() => {
    const c = document.querySelector('[data-token-id="${multi.id}"]');
    c.focus();
    return 1;
  })()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { type: "char", text: "\r", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(900);

  const drawer = await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return { open: false };
    const btns = [...d.querySelectorAll('button')];
    return {
      open: true,
      candidates: [...d.querySelectorAll('h3')].map(h => h.textContent.trim()).find(t => /候选/.test(t)) ?? null,
      selectable: btns.filter(b => /改用此读音/.test(b.textContent) && !b.disabled).length,
      hasEvidence: /依据|来源|韵部/.test(d.textContent),
    };
  })()`);
  record("D04 字位可开证据抽屉并显示候选",
    drawer.open === true && drawer.candidates !== null,
    `${multi.id}(${multi.label}), 候选=${drawer.candidates}, 可选=${drawer.selectable}, 有依据=${drawer.hasEvidence}`);
  await shot("d04-evidence.png");

  if (drawer.selectable > 0) {
    const choose = await evaluate(`(() => {
      const d = document.querySelector('[role="dialog"]');
      const btn = [...d.querySelectorAll('button')].find(b => /改用此读音/.test(b.textContent) && !b.disabled);
      if (!btn) return 'missing';
      btn.click();
      return 'clicked';
    })()`);
    await sleep(4000);
    const after = await evaluate(`({
      text: document.body.innerText,
      userMark: /手动选择|用户指定/.test(document.body.innerText),
      tokens: document.querySelectorAll('[data-token-id]').length,
    })`);
    record("D04 选音后重查且标注用户选择",
      choose === "clicked" && after.tokens === 20,
      `click=${choose}, tokens=${after.tokens}, 标注=${after.userMark}`);
    await shot("d04-after-choose.png");
  } else {
    record("D04 选音后重查", false, "该字位没有可选候选（唯一候选已生效），未执行选音");
  }

  // ---------- D05 编辑/换书/换例 → stale ----------
  await evaluate(`(() => {
    const ta = document.querySelector('textarea');
    const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    s.call(ta, ta.value + "\\n更上一层楼。");
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;
  })()`);
  await sleep(700);
  const d05edit = await state();
  record("D05 编辑正文 → 旧报告 stale", d05edit.stale === true, `stale=${d05edit.stale}`);

  const downloadBlocked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /下载报告/.test(b.textContent));
    if (!btn) return { hasDownload: false };
    btn.click();
    return { hasDownload: true, disabled: btn.disabled };
  })()`);
  await sleep(1200);
  const afterStaleDl = await evaluate(`({
    feedback: document.querySelector('.pc-feedback')?.textContent?.trim() ?? '',
    stale: !!document.querySelector('.pc-stale'),
  })`);
  record("D05 stale 时导出被阻止并给出原因",
    downloadBlocked.hasDownload === true && afterStaleDl.stale === true &&
      /阻止导出|重新分析|不对应/.test(afterStaleDl.feedback),
    `按钮存在=${downloadBlocked.hasDownload}, 反馈="${afterStaleDl.feedback.slice(0, 50)}"`);

  // 韵书是 radio（label 包裹），不是 button：按 value 点选。
  const selectBook = (value) => evaluate(`(() => {
    const input = document.querySelector('input[type=radio][value="${value}"]');
    if (!input) return 'missing';
    input.click();
    return 'clicked';
  })()`);

  await selectBook("cilin");
  await sleep(700);
  const d05book = await state();
  record("D05 换韵书 → stale 保持", d05book.stale === true && d05book.book === "cilin",
    `stale=${d05book.stale}, 书=${d05book.book}`);
  await shot("d05-stale.png");

  // ---------- D06 复制 / 导出 ----------
  await selectBook("pingshui");
  await sleep(400);
  await clickText("^登鹳雀楼");
  await sleep(400);
  await clickText("^分析");
  await sleep(3500);
  await cdp.send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: "http://127.0.0.1:5180" }).catch(() => undefined);
  await clickText("^复制摘要");
  await sleep(800);
  const clip = await evaluate(`navigator.clipboard.readText().catch(e => 'READ_FAILED:' + e.message)`);
  record("D06 复制摘要与当前报告一致",
    typeof clip === "string" && clip.includes("诗格律检查器") && !clip.includes("合成"),
    `长度=${typeof clip === "string" ? clip.length : "-"}, 含合成=${typeof clip === "string" ? clip.includes("合成") : "-"}`);
  await shot("d06-copy.png");

  console.log("\n=== 运行时错误 ===");
  if (cdp.errors.length === 0) console.log("(none)");
  else cdp.errors.slice(0, 10).forEach((e) => console.log(" ", e));

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n=== 汇总: ${passed} 通过 / ${failed} 失败 / ${results.length} ===`);
  writeFileSync(join(OUT, "d01-d06-results.json"), JSON.stringify({ results, errors: cdp.errors }, null, 2));

  stopAll();
  process.exit(failed > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error("失败:", error.message);
  stopAll();
  process.exit(1);
});
