import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildApp } from "../../apps/api/src/server.ts";
import {
  startHarness,
  waitFor,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";

const out = resolve(process.argv[2] ?? "artifacts/continuous-improvement/rhyme-large-catalog");
mkdirSync(out, { recursive: true });
const raw = JSON.parse(readFileSync("data/normalized/xinyun.full-readings-v2.json", "utf8"));
const seed = raw.candidates.find(c => c.character === "玉" && c.modernReading?.toneNumber === 4);
assert(seed, "Real 玉 reading must exist");
const candidates = raw.candidates.filter(c => c.character !== "玉" && c.groupIds.some(id => seed.groupIds.includes(id)));
const expectedCharacters = [...new Set(candidates.map(c => c.character))];
assert(expectedCharacters.length > 2500, "Use a genuinely large real rhyme group");
const lv4 = [...new Set(candidates.filter(c => c.modernReading?.pinyin === "lü" && c.modernReading.toneNumber === 4).map(c => c.character))].sort();
assert(lv4.includes("绿"), "Actual catalogue must contain lü4 evidence");
let modelCalls = 0;
let aiRequests = 0;
const lookupRequests = [];
const app = buildApp({ readingAssistant: {
  apiKey: "",
  fetcher: async () => { modelCalls++; throw new Error("This scenario must not call any model"); },
} });
app.addHook("preHandler", async request => {
  if (request.url === "/api/v1/rhyme-words") lookupRequests.push(request.body);
  if (request.url === "/api/v1/poetry-assistant") aiRequests++;
});
const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
const h = await startHarness({ production: true, api: { baseUrl, stop: () => app.close() } });
const result = {
  revision: revision(),
  mode: "real-local-data-no-model",
  source: "宋赵恒《劝学诗》两句：娶妻莫恨无良媒，书中自有颜如玉。",
  dataVersion: raw.dataVersion,
  groupIds: seed.groupIds,
  characters: expectedCharacters.length,
  readings: candidates.length,
  checks: [],
  errors: [],
};
h.cdp.on("Runtime.exceptionThrown", e => result.errors.push(e.exceptionDetails.exception?.description ?? e.exceptionDetails.text));
const check = async (name, run) => { await run(); result.checks.push(name); console.log("[PASS] " + name); };
const shot = async name => writeFileSync(join(out, name + ".png"), Buffer.from((await h.cdp.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
const displayed = () => h.evaluate("[...document.querySelectorAll('.pc-rhyme-characters button')].map(e=>e.textContent)");
const filter = value => h.evaluate(`(() => { const e=document.querySelector('[aria-label="筛选同韵字"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
async function clickText(scope, label) {
  await h.evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw new Error('Missing button');e.dataset.largeTarget='yes';})()`);
  try { await h.click('[data-large-target="yes"]'); }
  finally { await h.evaluate("document.querySelector('[data-large-target]')?.removeAttribute('data-large-target')"); }
}
try {
  await h.load({ path: "#checker", reduce: true });
  await h.click('.pc-poetry-critique input[type="checkbox"]');
  await h.click('.pc-input__books input[value="xinyun"]');
  await h.setText("娶妻莫恨无良媒，书中自有颜如玉。");
  await h.analyze();
  await check("large-real-group-all-characters-visible-without-pagination", async () => {
    const started = performance.now();
    await clickText('.pc-poetry-desk > [role="tablist"] [role="tab"]', "同韵寻字");
    await waitFor(() => h.evaluate(`document.querySelectorAll('.pc-rhyme-characters button').length===${expectedCharacters.length}`), 60000);
    result.fullCatalogueMs = Math.round(performance.now() - started);
    assert.deepEqual((await displayed()).sort(), [...expectedCharacters].sort());
    assert.equal(await h.evaluate("document.querySelectorAll('[aria-label=\"上一页韵字\"], [aria-label=\"下一页韵字\"]').length"), 0);
    assert.equal(await h.evaluate("document.querySelector('[aria-label=\"选择韵脚读音\"]').value"), seed.id);
    assert.equal(lookupRequests.length, Math.ceil(expectedCharacters.length / 120));
    assert.equal(aiRequests, 0);
    assert.equal(modelCalls, 0);
    result.transportPages = lookupRequests.length;
    console.log(JSON.stringify({ characters: result.characters, readings: result.readings, fullCatalogueMs: result.fullCatalogueMs, transportPages: result.transportPages }));
  });
  await check("last-character-filter-and-clear-restores-entire-catalogue", async () => {
    const last = (await displayed()).at(-1);
    result.lastCharacter = last;
    await filter(last);
    await waitFor(() => h.evaluate("document.querySelectorAll('.pc-rhyme-characters button').length===1"));
    assert.deepEqual(await displayed(), [last]);
    await clickText(".pc-rhyme-filter button", "清空筛选");
    await waitFor(() => h.evaluate(`document.querySelectorAll('.pc-rhyme-characters button').length===${expectedCharacters.length}`));
  });
  await check("numeric-and-accented-pinyin-share-actual-candidate-evidence", async () => {
    for (const query of ["lv4", "lǜ", "lü4", "lu:4", "lv4 去声"]) {
      await filter(query);
      await waitFor(() => h.evaluate(`document.querySelectorAll('.pc-rhyme-characters button').length===${lv4.length}`));
      assert.deepEqual((await displayed()).sort(), lv4, query);
    }
    result.lv4Characters = lv4;
    await filter("lv4 平声");
    await waitFor(() => h.evaluate("document.querySelectorAll('.pc-rhyme-characters button').length===0"));
    assert.equal(await h.evaluate("document.querySelector('.pc-poetry-desk').textContent.includes('没有匹配的同韵字')"), true);
    await clickText(".pc-rhyme-filter button", "清空筛选");
    await waitFor(() => h.evaluate(`document.querySelectorAll('.pc-rhyme-characters button').length===${expectedCharacters.length}`));
  });
  await check("large-catalogue-mobile-fit-and-last-row-keyboard-focus", async () => {
    await h.viewport(320, 900, true);
    assert.equal(await h.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), true);
    await h.evaluate("document.querySelector('.pc-rhyme-filter').scrollIntoView({block:'start',behavior:'instant'})");
    await shot("large-catalogue-320");
    await h.evaluate("(() => {const nodes=[...document.querySelectorAll('.pc-rhyme-characters button')];nodes.at(-2).scrollIntoView({block:'center',behavior:'instant'});nodes.at(-2).focus({preventScroll:true});})()");
    await h.key("Tab", "Tab", 9);
    assert.equal(await h.evaluate("document.activeElement === [...document.querySelectorAll('.pc-rhyme-characters button')].at(-1)"), true);
    assert.equal(await h.evaluate("document.activeElement.textContent"), result.lastCharacter);
    await shot("large-catalogue-last-keyboard-320");
    await h.key("Enter", "Enter", 13, 0, "\r");
    await waitFor(() => h.evaluate("location.hash.startsWith('#dictionary?') && !!document.querySelector('.pc-dictionary__result')"));
    assert.equal(await h.evaluate("new URLSearchParams(location.hash.split('?')[1]).get('char')"), result.lastCharacter);
    assert.equal(lookupRequests.length, result.transportPages, "Filtering and keyboard access should not reload catalogue");
    assert.equal(aiRequests, 0);
    assert.equal(modelCalls, 0);
  });
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.stack;
  process.exitCode = 1;
  await shot("failure").catch(() => {});
} finally {
  result.modelCalls = modelCalls;
  result.aiRequests = aiRequests;
  await h.stop();
  writeFileSync(join(out, "results.json"), JSON.stringify(result, null, 2) + "\n");
}
