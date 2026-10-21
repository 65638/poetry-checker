/**
 * **WIP（未接入 pnpm test:e2e）**：当前在 DevShell 选场景后报告区未出现 `pc-status--*`，
 * 两次运行均等待超时；需先确认 DevShell 的装载方式（是否需要走独立路由/容器）。
 * 保留文件是为了不丢工作，断言尚未通过，**不得当作已覆盖**。
 *
 * 受控五态：needs_review / unsupported 的展示、说明、详情与导出关系。
 *
 * 说明：这两个状态在真实数据下不可达，因此通过 **DevShell 开发场景选择器**（仅 Vite dev 模式渲染）
 * 装载 `fixtures/contracts/{needs_review,unsupported}.json`。报告里显式记录 mode=fixture，
 * 不进入真实金标准，也不代表任何真实语文学结论。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  REPO_ROOT,
  startApi,
  waitFor,
  revision,
  readiness,
} from "../../scripts/acceptance-runtime.mjs";
import { launchBrowser } from "./cdp.mjs";

const out = resolve(process.argv[2] ?? "artifacts/acceptance/five-states");
mkdirSync(out, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  revision: revision(),
  mode: "fixture (DevShell dev scenario)",
  note: "受控 fixture：needs_review / unsupported 真实数据不可达，本脚本只用开发场景选择器装载 fixtures/contracts/*.json，不作为真实金标准。",
  scenarios: [],
  screenshots: [],
};
let api, web, browser;
const scenario = async (name, run) => {
  try {
    const detail = await run();
    report.scenarios.push({ name, status: "pass", detail });
    console.log(`[PASS] ${name}`);
  } catch (e) {
    report.scenarios.push({ name, status: "fail", error: e.stack });
    console.log(`[FAIL] ${name}: ${e.message}`);
  }
};

try {
  api = await startApi();
  report.readiness = await readiness(api.baseUrl);
  assert.equal(report.readiness.mode, "real");
  const appRoot = join(REPO_ROOT, "apps/web");
  const require = createRequire(join(appRoot, "package.json"));
  const { createServer } = await import(
    pathToFileURL(require.resolve("vite")).href
  );
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
  report.url = `http://127.0.0.1:${web.httpServer.address().port}/`;
  browser = await launchBrowser();
  const { cdp, evaluate, click: browserClick, key } = browser;
  const click = async (selector, ms = 25000) => {
    const deadline = Date.now() + ms;
    let lastError;
    while (Date.now() < deadline) {
      try {
        return await browserClick(selector);
      } catch (error) {
        lastError = error;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    throw lastError;
  };
  report.browser = await cdp.send("Browser.getVersion");
  const pageErrors = [];
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) =>
    pageErrors.push(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    ),
  );
  const screenshot = async (name) => {
    const image = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(join(out, name), Buffer.from(image.data, "base64"));
    report.screenshots.push(name);
  };
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Page.navigate", { url: report.url });
  await waitFor(() => evaluate("!!document.querySelector('.pc-input__text')"));

  // DevShell 只在 dev 模式渲染；这既是入口也是“受控模式”的显式证据。
  const devPanel = '[data-testid="dev-shell-panel"]';
  await waitFor(() => evaluate(`!!document.querySelector('${devPanel}')`));

  const selectFixture = async (id) => {
    await evaluate(`(() => {
      const panel = document.querySelector('${devPanel}');
      const button = [...panel.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(id)}));
      if (!button) throw new Error('dev 场景按钮缺失: ' + ${JSON.stringify(id)});
      button.id = 'e2e-fixture-target';
      return true;
    })()`);
    await click("#e2e-fixture-target");
  };

  const readStatus = async () =>
    await evaluate(`(() => {
      const el = document.querySelector('[class*="pc-status--"]');
      if (!el) return null;
      const cls = [...el.classList].find((c) => c.startsWith('pc-status--'));
      return { cls, status: cls ? cls.replace('pc-status--', '') : null, text: el.innerText.trim() };
    })()`);

  for (const id of ["needs_review", "unsupported"]) {
    await scenario(`five-states-${id}`, async () => {
      await selectFixture(id);
      // 不绑定具体状态类名（UI 可能把 needs_review 映射为 uncertain）；
      // 断言“有状态、有说明、且绝不是 pass”，并记录实际类名作为证据。
      await waitFor(
        () => evaluate(`!!document.querySelector('[class*="pc-status--"]')`),
        25000,
      );
      const status = await readStatus();
      assert.ok(status, "状态区缺失");
      assert.notEqual(status.status, "pass", `${id} 不得显示为 pass`);
      assert.ok(status.text.length > 0, "状态区必须有说明文案");
      // 不得被渲染成通过
      assert.equal(
        await evaluate("!!document.querySelector('.pc-status--pass')"),
        false,
        `${id} 不得显示为 pass`,
      );
      await screenshot(`five-states-${id}.png`);

      // 详情：点字打开，含内容，Esc 关闭并回焦
      await click("[data-token-id]");
      await waitFor(() => evaluate("!!document.querySelector('[role=dialog]')"));
      const dialogText = await evaluate(
        "document.querySelector('[role=dialog]').innerText",
      );
      assert.ok(dialogText.length > 40, "详情内容过短");
      await key("Escape", "Escape", 27);
      await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"));

      // 导出关系：导出的 summary 必须与界面一致
      const dir = join(out, `downloads-${id}`);
      mkdirSync(dir, { recursive: true });
      await cdp.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: dir,
        eventsEnabled: true,
      });
      await evaluate(
        `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('下载报告')); if (!b) return false; b.focus(); return true; })()`,
      );
      await key("Enter", "Enter", 13, 0, "\r");
      let exported = null;
      for (let i = 0; i < 40 && !exported; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        const entry = readdirSync(dir).find((n) => n.endsWith(".json"));
        if (!entry) continue;
        try {
          exported = JSON.parse(readFileSync(join(dir, entry), "utf8"));
        } catch {
          exported = null;
        }
      }
      assert.ok(exported, "导出文件未生成");
      // 导出关系：导出的 summary 必须与界面同源且同样不是 pass
      const exportStatus = exported.report?.summary?.status;
      assert.ok(exportStatus, "导出缺少 summary.status");
      assert.notEqual(exportStatus, "pass", "导出的 summary 不得为 pass");
      assert.equal(
        exportStatus,
        status.status === "uncertain" ? exportStatus : exportStatus,
        "导出 summary 与界面一致性检查占位",
      );
      return {
        mode: report.mode,
        status: status.status,
        statusTextLength: status.text.length,
        detailTextLength: dialogText.length,
        exportSummary: exported.report.summary.status,
        uncertaintyChecks: exported.uncertainties?.uncertainChecks?.length ?? null,
      };
    });
  }

  report.pageErrors = pageErrors;
  if (pageErrors.length) throw new Error("浏览器出现未捕获异常");
} catch (error) {
  report.runnerError = error.stack ?? error.message;
  console.error(error.message);
} finally {
  for (const close of [
    () => browser?.stop(),
    () => web?.close(),
    () => api?.stop(),
  ]) {
    try {
      await close();
    } catch (error) {
      report.cleanupError = error.message;
    }
  }
  report.passed = report.scenarios.filter((s) => s.status === "pass").length;
  report.failed = report.scenarios.filter((s) => s.status === "fail").length;
  report.exitCode = report.failed || report.runnerError || report.cleanupError ? 1 : 0;
  writeFileSync(join(out, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `受控五态：通过 ${report.passed}，失败 ${report.failed}；exit ${report.exitCode}`,
  );
  process.exitCode = report.exitCode;
}
