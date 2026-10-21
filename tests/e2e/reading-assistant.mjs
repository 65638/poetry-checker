import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseText } from "../../packages/readings/dist/index.js";
import {
  startHarness,
  waitFor,
  sleep,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";
import { POEMS } from "../integration/e2e/d3-acceptance-api.mjs";

const out = resolve(process.argv[2] ?? "artifacts/reading-assistant");
mkdirSync(out, { recursive: true });
const h = await startHarness({ production: true });
const { cdp, evaluate, click } = h;
const results = {
  revision: revision(),
  mode: "controlled-assistant-responses-with-real-analysis-and-lookup",
  checks: [],
  errors: [],
  realModelInference: false,
};
let configured = false;
let nextMode = "success";
let paused;
let posts = 0;
const lookup = await (
  await fetch(`${h.url}api/v1/characters/更?book=pingshui`)
).json();
const candidate = lookup.entries[0].candidates.find(
  (item) => item.toneClass === "qu",
);
const choice = (input) => {
  const poem = parseText({ text: input.text });
  return {
    provider: "deepseek",
    model: "deepseek-flash",
    inputHash: createHash("sha256").update(input.text).digest("hex"),
    rhymeBook: input.rhymeBook,
    dataVersion: lookup.dataVersion,
    suggestions: poem.tokens
      .filter((token) =>
        input.targetTokenIds
          ? input.targetTokenIds.includes(token.tokenId)
          : token.text === "更",
      )
      .map((token) => ({
        tokenId: token.tokenId,
        character: token.text,
        line: token.line,
        column: token.column,
        candidateId: candidate.id,
        pronunciation: "gèng",
        reason: "受控UI测试：表示进一步。",
        candidate,
        groupNames: ["二十四敬"],
        evidenceApproved: false,
      })),
    missingTokenIds: [],
    truncated: false,
    notice: "受控UI测试响应，非真实DeepSeek推理。",
  };
};
const fulfill = (requestId, body, responseCode = 200) =>
  cdp.send("Fetch.fulfillRequest", {
    requestId,
    responseCode,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify(body)).toString("base64"),
  });
