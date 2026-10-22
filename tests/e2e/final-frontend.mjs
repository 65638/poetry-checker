import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { buildApp } from "../../apps/api/src/server.ts";
import {
  startHarness,
  waitFor,
  sleep,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";

const out = resolve(process.argv[2] ?? "artifacts/final-frontend");
mkdirSync(out, { recursive: true });
let libraryCalls = 0,
  researchCalls = 0,
  releaseCatalog;
const app = buildApp({ readingAssistant: { apiKey: "" } });
app.addHook("preHandler", async (req, reply) => {
  if (req.url === "/api/v1/library") {
    libraryCalls++;
    if (libraryCalls === 1) {
      await new Promise((resolve) => (releaseCatalog = resolve));
      return reply
        .code(503)
        .send({
          error: {
            code: "LIBRARY_UNAVAILABLE",
            message: "Controlled corpus failure",
            fieldErrors: [],
          },
        });
    }
  }
  if (req.url === "/api/v1/research" && ++researchCalls === 1)
    return reply
      .code(503)
      .send({
        error: {
          code: "UNAVAILABLE",
          message: "Controlled reference failure",
          fieldErrors: [],
        },
      });
});
const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
const h = await startHarness({
  production: true,
  api: { baseUrl, stop: () => app.close() },
});
const result = {
  revision: revision(),
  mode: "local-api-no-model-controlled-network-failures",
  checks: [],
  errors: [],
};
h.cdp.on("Runtime.exceptionThrown", (e) =>
  result.errors.push(e.exceptionDetails.text),
);
const check = async (name, fn) => {
  await fn();
  result.checks.push(name);
  console.log("[PASS]", name);
};
const fill = (selector, value) =>
  h.evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
const clickText = (selector, text) =>
  h.evaluate(
    `(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing button');e.click();})()`,
  );
const shot = async (name) =>
  writeFileSync(
    join(out, name + ".png"),
    Buffer.from(
      (await h.cdp.send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
try {
  await h.load({ reduce: true });
  await check(
    "failed-corpus-can-recover-without-exporting-three-placeholder-poems",
    async () => {
      await h.click('[aria-controls="library-space"]');
      await waitFor(() => !!releaseCatalog);
      assert(
        await h.evaluate(
          "document.querySelector('[aria-label=\"导出诗库\"]').disabled && document.querySelector('.pc-library-discover button').disabled",
        ),
      );
      releaseCatalog();
      await waitFor(() =>
        h.evaluate("!!document.querySelector('.pc-library-retry')"),
      );
      await clickText(".pc-library-retry button", "重新载入诗库");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-heading').textContent.includes('2022首入藏')",
        ),
      );
      assert.equal(libraryCalls, 2);
      assert.equal(
        await h.evaluate("!!document.querySelector('.pc-library-retry')"),
        false,
      );
    },
  );
  await check(
    "search-clear-is-in-field-and-filter-columns-stay-aligned",
    async () => {
      const before = await h.evaluate(
        "document.querySelector('.pc-library-query').getBoundingClientRect().height",
      );
      await fill('[aria-label="检索诗库"]', "夜雨寄北");
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-library-query').getBoundingClientRect().height",
        ),
        before,
      );
      for (const width of [1440, 1024, 768, 375, 320]) {
        await h.viewport(width, 900, width < 600);
        const metrics = await h.evaluate(
          `(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect();const f=rect('.pc-studio-searchbox'),c=rect('[aria-label="清空检索"]');return {overflow:document.documentElement.scrollWidth>innerWidth+1,inside:c.left>=f.left&&c.right<=f.right,selects:[...document.querySelectorAll('.pc-library-filter select')].every(e=>e.getBoundingClientRect().width>48)};})()`,
        );
        assert.deepEqual(metrics, {
          overflow: false,
          inside: true,
          selects: true,
        });
      }
      await shot("catalogue-320");
      await h.click(".pc-library-title");
      await waitFor(() =>
        h.evaluate(
          "document.activeElement===document.querySelector('.pc-library-reading')",
        ),
      );
    },
  );
  await check(
    "reading-title-centered-and-detached-return-target-restores-catalogue-focus",
    async () => {
      assert.equal(
        await h.evaluate(
          "getComputedStyle(document.querySelector('.pc-library-reading > h2')).textAlign",
        ),
        "center",
      );
      assert.equal(
        await h.evaluate(
          "getComputedStyle(document.querySelector('.pc-library-byline')).textAlign",
        ),
        "center",
      );
      await fill('[aria-label="检索诗库"]', "不存在的诗题123");
      await clickText(".pc-library-reading button", "回诗库");
      assert.equal(
        await h.evaluate(
          "document.activeElement===document.querySelector('.pc-library-catalogue')",
        ),
        true,
      );
      await fill('[aria-label="检索诗库"]', "夜雨寄北");
      await h.click(".pc-library-title");
    },
  );
  await check(
    "mobile-pinyin-keeps-punctuation-with-its-glyph",
    async () => {
      await h.click('.pc-library-pinyin-toggle input');
      await waitFor(() => h.evaluate("!!document.querySelector('.pc-library-verses rt')"));
      assert.equal(await h.evaluate(`(() => {
        return [...document.querySelectorAll('.pc-library-punctuation')].every(p => {
          const glyph = p.previousElementSibling.getBoundingClientRect();
          const punctuation = p.getBoundingClientRect();
          return punctuation.top >= glyph.top - 1 && punctuation.bottom <= glyph.bottom + 1;
        });
      })()`), true);
      assert.equal(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
      await h.evaluate("document.querySelector('.pc-library-reading').scrollIntoView({block:'start',behavior:'instant'})");
      await shot('pinyin-320');
    },
  );
  await check(
    "reference-error-retries-once-and-reopening-reuses-matching-poem",
    async () => {
      await h.click(".pc-library-reading .pc-research > summary");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-research__body')?.textContent.includes('重新查阅出处')",
        ),
      );
      await sleep(200);
      assert.equal(researchCalls, 1);
      await clickText(".pc-research__body button", "重新查阅出处");
      await waitFor(() =>
        h.evaluate(
          "!!document.querySelector('.pc-library-reading .pc-corpus')",
        ),
      );
      assert.equal(researchCalls, 2);
      await h.click(".pc-library-reading .pc-research > summary");
      await h.click(".pc-library-reading .pc-research > summary");
      await sleep(200);
      assert.equal(researchCalls, 2);
      await clickText(".pc-corpus summary", "逐字注音与出处");
      await waitFor(() =>
        h.evaluate("!!document.querySelector('.pc-corpus__reading')"),
      );
      await h.click(".pc-corpus__reading > summary");
      assert.equal(
        await h.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
        true,
      );
      await shot("reference-320");
    },
  );
  await check(
    "dictionary-character-center-and-provider-neutral-interface",
    async () => {
      await h.click('[aria-controls="dictionary-space"]');
      await h.click('[aria-label="查「月」字"]');
      await waitFor(() =>
        h.evaluate("!!document.querySelector('.pc-dictionary__result')"),
      );
      const style = await h.evaluate(
        "(()=>{const s=getComputedStyle(document.querySelector('.pc-dictionary__input'));return {left:s.paddingLeft,right:s.paddingRight,align:s.textAlign}})()",
      );
      assert.equal(style.left, style.right);
      assert.equal(style.align, "center");
      await h.click('[aria-controls="library-space"]');
      await clickText(".pc-library-search [role=tab]", "诗境");
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-library').textContent.includes('GLM')",
        ),
        false,
      );
    },
  );
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.stack;
  process.exitCode = 1;
  await shot("failure").catch(() => {});
} finally {
  releaseCatalog?.();
  await h.stop();
  writeFileSync(join(out, "results.json"), JSON.stringify(result, null, 2));
}
