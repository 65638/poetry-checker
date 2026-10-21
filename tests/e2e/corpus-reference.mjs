import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  startHarness,
  waitFor,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";

const out = resolve(process.argv[2] ?? "artifacts/corpus-reference");
mkdirSync(out, { recursive: true });
const h = await startHarness({ production: true });
const result = {
  revision: revision(),
  mode: "real-local-corpus-api-browser-no-external-model",
  checks: [],
  errors: [],
};
h.cdp.on("Runtime.exceptionThrown", (e) =>
  result.errors.push(
    e.exceptionDetails.exception?.description ?? e.exceptionDetails.text,
  ),
);
const requests = [];
await h.cdp.send("Network.enable");
h.cdp.on("Network.requestWillBeSent", (e) => requests.push(e.request.url));
const check = async (name, fn) => {
  await fn();
  result.checks.push(name);
  console.log("[PASS]", name);
};
const fill = (selector, value) =>
  h.evaluate(
    `(() => {const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
const select = (selector, value) =>
  h.evaluate(
    `(() => {const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
const clickText = async (selector, text) => {
  await h.evaluate(
    `(() => { const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el)throw new Error('Missing button '+${JSON.stringify(text)});el.dataset.corpusTarget='yes';})()`,
  );
  try {
    await h.click('[data-corpus-target="yes"]');
  } finally {
    await h.evaluate(
      "document.querySelector('[data-corpus-target]')?.removeAttribute('data-corpus-target')",
    );
  }
};
const open = async (title) => {
  await fill('[aria-label="检索诗库"]', title);
  await waitFor(() =>
    h.evaluate(
      `document.querySelector('.pc-library-title')?.textContent===${JSON.stringify(title)}`,
    ),
  );
  await h.click(".pc-library-title");
  await waitFor(() =>
    h.evaluate(
      `document.querySelector('.pc-library-reading > h2')?.textContent===${JSON.stringify(title)}`,
    ),
  );
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
  await check("lazy-catalog-2022-source-linked-works", async () => {
    await h.load({ path: "#checker", reduce: true });
    assert.equal(
      requests.some((url) => url.endsWith("/api/v1/library")),
      false,
    );
    await h.click('[aria-controls="library-space"]');
    await waitFor(() =>
      h.evaluate(
        "document.querySelector('.pc-library-heading').textContent.includes('2022首入藏')",
      ),
    );
    assert.equal(
      await h.evaluate("document.querySelectorAll('.pc-library-title').length"),
      20,
    );
  });
  await check(
    "compilation-is-hidden-until-explicitly-included-with-original-intact",
    async () => {
      await fill('[aria-label="检索诗库"]', "行路难");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-title')?.textContent.includes('行路难')",
        ),
      );
      const titles = await h.evaluate(
        "[...document.querySelectorAll('.pc-library-title')].map(el=>el.textContent)",
      );
      for (const title of ["行路难·其一", "行路难·其二", "行路难·其三"])
        assert(titles.includes(title));
      assert(!titles.includes("行路难三首"));
      await h.click('[aria-label="显示合编与重复篇"]');
      await waitFor(() =>
        h.evaluate(
          "[...document.querySelectorAll('.pc-library-title')].some(el=>el.textContent==='行路难三首')",
        ),
      );
      await clickText(".pc-library-title", "行路难三首");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-reading > h2')?.textContent==='行路难三首'",
        ),
      );
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-library-verses').textContent.includes('大道如青天')",
        ),
        true,
      );
      await h.click('[aria-label="显示合编与重复篇"]');
      await fill('[aria-label="检索诗库"]', "");
    },
  );
  await check(
    "local-scene-search-ranks-related-passages-above-repeated-long-text",
    async () => {
      await clickText('.pc-library-search [role="tab"]', "诗境");
      await fill('[aria-label="检索诗库"]', "雨夜思乡");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-title')?.textContent==='夜雨寄北'",
        ),
      );
      await fill('[aria-label="检索诗库"]', "江上孤舟");
      await waitFor(() =>
        h.evaluate(
          "[...document.querySelectorAll('.pc-library-title')].slice(0,4).some(el=>el.textContent==='江雪')",
        ),
      );
      await clickText('.pc-library-search [role="tab"]', "题名 / 原句");
    },
  );
  await check(
    "ruby-pronunciation-original-links-and-character-picker",
    async () => {
      await open("夜雨寄北");
      await h.click(".pc-library-pinyin-toggle input");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-verses rt')?.textContent==='jūn'",
        ),
      );
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-library-reading a').href.startsWith('https://www.gushiwen.cn/')",
        ),
        true,
      );
      await h.click('[aria-label="选字「雨」"]');
      assert.equal(
        await h.evaluate(
          "document.querySelector('[aria-label=原诗查字]').value",
        ),
        "雨",
      );
      for (const width of [1440, 768, 375, 320]) {
        await h.viewport(width, 1000, width < 600);
        await h.evaluate(
          "document.querySelector('.pc-library-reading').scrollIntoView({block:'start',behavior:'instant'})",
        );
        assert.equal(
          await h.evaluate(
            "document.documentElement.scrollWidth<=innerWidth+1",
          ),
          true,
          "ruby " + width,
        );
        await shot("annotated-" + width);
      }
      await h.viewport(1440, 1000);
    },
  );
  await check(
    "collection-and-prose-filter-do-not-route-prose-to-prosody",
    async () => {
      await fill('[aria-label="检索诗库"]', "");
      await select('[aria-label="按选集筛选"]', "唐诗三百首");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-filters > span').textContent==='321首'",
        ),
      );
      await select('[aria-label="按选集筛选"]', "");
      await select('[aria-label="按文类筛选"]', "prose");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-title')?.textContent==='庖丁解牛'",
        ),
      );
      await h.click(".pc-library-title");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-reading > h2')?.textContent==='庖丁解牛'",
        ),
      );
      assert.equal(
        await h.evaluate(
          "[...document.querySelectorAll('.pc-library-reading button')].some(b=>b.textContent==='赏读此文')",
        ),
        true,
      );
      assert.equal(
        await h.evaluate(
          "[...document.querySelectorAll('.pc-library-reading button')].some(b=>b.textContent==='研读此诗')",
        ),
        false,
      );
      await select('[aria-label="按文类筛选"]', "");
    },
  );
  await check(
    "missing-astral-reading-remains-visible-without-shifting-next-syllable",
    async () => {
      await open("望海潮·东南形胜");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-library-character[aria-label=\"选字「𪩘」\"] rt')?.textContent==='·'",
        ),
      );
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-library-character[aria-label=\"选字「𪩘」\"]').title",
        ),
        "本字未提供注音",
      );
    },
  );
  await check(
    "long-work-selection-is-bounded-and-marked-as-excerpt",
    async () => {
      await open("九章");
      const count = await h.evaluate(
        "document.querySelector('[aria-label=研读选段]').options.length",
      );
      assert(count > 1);
      await select('[aria-label="研读选段"]', "1");
      await clickText(".pc-library-reading button", "研读选段");
      await waitFor(() =>
        h.evaluate(
          "location.hash==='#checker' && !!document.querySelector('.pc-report')",
        ),
      );
      assert.equal(
        await h.evaluate(
          "[...document.querySelector('.pc-input__text').value].length<=2000",
        ),
        true,
      );
      assert.equal(
        await h.evaluate(
          "JSON.parse(localStorage.getItem('poetry-notebook-v1')).entries.some(e=>e.note.includes('九章（选段2/'))",
        ),
        true,
      );
    },
  );
  await check(
    "independent-reference-corrections-and-explicit-related-glyph-lookup",
    async () => {
      await h.evaluate(
        "location.hash='dictionary?char='+encodeURIComponent('乾')+'&book=pingshui'",
      );
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-dictionary__glyph')?.textContent==='乾'",
        ),
      );
      await h.click(".pc-guangyun summary");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-guangyun')?.textContent.includes('订正提供表配反')",
        ),
      );
      assert.equal(
        await h.evaluate(
          "[...document.querySelectorAll('.pc-guangyun li')].find(el=>el.textContent.includes('古寒切')).textContent.includes('gān')",
        ),
        true,
      );
      await h.evaluate(
        "location.hash='dictionary?char='+encodeURIComponent('东')+'&book=pingshui'",
      );
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-dictionary__glyph')?.textContent==='东'",
        ),
      );
      await h.click(".pc-guangyun summary");
      await waitFor(() =>
        h.evaluate("!!document.querySelector('.pc-guangyun-related button')"),
      );
      await clickText(".pc-guangyun-related button", "東");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-dictionary__glyph')?.textContent==='東'",
        ),
      );
      await h.click(".pc-guangyun summary");
      await waitFor(() =>
        h.evaluate(
          "document.querySelector('.pc-dictionary__glyph')?.textContent==='東' && document.querySelector('.pc-guangyun li')?.textContent.includes('德紅切')",
        ),
      );
      for (const width of [1440, 375, 320]) {
        await h.viewport(width, 1000, width < 600);
        await h.evaluate(
          "document.querySelector('.pc-guangyun').scrollIntoView({block:'start',behavior:'instant'})",
        );
        assert.equal(
          await h.evaluate(
            "document.documentElement.scrollWidth<=innerWidth+1",
          ),
          true,
          "reference " + width,
        );
        await shot("reference-" + width);
      }
    },
  );
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.stack;
  process.exitCode = 1;
  await shot("failure").catch(() => {});
} finally {
  await h.stop();
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
}