cdp.on("Runtime.exceptionThrown", (event) =>
  results.errors.push(event.exceptionDetails.text),
);
cdp.on("Fetch.requestPaused", (event) => {
  void (async () => {
    if (event.request.url.endsWith("/status"))
      return fulfill(event.requestId, {
        configured,
        provider: "deepseek",
        model: "deepseek-flash",
      });
    posts++;
    const input = JSON.parse(event.request.postData);
    if (nextMode === "delay") {
      paused = { id: event.requestId, input };
      nextMode = "success";
      return;
    }
    if (nextMode === "failure") {
      nextMode = "success";
      return fulfill(
        event.requestId,
        {
          error: {
            code: "MODEL_TIMEOUT",
            message: "受控超时，请重试。",
            fieldErrors: [],
          },
        },
        504,
      );
    }
    return fulfill(event.requestId, choice(input));
  })().catch((cause) => results.errors.push(cause.message));
});
await cdp.send("Fetch.enable", {
  patterns: [
    { urlPattern: "*/api/v1/reading-suggestions*", requestStage: "Request" },
  ],
});
const shot = async (name) =>
  writeFileSync(
    join(out, name + ".png"),
    Buffer.from(
      (await cdp.send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
const check = async (name, run) => {
  await run();
  results.checks.push({ name, status: "pass" });
  console.log("[PASS]", name);
};
const fillPassage = (text) =>
  evaluate(
    `(() => { const input = document.querySelector('.pc-dictionary__passage textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
  );
const openPassage = async () => {
  await click(".pc-dictionary__passage summary");
  await waitFor(() =>
    evaluate("!!document.querySelector('.pc-dictionary__passage[open]')"),
  );
  await waitFor(() => evaluate("!!document.querySelector('.pc-dictionary__passage .pc-reading-assistant')"));
};
try {
  await check(
    "unconfigured-is-visible-and-makes-no-inference-request",
    async () => {
      await h.load({ path: "#dictionary", reduce: true });
      await openPassage();
      await fillPassage("更上一层楼。");
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-reading-assistant').textContent.includes('AI尚未配置')",
        ),
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-reading-assistant__request').disabled",
        ),
        true,
      );
      assert.equal(posts, 0);
      await shot("unconfigured");
    },
  );
  await check(
    "dictionary-automatically-analyzes-and-opens-real-character-lookup",
    async () => {
      configured = true;
      await h.load({ path: "#dictionary", reduce: true });
      await openPassage();
      await fillPassage("更上一层楼。");
      await waitFor(() =>
        evaluate(
        "document.querySelector('.pc-reading-assistant__request')?.disabled === false",
        ),
      );
      await waitFor(() =>
        evaluate("!!document.querySelector('.pc-reading-assistant__result')"),
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-reading-assistant__entry').textContent.includes('更')",
        ),
        true,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-reading-assistant').textContent.includes('语境读音参考')",
        ),
        true,
      );
      await shot("dictionary-1440");
      await click(".pc-reading-assistant__result button");
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-dictionary__glyph')?.textContent==='更'",
        ),
      );
    },
  );
  await check(
    "editing-invalidates-results-and-a-delivered-late-response-cannot-replace-new-input",
    async () => {
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(() => { const original = window.fetch.bind(window); window.fetch = (url,init) => String(url).endsWith('/reading-suggestions') ? original(url,{...init,signal:undefined}) : original(url,init); })()`,
      });
      await h.load({ path: "#dictionary", reduce: true });
      await openPassage();
      await fillPassage("更上。");
      await waitFor(() =>
        evaluate("!document.querySelector('.pc-reading-assistant__result')"),
      );
      await waitFor(() => evaluate("document.querySelector('.pc-reading-assistant__request')?.disabled === false"));
      nextMode = "delay";
      await click(".pc-reading-assistant__request");
      await waitFor(() => paused);
      await fillPassage("欲穷千里目，更上一层楼。");
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-reading-assistant__request')?.disabled === false",
        ),
      );
      await click(".pc-reading-assistant__request");
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-reading-assistant__entry')?.textContent.includes('第2句')",
        ),
      );
      await fulfill(paused.id, choice(paused.input));
      paused = null;
      await sleep(250);
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-reading-assistant__entry').textContent.includes('第2句')",
        ),
        true,
      );
    },
  );
  await check(
    "failed-retry-keeps-last-valid-reference-and-recovers",
    async () => {
      nextMode = "failure";
      await click(".pc-reading-assistant__request");
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-reading-assistant [role=alert]')?.textContent.includes('受控超时')",
        ),
      );
      assert.equal(
        await evaluate(
          "!!document.querySelector('.pc-reading-assistant__result')",
        ),
        true,
      );
      await click(".pc-reading-assistant__request");
      await waitFor(() =>
        evaluate(
          "!document.querySelector('.pc-reading-assistant [role=alert]') && !document.querySelector('.pc-reading-assistant__request').disabled",
        ),
      );
    },
  );
  await check("mobile-results-and-controls-fit-at-375-and-320", async () => {
    for (const width of [375, 320]) {
      await h.viewport(width, 900, true);
      await evaluate(
        "document.querySelector('.pc-reading-assistant').scrollIntoView({block:'center',behavior:'instant'})",
      );
      await sleep(100);
      assert.equal(
        await evaluate(
          "document.documentElement.scrollWidth <= innerWidth + 1",
        ),
        true,
      );
      assert.equal(
        await evaluate(
          "[...document.querySelectorAll('.pc-reading-assistant button')].every(button => button.getBoundingClientRect().height >= 44)",
        ),
        true,
      );
      await shot(`dictionary-${width}`);
    }
  });
  await check(
    "real-checker-remains-usable-without-model-configuration-or-confirmation",
    async () => {
      await h.load({ reduce: true });
      await h.setText(POEMS[0].text);
      await h.analyze();
      await click('[data-token-id="l4c1"]');
      await waitFor(() => evaluate("!!document.querySelector('.pc-evidence')"));
      await shot("single-character");
      assert.equal(
        await evaluate("!!document.querySelector('.pc-report')"),
        true,
      );
      assert.equal(await evaluate("document.querySelector('.pc-evidence .pc-reading-assistant') === null"), true);
      assert.equal((await fetch(`${h.url}readyz`)).status, 200);
    },
  );
  assert.deepEqual(results.errors, []);
} catch (cause) {
  results.failed = cause.stack;
  await shot("failure").catch(() => {});
  process.exitCode = 1;
} finally {
  if (paused) await fulfill(paused.id, choice(paused.input)).catch(() => {});
  await h.stop();
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: results.checks.length,
      failed: results.failed,
      errors: results.errors,
    }),
  );
}
