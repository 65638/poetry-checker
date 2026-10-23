import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildApp } from "../../apps/api/src/server.ts";
import {
  startHarness,
  waitFor,
  sleep,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";

const out = resolve(process.argv[2] ?? "artifacts/research-reference");
mkdirSync(out, { recursive: true });
let analysisCalls = 0,
  researchCalls = 0;
const app = buildApp({ readingAssistant: { apiKey: "" } });
app.addHook("onRequest", async (request) => {
  if (request.url === "/api/v1/analyze") analysisCalls++;
  if (request.url === "/api/v1/research") researchCalls++;
});
const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
const h = await startHarness({
  production: true,
  api: { baseUrl, stop: () => app.close() },
});
const result = {
  revision: revision(),
  mode: "real-local-api-no-external-model",
  checks: [],
  errors: [],
};
h.cdp.on("Runtime.exceptionThrown", (e) =>
  result.errors.push(
    e.exceptionDetails.exception?.description ?? e.exceptionDetails.text,
  ),
);
const check = async (name, run) => {
  await run();
  result.checks.push(name);
  console.log("[PASS]", name);
};
const shot = async (name) =>
  writeFileSync(
    join(out, name + ".png"),
    Buffer.from(
      (await h.cdp.send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
try {
  await check(
    "report-reference-defaults-collapsed-and-retains-plain-share",
    async () => {
      await h.load({ reduce: true });
      await h.setText("空山不见人，但闻人语响。返景入深林，复照青苔上。");
      await h.analyze();
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-report .pc-research').open",
        ),
        false,
      );
      assert(
        (
          await h.evaluate(
            "document.querySelector('.pc-report .pc-research > summary').innerText",
          )
        ).includes("条参考"),
      );
      assert.equal(researchCalls, 0);
      await h.evaluate(
        "navigator.clipboard.writeText = async text => {window.__researchShare=text;}; true",
      );
      await h.click(".pc-status__actions button");
      await waitFor(() =>
        h.evaluate("typeof window.__researchShare==='string'"),
      );
      const text = await h.evaluate("window.__researchShare");
      assert(
        !/source_attested|sourceId|hanOffset|请求快照|collected-v1/.test(text),
      );
    },
  );
  await check(
    "keyboard-opens-conflicts-with-source-scope-and-original-glyphs",
    async () => {
      await h.evaluate(
        "document.querySelector('.pc-report .pc-research > summary').focus(); true",
      );
      await h.key("Enter", "Enter", 13, 0, "\r");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-report .pc-research').innerText.includes('fǎn yǐng')",
        ),
      );
      const body = await h.evaluate(
        "document.querySelector('.pc-report .pc-research').innerText",
      );
      assert(body.includes("fǎn yǐng") && body.includes("fǎn jǐng"));
      assert(body.includes("来源有分歧") && body.includes("关联字形版本"));
      assert(body.includes("标题「柴」"));
      await h.click(".pc-report .pc-research article details summary");
      const quote = await h.evaluate(
        "document.querySelector('.pc-report .pc-research article details').innerText",
      );
      assert(quote.includes("底本：返景"));
      assert.equal(
        await h.evaluate(
          "document.querySelectorAll('.pc-report .pc-research a[href^=https]').length>0",
        ),
        true,
      );
    },
  );
  await check(
    "reference-browsing-does-not-trigger-analysis-or-model",
    async () => {
      const count = analysisCalls;
      await h.evaluate(
        "document.querySelector('.pc-report .pc-research').querySelectorAll('details').forEach(d=>d.open=true); true",
      );
      await sleep(1800);
      assert.equal(analysisCalls, count);
      assert.equal(researchCalls, 0);
    },
  );
  await check(
    "all-expanded-reference-content-fits-desktop-and-mobile",
    async () => {
      for (const width of [1440, 768, 375, 320]) {
        await h.viewport(width, 900, width < 600);
        await h.evaluate(
          "document.querySelector('.pc-report .pc-research').scrollIntoView({block:'start',behavior:'instant'}); true",
        );
        await sleep(120);
        assert.equal(
          await h.evaluate(
            "document.documentElement.scrollWidth <= innerWidth",
          ),
          true,
        );
        assert.equal(
          await h.evaluate(
            "(() => {const e=document.querySelector('.pc-report .pc-research');return e.scrollWidth<=e.clientWidth+1;})()",
          ),
          true,
        );
        await shot("research-" + width);
      }
      await h.viewport(1440, 900);
    },
  );
  await check(
    "library-fetches-references-only-on-open-and-preserves-catalogue",
    async () => {
      await h.click('[aria-controls="library-space"]');
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-heading')?.textContent.includes('2022首入藏')",
        ),
      );
      await h.evaluate(
        "(() => {const e=document.querySelector('[aria-label=检索诗库]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'鹿柴');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
      );
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-title')?.textContent==='鹿柴'",
        ),
      );
      await h.click(".pc-library-title");
      await waitFor(() =>
        h.evaluate(
          "!!document.querySelector('.pc-library-reading .pc-research')",
        ),
      );
      assert.equal(researchCalls, 0);
      await h.click(".pc-library-reading .pc-research > summary");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-reading .pc-research').innerText.includes('fǎn yǐng')",
        ),
      );
      assert.equal(researchCalls, 1);
      assert(
        (
          await h.evaluate(
            "document.querySelector('.pc-library-reading .pc-research').innerText",
          )
        ).includes("底本所列体式"),
      );
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-library-heading').textContent.includes('2022首入藏')",
        ),
        true,
      );
      await h.evaluate(
        "document.querySelector('.pc-library-reading .pc-research').scrollIntoView({block:'start',behavior:'instant'}); true",
      );
      await shot("library-research-1440");
    },
  );
  await check(
    "switching-library-work-does-not-leak-previous-references",
    async () => {
      await h.evaluate(
        "(() => {const e=document.querySelector('[aria-label=检索诗库]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'静夜思');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
      );
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-title')?.textContent==='静夜思'",
        ),
      );
      await h.click(".pc-library-title");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-reading > h2')?.textContent==='静夜思'",
        ),
      );
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-library-reading .pc-research').open",
        ),
        false,
      );
      await h.click(".pc-library-reading .pc-research > summary");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-reading .pc-research').innerText.includes('版本与注释')",
        ),
      );
      const body = await h.evaluate(
        "document.querySelector('.pc-library-reading .pc-research').innerText",
      );
      assert(!body.includes("fǎn yǐng"));
      assert.equal(researchCalls, 2);
    },
  );
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.stack;
  await shot("failure").catch(() => {});
  process.exitCode = 1;
} finally {
  await h.stop();
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: result.checks.length,
      failure: result.failure,
      errors: result.errors,
    }),
  );
}
