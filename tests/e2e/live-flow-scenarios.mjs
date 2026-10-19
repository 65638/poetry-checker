import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { waitFor } from "../../scripts/acceptance-runtime.mjs";
import { AnalysisResponseSchema } from "@poetry/contracts";
import { POEMS, checkCell } from "../integration/e2e/d3-acceptance-api.mjs";
import { assertReportExport, assertSummaryExport } from "./export-checks.mjs";

/** UI actions only: state and requests are observed, never injected into the store. */
export async function runLiveFlowScenarios({
  browser,
  payload,
  options,
  responses,
  complete,
  scenario,
}) {
  const { cdp, evaluate, click, key } = browser;
  async function fresh() {
    await cdp.send("Network.setBlockedURLs", { urls: [] });
    await cdp.send("Page.navigate", { url: payload.url });
    await waitFor(() =>
      evaluate("Boolean(document.querySelector('.pc-input__text'))"),
    );
    await click(".pc-segmented__option:has(input[value=pingshui])");
  }
  async function fill(text) {
    await click(".pc-input__text");
    await key("a", "KeyA", 65, 2);
    await cdp.send("Input.insertText", { text });
  }
  async function button(label, selector = "button") {
    const found = await evaluate(
      `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.trim().includes(${JSON.stringify(label)})); if (!b || b.disabled) return false; b.focus(); return document.activeElement === b; })()`,
    );
    assert(found, `找不到可操作按钮：${label}`);
    await key("Enter", "Enter", 13, 0, "\r");
  }
  async function responseAfter(before) {
    await waitFor(
      () =>
        responses.length > before && complete.has(responses.at(-1).requestId),
    );
    const res = responses.at(-1);
    const raw = await cdp.send("Network.getResponseBody", {
      requestId: res.requestId,
    });
    const body = JSON.parse(
      raw.base64Encoded ? Buffer.from(raw.body, "base64").toString() : raw.body,
    );
    const { postData } = await cdp.send("Network.getRequestPostData", {
      requestId: res.requestId,
    });
    await waitFor(() =>
      evaluate("!document.querySelector('.pc-input__submit').disabled"),
    );
    return { status: res.response.status, body, request: JSON.parse(postData) };
  }
  async function submit() {
    const before = responses.length;
    await click(".pc-input__submit");
    return responseAfter(before);
  }
  async function success() {
    await fresh();
    await fill(POEMS[0].text);
    const res = await submit();
    assert.equal(res.status, 200);
    AnalysisResponseSchema.parse(res.body);
    await waitFor(() =>
      evaluate("Boolean(document.querySelector('.pc-report'))"),
    );
    return res;
  }
  async function choose() {
    await click('[data-token-id="l4c1"]');
    await waitFor(() =>
      evaluate("Boolean(document.querySelector('[role=dialog]'))"),
    );
    const before = responses.length;
    await button("改用此读音", ".pc-candidate button");
    const res = await responseAfter(before);
    assert.equal(res.status, 200);
    AnalysisResponseSchema.parse(res.body);
    const token = res.body.poem.tokens.find((t) => t.tokenId === "l4c1");
    assert.equal(token.text, "更");
    assert.equal(token.selectionMethod, "user");
    assert.equal(token.selectedReadingId, "pingshui:更:ping:八庚");
    assert.deepEqual(res.request.readingOverrides, [
      { tokenId: "l4c1", readingId: token.selectedReadingId },
    ]);
    await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"));
    return res;
  }
  async function downloadDir(prefix) {
    const dir = mkdtempSync(join(options.out, prefix));
    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: dir,
      eventsEnabled: true,
    });
    return dir;
  }
  async function exportMatches(res) {
    await cdp.send("Browser.grantPermissions", {
      origin: new URL(payload.url).origin,
      permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
    });
    await cdp.send("Page.bringToFront");
    await evaluate("navigator.clipboard.writeText('before-selected-copy')");
    await button("复制摘要");
    await waitFor(() =>
      evaluate(
        "document.querySelector('.pc-feedback')?.textContent.includes('摘要已复制')",
      ),
    );
    assertSummaryExport(
      await evaluate("navigator.clipboard.readText()"),
      res.body,
      res.request,
    );
    const dir = await downloadDir("selected-report-");
    await button("下载报告");
    await waitFor(() => readdirSync(dir).some((n) => n.endsWith(".json")));
    const file = readdirSync(dir).find((n) => n.endsWith(".json"));
    assertReportExport(
      JSON.parse(readFileSync(join(dir, file), "utf8")),
      res.body,
      res.request,
    );
    return { dir, file };
  }

  for (const poem of POEMS) {
    await scenario(`E04-example-flow-${poem.id}`, async () => {
      await fresh();
      // Switching books before loading proves example buttons do not silently reset it.
      await click(".pc-segmented__option:has(input[value=xinyun])");
      await button(poem.title, ".pc-examples__item");
      assert.equal(
        await evaluate("document.querySelector('.pc-input__text').value"),
        poem.text,
      );
      assert.equal(
        await evaluate("document.querySelector('input[value=xinyun]').checked"),
        true,
      );
      await click(".pc-segmented__option:has(input[value=pingshui])");
      const res = await submit();
      assert.equal(
        checkCell(poem, "pingshui", res).ok,
        true,
        JSON.stringify(res.body.error),
      );
      assert.equal(res.request.text, poem.text);
      assert.equal(res.request.genreHint, "auto");
      assert.equal(res.request.formHint, "auto");
      assert.deepEqual(res.request.readingOverrides, []);
      await waitFor(() =>
        evaluate(
          `document.querySelectorAll('[data-token-id]').length === ${res.body.poem.tokens.length}`,
        ),
      );
      if (poem.id === "huanghelou") {
        assert.equal(res.body.summary.status, "fail");
        for (const tag of res.body.genre.historicalTags) {
          assert(
            await evaluate(
              `document.querySelector('.pc-historical-tags')?.textContent.includes(${JSON.stringify(tag)})`,
            ),
          );
        }
      }
      return {
        preservedBookOnLoad: "xinyun",
        submittedBook: res.request.rhymeBook,
        http: res.status,
        summary: res.body.summary.status,
        historicalTags: res.body.genre.historicalTags,
      };
    });
  }
  await scenario("E05-select-recheck-export-and-clear-overrides", async () => {
    const original = await success();
    const selected = await choose();
    assert.equal(selected.request.inputHash, original.body.inputHash);
    const exported = await exportMatches(selected);
    // Edit actual text; the next request must clear overrides and recompute its hash.
    await fill(POEMS[0].text + "\n");
    assert(
      await evaluate("Boolean(document.querySelector('.pc-report--stale'))"),
    );
    const edited = await submit();
    assert.equal(edited.status, 200);
    assert.deepEqual(edited.request.readingOverrides, []);
    assert.equal(
      edited.request.inputHash,
      createHash("sha256").update(edited.request.text).digest("hex"),
    );
    assert.notEqual(edited.request.inputHash, original.body.inputHash);
    await choose();
    await click(".pc-segmented__option:has(input[value=cilin])");
    const otherBook = await submit();
    assert.equal(otherBook.status, 503);
    assert.equal(otherBook.body.error.code, "DATA_NOT_READY");
    assert.deepEqual(otherBook.request.readingOverrides, []);
    assert.equal(otherBook.request.inputHash, edited.request.inputHash);
    await click(".pc-segmented__option:has(input[value=pingshui])");
    const restored = await submit();
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.request.readingOverrides, []);
    assert.equal(
      restored.body.poem.tokens.find((t) => t.tokenId === "l4c1")
        .selectionMethod,
      "context_rule",
    );
    return {
      selectedCandidate: selected.request.readingOverrides[0],
      selectedExport: exported,
      textEditClearsOverrides: true,
      bookSwitchClearsOverrides: true,
      cilinRemains503: true,
      restoredContextSelection: true,
    };
  });
  await scenario("E07-controlled-network-failure", async () => {
    await success();
    try {
      await cdp.send("Network.setBlockedURLs", { urls: ["*/api/v1/analyze"] });
      await click(".pc-input__submit");
      await waitFor(() =>
        evaluate(
          "document.querySelector('[role=alert]')?.textContent.includes('NETWORK_ERROR')",
        ),
      );
      assert.equal(
        await evaluate("document.querySelector('.pc-input__submit').disabled"),
        false,
      );
      assert.equal(
        await evaluate("document.querySelector('.pc-input__text').value"),
        POEMS[0].text,
      );
    } finally {
      await cdp.send("Network.setBlockedURLs", { urls: [] });
    }
    const recovered = await submit();
    assert.equal(recovered.status, 200);
    await waitFor(() => evaluate("!document.querySelector('[role=alert]')"));
    return {
      faultInjection: "CDP Network.setBlockedURLs",
      inputPreserved: true,
      recoveredStatus: 200,
    };
  });
  await scenario("E06-busy-and-failure-block-copy-export", async () => {
    await success();
    const dir = await downloadDir("blocked-export-");
    const paused = [];
    let active = true;
    cdp.on("Fetch.requestPaused", (e) => {
      if (active) paused.push(e);
    });
    await cdp.send("Browser.grantPermissions", {
      origin: new URL(payload.url).origin,
      permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
    });
    await cdp.send("Page.bringToFront");
    async function assertBlocked(phrase, stage) {
      const sentinel = `${stage}-must-not-copy-${Date.now()}`;
      await evaluate(
        `navigator.clipboard.writeText(${JSON.stringify(sentinel)})`,
      );
      await button("复制摘要");
      await waitFor(() =>
        evaluate(
          `document.querySelector('.pc-feedback')?.textContent.includes(${JSON.stringify(phrase)})`,
        ),
      );
      assert.equal(await evaluate("navigator.clipboard.readText()"), sentinel);
      await button("下载报告");
      await waitFor(() =>
        evaluate(
          `document.querySelector('.pc-feedback')?.textContent.includes(${JSON.stringify(phrase)})`,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.deepEqual(
        readdirSync(dir),
        [],
        `${stage} 不得生成文件（含临时文件）`,
      );
    }
    try {
      await cdp.send("Fetch.enable", {
        patterns: [{ urlPattern: "*/api/v1/analyze", requestStage: "Request" }],
      });
      await click(".pc-input__submit");
      await waitFor(() => paused.length > 0);
      assert.equal(
        await evaluate("document.querySelector('.pc-input__submit').disabled"),
        true,
      );
      await assertBlocked("正在重新分析", "busy");
      await cdp.send("Fetch.failRequest", {
        requestId: paused[0].requestId,
        errorReason: "Failed",
      });
      await waitFor(() =>
        evaluate(
          "document.querySelector('[role=alert]')?.textContent.includes('NETWORK_ERROR')",
        ),
      );
      await assertBlocked("已阻止", "failed");
    } finally {
      active = false;
      await cdp.send("Fetch.disable");
    }
    const recovered = await submit();
    assert.equal(recovered.status, 200);
    const exported = await exportMatches(recovered);
    return {
      faultInjection: "CDP Fetch hold then failRequest",
      busyBlocksCopyAndExport: true,
      failureBlocksCopyAndExport: true,
      recoveryExport: exported,
    };
  });
}
