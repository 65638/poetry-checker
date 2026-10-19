#!/usr/bin/env node
/** 正式 / 入口 + 真实 API 的首批浏览器回归；不等价于 E04–E08 全量验收。 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
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
import { assertReportExport, assertSummaryExport } from "./export-checks.mjs";
import { passedScenario } from "./scenario-result.mjs";
import { runLiveFlowScenarios } from "./live-flow-scenarios.mjs";
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
    "E05 浏览器并发迟到全矩阵（单元测试已覆盖）",
    "E06 浏览器超时后的复制导出（失败与进行中已覆盖；超时由业务测试覆盖）",
    "E07 needs_review/unsupported 合成状态与浏览器30秒超时场景",
    "E08 全键盘矩阵与真人审美反馈",
    "E09 干净 clone",
  ],
};
let api, web, browser;
async function scenario(id, run) {
  try {
    const detail = await run();
    payload.results.push(passedScenario(id, detail));
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
      note: "入口检查；正文载入、配置保留与真实提交见 E04-example-flow 三个场景。",
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
  // ---------- E06：复制/下载内容与当前真实报告一致；stale 后不得导出旧结论 ----------
  await scenario("E06-copy-download-consistency", async () => {
    // 前置：重新加载页面，避免前序场景（E05 stale / E07 503）留下的状态干扰
    await cdp.send("Page.navigate", { url: payload.url });
    await waitFor(() =>
      evaluate("Boolean(document.querySelector('.pc-input__text'))"),
    );
    // 前置：前面的场景可能切换过韵书（E07 会切到 cilin 并触发 503），这里显式回到平水
    await click(".pc-segmented__option:has(input[value=pingshui])");
    await waitFor(() =>
      evaluate("document.querySelector('input[value=pingshui]').checked"),
    );
    const poem = POEMS[0];
    await click(".pc-input__text");
    await key("a", "KeyA", 65, 2);
    await cdp.send("Input.insertText", { text: poem.text });
    const before = responses.length;
    await click(".pc-input__submit");
    try {
      await waitFor(
        () =>
          responses.length > before && complete.has(responses.at(-1).requestId),
      );
    } catch (error) {
      const diag = await evaluate(
        "(() => { const s = document.querySelector('.pc-input__submit'); return { hasSubmit: !!s, submitDisabled: s ? s.disabled : null, alert: document.querySelector('[role=alert]') ? document.querySelector('[role=alert]').textContent.trim().slice(0, 60) : null, text: document.querySelector('.pc-input__text') ? document.querySelector('.pc-input__text').value.slice(0, 30) : null, stale: !!document.querySelector('.pc-report--stale'), hasReport: !!document.querySelector('.pc-reading') }; })()",
      );
      throw new Error(`等不到响应: ${JSON.stringify(diag)}`, { cause: error });
    }
    const response = responses.at(-1);
    const raw = await cdp.send("Network.getResponseBody", {
      requestId: response.requestId,
    });
    const report = JSON.parse(
      raw.base64Encoded ? Buffer.from(raw.body, "base64").toString() : raw.body,
    );
    const checked = checkCell(poem, "pingshui", {
      status: response.response.status,
      body: report,
    });
    assert.equal(checked.ok, true, JSON.stringify(checked.issues));
    const { postData } = await cdp.send("Network.getRequestPostData", {
      requestId: response.requestId,
    });
    const request = JSON.parse(postData);
    await waitFor(() =>
      evaluate(
        `Boolean(document.querySelector('.pc-status--${report.summary.status}')) && !document.querySelector('.pc-report--stale')`,
      ),
    );

    await cdp.send("Browser.grantPermissions", {
      origin: new URL(payload.url).origin,
      permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
    });
    const permission = "granted";
    await cdp.send("Page.bringToFront");
    // Ensure a no-op copy cannot pass by retaining a previous run's matching summary.
    await evaluate(
      `navigator.clipboard.writeText(${JSON.stringify(`before-copy-${Date.now()}`)})`,
    );

    const focusButton = (label) =>
      evaluate(
        `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(label)})); if (!b) return false; b.focus(); return Boolean(document.activeElement && document.activeElement.textContent.includes(${JSON.stringify(label)})); })()`,
      );
    assert(await focusButton("复制摘要"), "找不到“复制摘要”按钮");
    await key("Enter", "Enter", 13, 0, "\r");
    let feedback = null;
    let copiedDiag;
    for (let i = 0; i < 60; i += 1) {
      feedback = await evaluate(
        "document.querySelector('.pc-feedback')?.textContent?.trim() ?? null",
      );
      if (feedback) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!feedback) {
      copiedDiag = await evaluate(
        "({ active: document.activeElement ? document.activeElement.textContent.trim().slice(0, 24) : null, buttons: [...document.querySelectorAll('button')].map(b => (b.disabled ? 'disabled:' : '') + b.textContent.trim().slice(0, 12)).slice(0, 14), alert: document.querySelector('[role=alert]') ? document.querySelector('[role=alert]').textContent.trim().slice(0, 60) : null, clip: typeof navigator.clipboard })",
      );
      throw new Error(`复制后无反馈: ${JSON.stringify(copiedDiag)}`);
    }
    assert.equal(feedback, "摘要已复制到剪贴板。", "复制未成功");
    const clipboardText = await evaluate("navigator.clipboard.readText()");
    assertSummaryExport(clipboardText, report, request);
    const copied = {
      permission,
      feedback,
      clipboardChecked: clipboardText.length > 0,
      hasSummary: clipboardText.includes(`结论：${report.summary.status}`),
      hasBook: clipboardText.includes(`韵书：${report.policy.rhymeBook}`),
      hasGenre: clipboardText.includes(report.genre.formFamily),
      hasDataVersion: clipboardText.includes(report.versions.data),
      hasRulesVersion: clipboardText.includes(report.versions.rules),
      hasInputHash: clipboardText.includes(report.inputHash),
      hasText: clipboardText.includes(report.poem.originalText),
    };
    // New directory for every run: no existing JSON can masquerade as this download.
    const dlDir = mkdtempSync(join(options.out, "downloads-"));
    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: dlDir,
      eventsEnabled: true,
    });
    assert(await focusButton("下载报告"), "找不到“下载报告”按钮");
    await key("Enter", "Enter", 13, 0, "\r");
    let downloaded = null;
    for (let i = 0; i < 40 && !downloaded; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      const entry = readdirSync(dlDir).find((name) => name.endsWith(".json"));
      if (!entry) continue;
      try {
        downloaded = {
          name: entry,
          ...JSON.parse(readFileSync(join(dlDir, entry), "utf8")),
        };
      } catch {
        downloaded = null;
      }
    }
    assert(downloaded, "未产生可解析的导出 JSON");
    assertReportExport(downloaded, report, request);

    // stale 闸门：不得复制/导出旧结论
    await click(".pc-input__text");
    await cdp.send("Input.insertText", { text: " " });
    await waitFor(() =>
      evaluate("Boolean(document.querySelector('.pc-report--stale'))"),
    );
    const filesSnapshot = () =>
      readdirSync(dlDir)
        .sort()
        .map((name) => ({
          name,
          sha256: createHash("sha256")
            .update(readFileSync(join(dlDir, name)))
            .digest("hex"),
        }));
    const filesBefore = filesSnapshot();
    // A different sentinel catches incorrectly re-copying the same old summary.
    const staleSentinel = `stale-copy-must-not-write-${Date.now()}`;
    await evaluate(
      `navigator.clipboard.writeText(${JSON.stringify(staleSentinel)})`,
    );
    assert(await focusButton("复制摘要"), "stale 后找不到复制按钮");
    await key("Enter", "Enter", 13, 0, "\r");
    await waitFor(() =>
      evaluate(
        "document.querySelector('.pc-feedback')?.textContent.includes('已阻止')",
      ),
    );
    const blockedCopy = await evaluate(
      "document.querySelector('.pc-feedback').textContent.trim()",
    );
    const clipboardAfter = await evaluate("navigator.clipboard.readText()");
    assert.equal(clipboardAfter, staleSentinel, "stale 后剪贴板内容变化");
    assert(await focusButton("下载报告"), "stale 后找不到下载按钮");
    await key("Enter", "Enter", 13, 0, "\r");
    await waitFor(() =>
      evaluate(
        "document.querySelector('.pc-feedback')?.textContent.includes('已阻止导出')",
      ),
    );
    await new Promise((r) => setTimeout(r, 1500));
    assert.deepEqual(
      filesSnapshot(),
      filesBefore,
      "stale 后导出目录有新增或改写（含临时文件）",
    );
    return {
      permission,
      copied,
      downloadedFile: downloaded.name,
      downloadedReportMatchesEntireResponse: true,
      copiedAndDownloadedRequestMatchesNetworkRequest: true,
      downloadDirectory: dlDir,
      staleClipboardSentinelPreserved: true,
      blockedCopy,
      staleBlocksExport: true,
    };
  });

  // ---------- E08：纯键盘进入字格与详情（不重复已有的鼠标点字+Esc） ----------
  await scenario("E08-keyboard-token-dialog", async () => {
    // 前置：重新加载页面，避免前序场景（E05 stale / E07 503）留下的状态干扰
    await cdp.send("Page.navigate", { url: payload.url });
    await waitFor(() =>
      evaluate("Boolean(document.querySelector('.pc-input__text'))"),
    );
    // 前置：前面的场景可能切换过韵书（E07 会切到 cilin 并触发 503），这里显式回到平水
    await click(".pc-segmented__option:has(input[value=pingshui])");
    await waitFor(() =>
      evaluate("document.querySelector('input[value=pingshui]').checked"),
    );
    const poem = POEMS[1];
    await click(".pc-input__text");
    await key("a", "KeyA", 65, 2);
    await cdp.send("Input.insertText", { text: poem.text });
    const before = responses.length;
    await click(".pc-input__submit");
    try {
      await waitFor(
        () =>
          responses.length > before && complete.has(responses.at(-1).requestId),
      );
    } catch (error) {
      const diag = await evaluate(
        "(() => { const s = document.querySelector('.pc-input__submit'); return { hasSubmit: !!s, submitDisabled: s ? s.disabled : null, alert: document.querySelector('[role=alert]') ? document.querySelector('[role=alert]').textContent.trim().slice(0, 60) : null, text: document.querySelector('.pc-input__text') ? document.querySelector('.pc-input__text').value.slice(0, 30) : null, stale: !!document.querySelector('.pc-report--stale'), hasReport: !!document.querySelector('.pc-reading') }; })()",
      );
      throw new Error(`等不到响应: ${JSON.stringify(diag)}`, { cause: error });
    }
    await waitFor(() =>
      evaluate("document.querySelectorAll('[data-token-id]').length > 0"),
    );

    // From here onward use only keyboard input; the analysis setup above uses mouse.
    const startingFocus =
      await evaluate(`({ tag: document.activeElement?.tagName,
      className: document.activeElement?.className })`);
    let tabs = 0;
    let tokenId = null;
    while (tabs < 150) {
      await key("Tab", "Tab", 9);
      tabs += 1;
      tokenId = await evaluate(
        "document.activeElement?.dataset?.tokenId ?? null",
      );
      if (tokenId) break;
    }
    assert(tokenId, `Tab 走了 ${tabs} 次仍未到达字格`);
    const tokenText = await evaluate(
      `document.querySelector('[data-token-id="${tokenId}"]').textContent.trim()`,
    );

    await key("Enter", "Enter", 13, 0, "\r");
    await waitFor(() =>
      evaluate(
        `document.querySelector('[data-token-id="${tokenId}"]').getAttribute('aria-expanded') === 'true'`,
      ),
    );
    const dialogOpen = await evaluate(
      "Boolean(document.querySelector('[role=dialog]'))",
    );
    assert(dialogOpen, "Enter 未打开详情");

    let innerTabs = 0;
    let closeLabel = null;
    const innerPath = [];
    while (innerTabs < 80) {
      // Always press Tab at least once; initial auto-focus on close is not Tab coverage.
      await key("Tab", "Tab", 9);
      innerTabs += 1;
      const focus = await evaluate(`(() => {
        const a = document.activeElement;
        return { inside: Boolean(a?.closest('[role=dialog]')), tag: a?.tagName,
          text: a?.textContent?.trim(), close: Boolean(a?.matches('.pc-evidence__header button')) };
      })()`);
      assert(focus.inside, "Tab 焦点逃出对话框");
      innerPath.push(focus);
      closeLabel = await evaluate(
        "document.activeElement?.matches('.pc-evidence__header button') ? document.activeElement.textContent.trim() : null",
      );
      if (closeLabel) break;
    }
    assert(closeLabel, "对话框内 Tab 未落到可操作按钮");
    await key(" ", "Space", 32, 0, " ");
    await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"));
    const focusAfterSpace = await evaluate(
      "document.activeElement?.dataset?.tokenId ?? null",
    );
    assert.equal(focusAfterSpace, tokenId, "Space 关闭后焦点未回到触发字");

    await key(" ", "Space", 32, 0, " ");
    await waitFor(() =>
      evaluate("Boolean(document.querySelector('[role=dialog]'))"),
    );
    await key("Escape", "Escape", 27);
    await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"));
    const focusAfterEscape = await evaluate(
      "document.activeElement?.dataset?.tokenId ?? null",
    );
    assert.equal(focusAfterEscape, tokenId, "Escape 关闭后焦点未回到触发字");

    return {
      tokenId,
      tokenText,
      startingFocus,
      tabsToReachToken: tabs,
      innerTabsToClose: innerTabs,
      innerFocusPath: innerPath,
      closeLabel,
      keysUsed: ["Tab", "Enter", "Space", "Escape"],
      focusReturn: { space: focusAfterSpace, escape: focusAfterEscape },
      dialogOpen,
      scope:
        "分析前置用鼠标；提交后的 Tab→字格→详情→关闭全程真实按键，无 DOM focus/click 代替",
    };
  });

  await runLiveFlowScenarios({
    browser,
    payload,
    options,
    responses,
    complete,
    scenario,
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
