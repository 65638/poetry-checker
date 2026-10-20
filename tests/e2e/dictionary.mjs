import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  REPO_ROOT,
  startApi,
  waitFor,
  revision,
  readiness,
} from "../../scripts/acceptance-runtime.mjs";
import { launchBrowser } from "./cdp.mjs";

const out = resolve(process.argv[2] ?? "artifacts/acceptance/dictionary");
mkdirSync(out, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  revision: revision(),
  mode: "real-api",
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
  const { cdp, evaluate, click, key } = browser;
  report.browser = await cdp.send("Browser.getVersion");
  const errors = [];
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) =>
    errors.push(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    ),
  );
  const viewport = (width) =>
    cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
  const input = async (selector, text) => {
    await click(selector);
    await key("a", "KeyA", 65, 2);
    await cdp.send("Input.insertText", { text });
  };
  const glyph = async (text) =>
    waitFor(() =>
      evaluate(
        `document.querySelector('.pc-dictionary__glyph')?.textContent === ${JSON.stringify(text)}`,
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
  await viewport(1440);
  await cdp.send("Page.navigate", { url: report.url });
  await waitFor(() => evaluate("!!document.querySelector('.pc-input__text')"));
  await scenario("navigation-keeps-draft-and-reloads-locally", async () => {
    const text = "明月松间照，清泉石上流。";
    await input(".pc-input__text", text);
    await click('[aria-controls="dictionary-space"]');
    await waitFor(() =>
      evaluate("!document.querySelector('#dictionary-space').hidden"),
    );
    await click('[aria-controls="checker-space"]');
    await waitFor(() =>
      evaluate("!document.querySelector('#checker-space').hidden"),
    );
    assert.equal(
      await evaluate("document.querySelector('.pc-input__text').value"),
      text,
    );
    await waitFor(() =>
      evaluate(
        "localStorage.getItem('pc-poem-draft-v1')?.includes('明月松间照')",
      ),
    );
    await cdp.send("Page.reload");
    await waitFor(() =>
      evaluate(
        "document.querySelector('.pc-input__text')?.value === '明月松间照，清泉石上流。'",
      ),
    );
    return { textRestored: true };
  });
  await click('[aria-controls="dictionary-space"]');
  await scenario("real-single-character-all-three-books", async () => {
    await input(".pc-dictionary__input", "更");
    await click(".pc-dictionary__searchline button");
    await glyph("更");
    const detail = [];
    for (const book of ["pingshui", "cilin", "xinyun"]) {
      await click(`.pc-dictionary__book input[value="${book}"]`);
      await waitFor(() =>
        evaluate(
          `document.querySelector('.pc-dictionary__version')?.textContent.includes(${JSON.stringify(book === "xinyun" ? "xinyun" : book)}) && document.querySelector('.pc-dictionary__glyph')?.textContent === '更'`,
        ),
      );
      const actual = await (
        await fetch(
          `${api.baseUrl}/api/v1/characters/${encodeURIComponent("更")}?book=${book}`,
        )
      ).json();
      const displayed = await evaluate(
        "[...document.querySelectorAll('.pc-dictionary__candidate')].map(el=>el.innerText)",
      );
      assert.equal(
        displayed.length,
        actual.entries.flatMap((entry) => entry.candidates).length,
      );
      assert.ok(displayed.length >= 2);
      detail.push({
        book,
        candidates: displayed.length,
        dataVersion: actual.dataVersion,
      });
    }
    await click(".pc-dictionary__source summary");
    await waitFor(() =>
      evaluate(
        "document.querySelector('.pc-dictionary__source[open]')?.innerText.includes('定位')",
      ),
    );
    assert.match(
      await evaluate(
        "document.querySelector('.pc-dictionary__source[open]').innerText",
      ),
      /定位/,
    );
    return detail;
  });
  await scenario("favorites-history-and-poem-character-picker", async () => {
    await click(".pc-dictionary__actions button");
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-dictionary__actions button').getAttribute('aria-pressed')",
      ),
      "true",
    );
    await click(".pc-dictionary__passage summary");
    await waitFor(() =>
      evaluate(
        "getComputedStyle(document.querySelector('.pc-dictionary__passage'), '::details-content').opacity === '1'",
      ),
    );
    await click(".pc-dictionary__passage .pc-button");
    await waitFor(() =>
      evaluate(
        "document.querySelectorAll('.pc-dictionary__character-list button').length === 10",
      ),
    );
    await click(".pc-dictionary__character-list button");
    await glyph("明");
    await click(".pc-dictionary__shelf summary");
    const stored = await evaluate(
      "JSON.parse(localStorage.getItem('pc-dictionary-shelf-v1'))",
    );
    assert.ok(
      stored.favorites.some(
        (entry) => entry.character === "更" && entry.book === "xinyun",
      ),
    );
    assert.ok(stored.recent.some((entry) => entry.character === "明"));
    return { favorites: stored.favorites, recent: stored.recent };
  });
  await scenario("invalid-and-missing-characters-stay-distinct", async () => {
    await input(".pc-dictionary__input", "明月");
    await click(".pc-dictionary__searchline button");
    await waitFor(() =>
      evaluate("!!document.querySelector('.pc-dictionary__error')"),
    );
    assert.match(
      await evaluate(
        "document.querySelector('.pc-dictionary__error').innerText",
      ),
      /一个汉字/,
    );
    await input(".pc-dictionary__input", "𠀀");
    await click(".pc-dictionary__searchline button");
    await glyph("𠀀");
    await click('.pc-dictionary__book input[value="cilin"]');
    await input(".pc-dictionary__input", "余");
    await click(".pc-dictionary__searchline button");
    await glyph("余");
    assert.match(
      await evaluate(
        "document.querySelector('.pc-dictionary__entry').innerText",
      ),
      /本书未收录/,
    );
    return { supplementaryCodePointAccepted: true, notFoundNotError: true };
  });
  await scenario("deep-link-reloads-current-data", async () => {
    await cdp.send("Page.navigate", {
      url: report.url + "#dictionary?char=%E6%9C%88&book=pingshui",
    });
    await glyph("月");
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-dictionary__book input:checked').value",
      ),
      "pingshui",
    );
    assert.equal(
      await evaluate("document.querySelector('#checker-space').hidden"),
      true,
    );
    return { linkedCharacter: "月", book: "pingshui" };
  });
  await scenario("responsive-layout-1440-768-375", async () => {
    const widths = [];
    for (const width of [1440, 768, 375]) {
      await viewport(width);
      await evaluate("window.scrollTo(0,0)");
      await new Promise((resolve) => setTimeout(resolve, 750));
      const sizes = await evaluate(
        "({width:innerWidth,scroll:document.documentElement.scrollWidth})",
      );
      assert.ok(sizes.scroll <= sizes.width + 1, JSON.stringify(sizes));
      await screenshot(`dictionary-${width}.png`);
      if (width === 375) {
        await evaluate(
          "document.querySelector('.pc-dictionary__folio').scrollIntoView({block:'start'})",
        );
        await screenshot("dictionary-375-result.png");
      }
      widths.push(sizes);
    }
    return widths;
  });
  await scenario("three-book-comparison-and-passage-overview", async () => {
    await viewport(1440);
    await click(".pc-dictionary__compare-button");
    await waitFor(() =>
      evaluate(
        "document.querySelectorAll('.pc-dictionary__comparison-row').length === 3",
      ),
    );
    assert.match(
      await evaluate(
        "document.querySelector('.pc-dictionary__comparison').innerText",
      ),
      /平水韵/,
    );
    assert.match(
      await evaluate(
        "document.querySelector('.pc-dictionary__comparison').innerText",
      ),
      /待核/,
    );
    if (
      !(await evaluate(
        "document.querySelector('.pc-dictionary__passage').open",
      ))
    )
      await click(".pc-dictionary__passage summary");
    await waitFor(() =>
      evaluate(
        "getComputedStyle(document.querySelector('.pc-dictionary__passage'),'::details-content').opacity === '1'",
      ),
    );
    await click(".pc-dictionary__lookup-passage");
    await waitFor(() =>
      evaluate(
        "document.querySelectorAll('.pc-dictionary__overview-grid button').length === 10",
      ),
    );
    const cells = await evaluate(
      "[...document.querySelectorAll('.pc-dictionary__overview-grid button')].map(el=>({character:el.querySelector('span').textContent,status:el.dataset.status}))",
    );
    for (const cell of cells) {
      const actual = await (
        await fetch(
          `${api.baseUrl}/api/v1/characters/${encodeURIComponent(cell.character)}?book=pingshui`,
        )
      ).json();
      const candidates = actual.entries.flatMap((entry) => entry.candidates);
      const status = !candidates.length
        ? "missing"
        : candidates.every((c) =>
              c.evidenceIds.some((id) =>
                actual.evidence.some(
                  (e) => e.id === id && e.reviewStatus === "approved",
                ),
              ),
            )
          ? "backed"
          : "needs_review";
      assert.equal(cell.status, status);
    }
    return { comparedBooks: 3, cells };
  });
  const paused = [];
  let interception = "hold";
  cdp.on("Fetch.requestPaused", (event) => {
    if (interception === "hold") paused.push(event);
    else if (interception === "503")
      void cdp
        .send("Fetch.fulfillRequest", {
          requestId: event.requestId,
          responseCode: 503,
          responseHeaders: [
            { name: "content-type", value: "application/json" },
          ],
          body: Buffer.from(
            JSON.stringify({
              error: {
                code: "DATA_NOT_READY",
                message: "受控503测试：数据暂不可用",
                fieldErrors: [],
              },
            }),
          ).toString("base64"),
        })
        .catch(() => {});
    else
      void cdp
        .send("Fetch.continueRequest", { requestId: event.requestId })
        .catch(() => {});
  });
  await scenario("latest-query-wins-when-old-request-is-delayed", async () => {
    interception = "hold";
    paused.length = 0;
    await cdp.send("Fetch.enable", {
      patterns: [
        { urlPattern: "*/api/v1/characters/*", requestStage: "Request" },
      ],
    });
    await input(".pc-dictionary__input", "白");
    await click(".pc-dictionary__searchline button");
    await waitFor(() => paused.length);
    const old = paused[0];
    interception = "continue";
    await input(".pc-dictionary__input", "山");
    await click(".pc-dictionary__searchline button");
    await glyph("山");
    let oldCompletion = "released-late";
    try {
      await cdp.send("Fetch.continueRequest", { requestId: old.requestId });
    } catch {
      oldCompletion = "aborted-by-app";
    }
    await cdp.send("Fetch.disable");
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-dictionary__glyph').textContent",
      ),
      "山",
    );
    return { mode: "controlled-delay", oldCompletion, latest: "山" };
  });
  await scenario("server-failure-clears-result-and-recovers", async () => {
    interception = "503";
    await cdp.send("Fetch.enable", {
      patterns: [
        { urlPattern: "*/api/v1/characters/*", requestStage: "Request" },
      ],
    });
    await input(".pc-dictionary__input", "白");
    await click(".pc-dictionary__searchline button");
    await waitFor(() =>
      evaluate(
        "document.querySelector('.pc-dictionary__error')?.innerText.includes('受控503')",
      ),
    );
    assert.equal(
      await evaluate("!!document.querySelector('.pc-dictionary__glyph')"),
      false,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-dictionary__searchline button').disabled",
      ),
      false,
    );
    await cdp.send("Fetch.disable");
    await click(".pc-dictionary__error button");
    await glyph("白");
    return {
      mode: "controlled-http-503",
      staleResultHidden: true,
      recovery: "real-api",
    };
  });
  await scenario("real-15-second-client-timeout-and-retry", async () => {
    interception = "hold";
    paused.length = 0;
    await cdp.send("Fetch.enable", {
      patterns: [
        { urlPattern: "*/api/v1/characters/*", requestStage: "Request" },
      ],
    });
    await input(".pc-dictionary__input", "月");
    const started = Date.now();
    await click(".pc-dictionary__searchline button");
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.pc-dictionary__error')?.innerText.includes('等候较久')",
        ),
      18000,
    );
    const elapsedMs = Date.now() - started;
    assert.ok(elapsedMs >= 14500);
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-dictionary__searchline button').disabled",
      ),
      false,
    );
    await cdp.send("Fetch.disable");
    await click(".pc-dictionary__error button");
    await glyph("月");
    return {
      mode: "controlled-hang-real-clock",
      elapsedMs,
      recovery: "real-api",
    };
  });
  await scenario(
    "hidden-checker-pauses-canvas-and-preserves-report",
    async () => {
      await waitFor(() =>
        evaluate(
          "document.querySelector('#checker-space .pc-rain')?.dataset.running === 'false'",
        ),
      );
      await click('[aria-controls="checker-space"]');
      await click(".pc-examples__item");
      await click(".pc-input__submit");
      await waitFor(() =>
        evaluate("!!document.querySelector('[data-token-id]')"),
      );
      const reportText = await evaluate(
        "document.querySelector('.pc-manuscript').innerText",
      );
      await click('[aria-controls="dictionary-space"]');
      await waitFor(() =>
        evaluate(
          "document.querySelector('#checker-space .pc-rain')?.dataset.running === 'false'",
        ),
      );
      await click('[aria-controls="checker-space"]');
      assert.equal(
        await evaluate("document.querySelector('.pc-manuscript').innerText"),
        reportText,
      );
      await click(".pc-explore-current button");
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-dictionary__passage').open && document.querySelector('.pc-dictionary__passage textarea').value.includes('白日依山尽')",
        ),
      );
      return { canvasPaused: true, reportPreserved: true, poemImported: true };
    },
  );
  await scenario("keyboard-navigation-and-reduced-motion", async () => {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await click('[aria-controls="checker-space"]');
    await click('[aria-controls="dictionary-space"]');
    await waitFor(() =>
      evaluate(
        "document.querySelector('.pc-workspace').dataset.motion === 'off'",
      ),
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-dictionary__page')).animationName",
      ),
      "none",
    );
    await evaluate("document.querySelector('.pc-dictionary__input').focus()");
    await key("a", "KeyA", 65, 2);
    await cdp.send("Input.insertText", { text: "山" });
    await key("Enter", "Enter", 13, 0, "\r");
    await glyph("山");
    const active = await evaluate("document.activeElement.className");
    assert.equal(active, "pc-dictionary__input");
    return { reducedMotion: true, keyboardSearch: true };
  });
  assert.deepEqual(errors, []);
  report.pageErrors = errors;
} catch (error) {
  report.fatalError = error.stack;
} finally {
  await browser?.stop();
  await web?.close();
  await api?.stop();
  report.completedAt = new Date().toISOString();
  writeFileSync(
    join(out, "browser.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
const failed =
  report.fatalError || report.scenarios.some((s) => s.status !== "pass");
if (failed) process.exitCode = 1;
