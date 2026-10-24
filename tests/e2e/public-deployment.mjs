import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchBrowser } from "./cdp.mjs";
import { waitFor } from "../../scripts/acceptance-runtime.mjs";

const origin = process.argv[2];
if (!origin?.startsWith("http://"))
  throw new Error("Pass the public HTTP origin to test");
const out = resolve("artifacts/acceptance/public-deployment");
mkdirSync(out, { recursive: true });
const h = await launchBrowser();
const result = { origin, checks: [], errors: [] };
h.cdp.on("Runtime.exceptionThrown", (e) =>
  result.errors.push(
    e.exceptionDetails.exception?.description ?? e.exceptionDetails.text,
  ),
);
const clickText = async (scope, text) => {
  await h.evaluate(
    `(() => { const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!e)throw new Error('Button missing');e.dataset.publicTarget='yes';})()`,
  );
  try {
    await h.click('[data-public-target="yes"]');
  } finally {
    await h.evaluate(
      "document.querySelector('[data-public-target]')?.removeAttribute('data-public-target')",
    );
  }
};
try {
  await h.cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await h.cdp.send("Page.navigate", { url: origin + "/#library" });
  await waitFor(
    () => h.evaluate("document.querySelectorAll('.pc-library-title').length>0"),
    30000,
  );
  assert.equal(await h.evaluate("isSecureContext"), false);
  assert.equal(await h.evaluate("typeof crypto.subtle"), "undefined");
  result.checks.push("real-insecure-origin-library-loaded");
  await h.click(".pc-library-title");
  await waitFor(() => h.evaluate("!!document.querySelector('.pc-poem-share')"));
  await clickText(".pc-poem-share button", "复制整首");
  await waitFor(() =>
    h.evaluate("document.body.innerText.includes('整首已复制')"),
  );
  result.checks.push("http-click-copy-poem-success");
  await h.evaluate("location.hash='#checker'");
  await waitFor(() =>
    h.evaluate(
      "!!document.querySelector('.pc-input__text') && document.querySelector('.pc-input__text').getBoundingClientRect().height>0",
    ),
  );
  const poem = "空山不见人，但闻人语响。\n返景入深林，复照青苔上。";
  await h.evaluate(
    `(() => {const e=document.querySelector('.pc-input__text');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(poem)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await h.click(".pc-draft-collection > summary");
  await clickText(".pc-draft-collection button", "保存当前诗稿");
  await waitFor(() =>
    h.evaluate(
      "JSON.parse(localStorage.getItem('poetry-draft-collection-v1')||'{}').entries?.length===1",
    ),
  );
  result.checks.push("http-draft-uuid-and-save-success");
  await h.cdp.send("Page.reload");
  await waitFor(() =>
    h.evaluate(
      `document.querySelector('.pc-input__text')?.value===${JSON.stringify(poem)}`,
    ),
  );
  result.checks.push("draft-survives-reload");
  await h.evaluate("location.hash='#library'");
  await waitFor(() =>
    h.evaluate(
      "document.querySelector('.pc-library')?.getBoundingClientRect().height>0 && document.querySelectorAll('.pc-library-title').length>0",
    ),
  );
  await h.cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await h.evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
  assert(
    await h.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
  );
  result.checks.push("mobile-no-horizontal-overflow");
  const screenshot = await h.cdp.send("Page.captureScreenshot", {
    format: "png",
  });
  writeFileSync(
    resolve(out, "public-mobile.png"),
    Buffer.from(screenshot.data, "base64"),
  );
  assert.deepEqual(result.errors, []);
  console.log(JSON.stringify(result));
} finally {
  writeFileSync(resolve(out, "browser.json"), JSON.stringify(result, null, 2));
  await h.stop();
}
