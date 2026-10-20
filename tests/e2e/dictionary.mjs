import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
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
  const { cdp, evaluate, click: browserClick, key } = browser;
  const click = async (selector) => {
    await waitFor(() => evaluate("!document.documentElement.dataset.journey"));
    await browserClick(selector);
    if (selector.includes("aria-controls"))
      await waitFor(() =>
        evaluate("!document.documentElement.dataset.journey"),
      );
  };
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
    const previousDocument = await evaluate("performance.timeOrigin");
    await cdp.send("Page.reload");
    await waitFor(() =>
      evaluate(
        `performance.timeOrigin !== ${previousDocument} && !!document.querySelector('.pc-places')`,
      ),
    );
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
  await scenario(
    "mobile-result-reveal-and-return-without-focus-theft",
    async () => {
      await viewport(375);
      await input(".pc-dictionary__input", "月");
      await click(".pc-dictionary__searchline button");
      await glyph("月");
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-dictionary__folio').getBoundingClientRect().top < innerHeight / 2",
        ),
      );
      await screenshot("dictionary-mobile-auto-result.png");
      await click(".pc-dictionary__return");
      await waitFor(() =>
        evaluate(
          "document.activeElement === document.querySelector('.pc-dictionary__input') && document.activeElement.getBoundingClientRect().top >= 0 && document.activeElement.getBoundingClientRect().top < innerHeight",
        ),
      );
      const widths = [];
      for (const width of [320, 375, 640]) {
        await viewport(width);
        const sizes = await evaluate(
          "({width:innerWidth,scroll:document.documentElement.scrollWidth})",
        );
        assert.ok(sizes.scroll <= sizes.width + 1, JSON.stringify(sizes));
        widths.push(sizes);
      }
      await viewport(1440);
      return { automaticReveal: true, returnFocus: true, widths };
    },
  );
  await scenario(
    "ime-confirmation-does-not-submit-unfinished-character",
    async () => {
      const previousGlyph = await evaluate(
        "document.querySelector('.pc-dictionary__glyph')?.textContent ?? null",
      );
      await evaluate(`(() => {
        window.__imeFetch = window.fetch;
        window.__imeQueries = 0;
        window.fetch = (...args) => {
          if (String(args[0]).includes('/characters/')) window.__imeQueries++;
          return window.__imeFetch(...args);
        };
      })()`);
      await input(".pc-dictionary__input", "山");
      const prevented = await evaluate(`(() => {
      const el = document.querySelector('.pc-dictionary__input');
      el.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true}));
      const enter = new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:229, isComposing:true, bubbles:true, cancelable:true});
      el.dispatchEvent(enter);
      el.form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
      el.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true,data:'山'}));
      return enter.defaultPrevented;
    })()`);
      assert.equal(prevented, true);
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-dictionary__glyph')?.textContent ?? null",
        ),
        previousGlyph,
      );
      assert.equal(await evaluate("window.__imeQueries"), 0);
      await key("Enter", "Enter", 13, 0, "\r");
      await glyph("山");
      assert.equal(await evaluate("window.__imeQueries"), 1);
      await evaluate("window.fetch = window.__imeFetch");
      return { compositionEnterPrevented: true, explicitEnterQueries: true };
    },
  );
  await scenario(
    "clipboard-keeps-review-status-version-and-current-link",
    async () => {
      await cdp.send("Browser.grantPermissions", {
        origin: report.url.slice(0, -1),
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      });
      await click(".pc-dictionary__actions button:nth-child(2)");
      const text = await evaluate("navigator.clipboard.readText()");
      assert.match(text, /山 · 平水韵/);
      assert.match(text, /归部已核|待核/);
      assert.match(text, /数据版本：/);
      assert.match(text, /不替代诗中读音选择/);
      await click(".pc-dictionary__actions button:nth-child(3)");
      const link = new URL(await evaluate("navigator.clipboard.readText()"));
      const params = new URLSearchParams(link.hash.split("?")[1]);
      assert.equal(params.get("char"), "山");
      assert.equal(params.get("book"), "pingshui");
      return {
        realClipboard: true,
        reviewedStatusIncluded: true,
        versionIncluded: true,
        link: link.hash,
      };
    },
  );
  await scenario(
    "full-favorites-survive-reload-without-silent-eviction",
    async () => {
      const favorites = [
        ..."甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥乾坤",
      ].map((character) => ({ character, book: "pingshui" }));
      await evaluate(
        `localStorage.setItem('pc-dictionary-shelf-v1', JSON.stringify({recent:[],favorites:${JSON.stringify(favorites)}}))`,
      );
      await cdp.send("Page.reload");
      await waitFor(() =>
        evaluate("!!document.querySelector('.pc-dictionary__input')"),
      );
      await input(".pc-dictionary__input", "月");
      await click(".pc-dictionary__searchline button");
      await glyph("月");
      await click(".pc-dictionary__actions button");
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-dictionary__feedback')?.textContent.includes('已收满 24')",
        ),
      );
      assert.deepEqual(
        await evaluate(
          "JSON.parse(localStorage.getItem('pc-dictionary-shelf-v1')).favorites",
        ),
        favorites,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-dictionary__actions button').getAttribute('aria-pressed')",
        ),
        "false",
      );
      return {
        existingFavorites: 24,
        allPreserved: true,
        capacityMessage: true,
      };
    },
  );
  await scenario(
    "portable-shelf-file-export-import-and-invalid-file-protection",
    async () => {
      await click(".pc-dictionary__shelf summary");
      await waitFor(() =>
        evaluate(
          "getComputedStyle(document.querySelector('.pc-dictionary__shelf'),'::details-content').opacity === '1'",
        ),
      );
      const downloads = join(out, "shelf-downloads");
      mkdirSync(downloads, { recursive: true });
      await cdp.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloads,
        eventsEnabled: true,
      });
      await click(".pc-dictionary__shelf-tools button");
      const file = join(downloads, "藏韵阁-我的字笺.json");
      await waitFor(() => {
        try {
          return JSON.parse(readFileSync(file, "utf8")).favorites.length === 24;
        } catch {
          return false;
        }
      });
      const exported = JSON.parse(readFileSync(file, "utf8"));
      assert.deepEqual(Object.keys(exported).sort(), [
        "favorites",
        "kind",
        "version",
      ]);
      await evaluate(
        "localStorage.setItem('pc-dictionary-shelf-v1', JSON.stringify({recent:[{character:'月',book:'cilin'}],favorites:[]}))",
      );
      await cdp.send("Page.reload");
      await waitFor(() =>
        evaluate("!!document.querySelector('.pc-dictionary__shelf')"),
      );
      await click(".pc-dictionary__shelf summary");
      const chooseFile = async (path) => {
        const doc = await cdp.send("DOM.getDocument");
        const inputNode = await cdp.send("DOM.querySelector", {
          nodeId: doc.root.nodeId,
          selector: ".pc-dictionary__shelf input[type=file]",
        });
        await cdp.send("DOM.setFileInputFiles", {
          nodeId: inputNode.nodeId,
          files: [path],
        });
      };
      await chooseFile(file);
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-dictionary__shelf-feedback')?.textContent.includes('已导入 24')",
        ),
      );
      const saved = await evaluate(
        "JSON.parse(localStorage.getItem('pc-dictionary-shelf-v1'))",
      );
      assert.deepEqual(saved.favorites, exported.favorites);
      assert.deepEqual(saved.recent, [{ character: "月", book: "cilin" }]);
      const invalid = join(out, "invalid-shelf-test.json");
      writeFileSync(
        invalid,
        JSON.stringify({
          kind: "poetry-dictionary-shelf",
          version: 2,
          favorites: [],
        }),
      );
      await chooseFile(invalid);
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-dictionary__shelf-feedback')?.textContent.includes('格式或版本不符')",
        ),
      );
      assert.deepEqual(
        await evaluate(
          "JSON.parse(localStorage.getItem('pc-dictionary-shelf-v1'))",
        ),
        saved,
      );
      return {
        realDownload: true,
        realFileImport: true,
        restoredFavorites: 24,
        historyPreserved: true,
        invalidFileRejected: true,
      };
    },
  );
  await scenario(
    "analysis-real-30-second-timeout-blocks-copy-export-and-recovers",
    async () => {
      await click('[aria-controls="checker-space"]');
      await click(".pc-examples__item");
      const originalText = await evaluate(
        "document.querySelector('.pc-input__text').value",
      );
      await click(".pc-input__submit");
      await waitFor(() =>
        evaluate("!!document.querySelector('.pc-status--pass')"),
      );
      if (
        await evaluate(
          "document.querySelector('.pc-plinth__toggle')?.getAttribute('aria-expanded') === 'false'",
        )
      )
        await click(".pc-plinth__toggle");
      await waitFor(() =>
        evaluate("!document.querySelector('#pc-editor-body').inert"),
      );
      const sentinel = "analysis-timeout-must-not-copy-old-report";
      await evaluate(
        `navigator.clipboard.writeText(${JSON.stringify(sentinel)})`,
      );
      const downloads = join(out, "timeout-downloads");
      mkdirSync(downloads, { recursive: true });
      await cdp.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloads,
        eventsEnabled: true,
      });
      interception = "hold";
      paused.length = 0;
      await cdp.send("Fetch.enable", {
        patterns: [{ urlPattern: "*/api/v1/analyze", requestStage: "Request" }],
      });
      const started = Date.now();
      await click(".pc-input__submit");
      await waitFor(
        () =>
          paused.length > 0 &&
          evaluate(
            "document.querySelector('.pc-input__submit').disabled && document.querySelector('.pc-input__submit').textContent.includes('分析中')",
          ),
      );
      const action = async (text) => {
        assert(
          await evaluate(
            `(() => {const b=[...document.querySelectorAll('#checker-space button')].find(el => el.textContent.includes(${JSON.stringify(text)})); if(!b)return false; b.focus();return true;})()`,
          ),
        );
        await key("Enter", "Enter", 13, 0, "\r");
      };
      for (const text of ["复制摘要", "下载报告"]) await action(text);
      assert.equal(await evaluate("navigator.clipboard.readText()"), sentinel);
      assert.deepEqual(readdirSync(downloads), []);
      await waitFor(
        () =>
          evaluate(
            "document.querySelector('#checker-space [role=alert]')?.textContent.includes('30 秒')",
          ),
        33000,
      );
      const elapsedMs = Date.now() - started;
      assert.ok(elapsedMs >= 29500 && elapsedMs < 34000, String(elapsedMs));
      assert.equal(
        await evaluate("document.querySelector('.pc-input__submit').disabled"),
        false,
      );
      assert.equal(
        await evaluate("document.querySelector('.pc-input__text').value"),
        originalText,
      );
      for (const text of ["复制摘要", "下载报告"]) await action(text);
      assert.equal(await evaluate("navigator.clipboard.readText()"), sentinel);
      assert.deepEqual(readdirSync(downloads), []);
      await cdp.send("Fetch.disable");
      await click(".pc-input__submit");
      await waitFor(() =>
        evaluate(
          "!document.querySelector('#checker-space [role=alert]') && !!document.querySelector('.pc-status--pass') && !document.querySelector('.pc-report--stale')",
        ),
      );
      await action("复制摘要");
      await waitFor(
        async () =>
          (await evaluate("navigator.clipboard.readText()")) !== sentinel,
      );
      return {
        mode: "controlled-hang-real-clock",
        elapsedMs,
        busyButtonDisabled: true,
        clipboardAndDownloadBlockedDuringBusyAndAfterTimeout: true,
        inputRetained: true,
        retry: "real-api",
        copyRestored: true,
      };
    },
  );
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
