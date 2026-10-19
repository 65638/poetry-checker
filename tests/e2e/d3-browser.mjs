#!/usr/bin/env node
/** 正式 / 入口 + 真实 API 的首批浏览器回归；不等价于 E04–E08 全量验收。 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  REPO_ROOT,
  startApi,
  revision,
  readiness,
  waitFor,
} from "../../scripts/acceptance-runtime.mjs";
import { launchBrowser } from "./cdp.mjs";
import { POEMS, checkCell } from "../integration/e2e/d3-acceptance-api.mjs";

const options = {
  out: join(REPO_ROOT, "artifacts/acceptance/browser"),
  browser: undefined,
};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--browser") options.browser = process.argv[++i];
  else if (process.argv[i] === "--out")
    options.out = resolve(process.argv[++i]);
  else throw new Error(`未知参数 ${process.argv[i]}`);
}
mkdirSync(options.out, { recursive: true });
const payload = {
  generatedAt: new Date().toISOString(),
  revision: revision(),
  scope: "D3 浏览器基础回归（部分系统验收）",
  results: [],
  notRun: [
    "E05 人工选音、跨书旧覆盖、并发迟到全矩阵",
    "E06 剪贴板/报告文件内容核对",
    "E07 needs_review/unsupported/网络故障受控替身",
    "E08 全键盘矩阵与真人审美反馈",
    "E09 干净 clone",
  ],
};
let api, web, browser;
async function scenario(id, run) {
  try {
    const detail = await run();
    payload.results.push({ id, status: "pass", detail });
    console.log(`[PASS] ${id}`);
  } catch (err) {
    payload.results.push({ id, status: "fail", error: err.message });
    console.log(`[FAIL] ${id}: ${err.message}`);
  }
}

try {
  api = await startApi();
  payload.readiness = await readiness(api.baseUrl);
  assert.equal(payload.readiness.mode, "real");
  const appRoot = join(REPO_ROOT, "apps/web");
  const require = createRequire(join(appRoot, "package.json"));
  const { createServer } = await import(
    pathToFileURL(require.resolve("vite")).href
  );
  // Always go through this isolated Vite proxy; don't inherit a personal API URL.
  process.env.VITE_API_BASE_URL = "";
  web = await createServer({
    root: appRoot,
    configFile: join(appRoot, "vite.config.ts"),
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: Object.fromEntries(
        ["/api", "/healthz", "/readyz"].map((path) => [path, api.baseUrl]),
      ),
    },
  });
  await web.listen();
  payload.url = `http://127.0.0.1:${web.httpServer.address().port}/`;
  browser = await launchBrowser(options.browser);
  const { cdp, evaluate, click, key } = browser;
  payload.browser = await cdp.send("Browser.getVersion");
  const responses = [],
    complete = new Set(),
    pageErrors = [];
  cdp.on("Network.responseReceived", ({ requestId, response }) => {
    if (response.url.endsWith("/api/v1/analyze"))
      responses.push({ requestId, response });
  });
  cdp.on("Network.loadingFinished", ({ requestId }) => complete.add(requestId));
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) =>
    pageErrors.push(exceptionDetails.text),
  );
  const viewport = (width) =>
    cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
  await viewport(1440);
  await cdp.send("Page.navigate", { url: payload.url });
  await waitFor(() =>
    evaluate("Boolean(document.querySelector('.pc-input__text'))"),
  );

  const examples = await evaluate(
    "[...document.querySelectorAll('.pc-examples__item')].map(b => ({text:b.textContent,disabled:b.disabled}))",
  );
  payload.results.push({
    id: "E04-example-entry",
    status:
      examples.length === 3 && examples.every((b) => !b.disabled)
        ? "pass"
        : "blocked",
    detail: {
      examples,
      note: "这里只核入口可用性；正文载入/配置保留仍需 D 的示例交付后补测。",
    },
  });

  for (const poem of POEMS) {
    await scenario(`E04-manual-input-${poem.id}`, async () => {
      await click(".pc-input__text");
      await key("a", "KeyA", 65, 2);
      await cdp.send("Input.insertText", { text: poem.text });
      const count = responses.length;
      await click(".pc-input__submit");
      await waitFor(
        () =>
          responses.length > count && complete.has(responses.at(-1).requestId),
      );
      const response = responses.at(-1);
      const raw = await cdp.send("Network.getResponseBody", {
        requestId: response.requestId,
      });
      const body = JSON.parse(
        raw.base64Encoded
          ? Buffer.from(raw.body, "base64").toString()
          : raw.body,
      );
      const result = checkCell(poem, "pingshui", {
        status: response.response.status,
        body,
      });
      assert.deepEqual(result.issues, []);
      await waitFor(() =>
        evaluate(
          `Boolean(document.querySelector('.pc-status--${body.summary.status}')) && document.querySelectorAll('[data-token-id]').length === ${body.poem.tokens.length}`,
        ),
      );
      const punctuation = await evaluate(
        "[...document.querySelectorAll('.pc-punct')].map(n => n.textContent)",
      );
      assert(
        punctuation.every((p) => !/\p{Script=Han}/u.test(p)),
        "标点节点不得含后续汉字",
      );
      await click('[data-token-id="l1c1"]');
      await waitFor(() =>
        evaluate("Boolean(document.querySelector('[role=dialog]'))"),
      );
      assert(
        await evaluate(
          "document.querySelector('[role=dialog]').textContent.includes('候选读音')",
        ),
      );
      assert(
        await evaluate(
          "document.querySelector('[role=dialog]').textContent.includes('来源')",
        ),
      );
      await key("Escape", "Escape", 27);
      await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"));
      assert.equal(
        await evaluate("document.activeElement.dataset.tokenId"),
        "l1c1",
      );
      return {
        ...result.facts,
        entry: "手动输入→真实 HTTP→点字依据→Esc 焦点返回",
      };
    });
  }
  for (const width of [1440, 768, 375]) {
    await scenario(`E08-layout-${width}`, async () => {
      await viewport(width);
      const layout =
        await evaluate(`new Promise(resolve => requestAnimationFrame(() => resolve({
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        minCell: Math.min(...[...document.querySelectorAll('.pc-cell')].map(el => el.getBoundingClientRect().width))
      })))`);
      assert(layout.scrollWidth <= width, "页面横向溢出");
      assert(layout.minCell >= 44, "触控宽度小于44px");
      await evaluate(
        "document.querySelector('.pc-reading').scrollIntoView({block:'start'})",
      );
      const image = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      writeFileSync(
        join(options.out, `report-${width}.png`),
        Buffer.from(image.data, "base64"),
      );
      return layout;
    });
  }
  await scenario("E08-reduced-motion", async () => {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    assert(
      await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"),
    );
    const ms = await evaluate(
      "parseFloat(getComputedStyle(document.querySelector('.pc-root')).getPropertyValue('--pc-dur-report'))",
    );
    assert(ms <= 1, "减弱动效仍使用长时长");
    return { reportDurationMs: ms };
  });
  await scenario("E05-stale", async () => {
    await click(".pc-input__text");
    await cdp.send("Input.insertText", { text: " " });
    await waitFor(() =>
      evaluate("Boolean(document.querySelector('.pc-report--stale'))"),
    );
    return "修改正文后旧报告标记过时";
  });
  await scenario("E07-data-not-ready", async () => {
    await click(".pc-segmented__option:has(input[value=cilin])");
    assert(
      await evaluate("document.querySelector('input[value=cilin]').checked"),
    );
    const count = responses.length;
    await click(".pc-input__submit");
    await waitFor(
      () =>
        responses.length > count && complete.has(responses.at(-1).requestId),
    );
    const response = responses.at(-1);
    assert.equal(response.response.status, 503);
    const raw = await cdp.send("Network.getResponseBody", {
      requestId: response.requestId,
    });
    assert.equal(JSON.parse(raw.body).error.code, "DATA_NOT_READY");
    await waitFor(() =>
      evaluate(
        "document.querySelector('[role=alert]')?.textContent.includes('HTTP_503')",
      ),
    );
    assert(
      await evaluate(
        "document.querySelector('[role=alert]').textContent.includes('未就绪')",
      ),
    );
    return "真实 HTTP DATA_NOT_READY 在界面映射为 HTTP_503，原因与恢复提示可见";
  });
  payload.pageErrors = pageErrors;
  if (pageErrors.length) throw new Error("浏览器出现未捕获异常");
} catch (err) {
  payload.runnerError = err.stack ?? err.message;
  console.error(err.message);
} finally {
  for (const close of [
    () => browser?.stop(),
    () => web?.close(),
    () => api?.stop(),
  ]) {
    try {
      await close();
    } catch (err) {
      payload.cleanupError = err.message;
    }
  }
  payload.passed = payload.results.filter((r) => r.status === "pass").length;
  payload.blocked = payload.results.filter(
    (r) => r.status === "blocked",
  ).length;
  payload.failed = payload.results.filter((r) => r.status === "fail").length;
  payload.exitCode =
    payload.failed || payload.runnerError || payload.cleanupError
      ? 1
      : payload.blocked
        ? 2
        : 0;
  writeFileSync(
    join(options.out, "result.json"),
    JSON.stringify(payload, null, 2) + "\n",
  );
  console.log(
    `浏览器基础回归：通过 ${payload.passed}，阻断 ${payload.blocked}，失败 ${payload.failed}；exit ${payload.exitCode}`,
  );
  process.exitCode = payload.exitCode;
}
