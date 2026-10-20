import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  REPO_ROOT,
  freePort,
  revision,
  waitFor,
} from "../../scripts/acceptance-runtime.mjs";
import { launchBrowser } from "./cdp.mjs";
import { POEMS } from "../integration/e2e/d3-acceptance-api.mjs";

const out = resolve(
  process.argv[2] ?? "artifacts/acceptance/keyboard-journey.json",
);
const report = {
  startedAt: new Date().toISOString(),
  revision: revision(),
  mode: "production-preview + real API",
  steps: [],
  focusPath: [],
  scope:
    "Task interactions use actual Tab, Shift+Tab, Enter, Space, Escape and text input; DOM inspection does not move focus or click.",
};
let child, browser;
try {
  const port = await freePort(),
    webPort = await freePort();
  child = fork(join(REPO_ROOT, "scripts/dev.mjs"), ["--preview"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      WEB_PORT: String(webPort),
      POETRY_DEV_MOCK: "0",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  let log = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      log = (log + String(chunk)).slice(-12000);
    });
  const url = `http://127.0.0.1:${webPort}/`;
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(log);
    try {
      return (await fetch(url + "healthz")).ok;
    } catch {
      return false;
    }
  });
  browser = await launchBrowser();
  const { cdp, evaluate, key } = browser;
  report.browser = await cdp.send("Browser.getVersion");
  const errors = [],
    requests = [];
  cdp.on("Runtime.exceptionThrown", (e) =>
    errors.push(e.exceptionDetails.text),
  );
  cdp.on("Network.requestWillBeSent", (e) => {
    if (e.request.url.endsWith("/api/v1/analyze") && e.request.postData)
      requests.push(JSON.parse(e.request.postData));
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Page.navigate", { url });
  await waitFor(() => evaluate("!!document.querySelector('.pc-input__text')"));
  const tabTo = async (predicate, backwards = false, limit = 350) => {
    for (let i = 0; i < limit; i++) {
      await key("Tab", "Tab", 9, backwards ? 8 : 0);
      const focus = await evaluate(
        "({tag:document.activeElement?.tagName, label:document.activeElement?.getAttribute('aria-label'),text:document.activeElement?.textContent?.trim().slice(0,70),className:document.activeElement?.className})",
      );
      report.focusPath.push(focus);
      if (await evaluate(predicate)) return i + 1;
    }
    throw new Error(`Keyboard could not reach ${predicate}`);
  };
  const enter = () => key("Enter", "Enter", 13, 0, "\r");
  await tabTo("document.activeElement?.matches('.pc-input__text')");
  await cdp.send("Input.insertText", { text: POEMS[0].text });
  await tabTo("document.activeElement?.matches('.pc-input__submit')");
  await enter();
  await waitFor(() => evaluate("!!document.querySelector('.pc-status--pass')"));
  report.steps.push({ name: "keyboard text entry and analysis", passed: true });
  await tabTo("document.activeElement?.dataset.tokenId === 'l4c1'");
  await enter();
  await waitFor(() => evaluate("!!document.querySelector('[role=dialog]')"));
  await tabTo(
    "document.activeElement?.matches('.pc-candidate button:not([disabled])')",
  );
  const before = requests.length;
  await enter();
  await waitFor(
    () =>
      requests.length > before &&
      evaluate(
        "!document.querySelector('[role=dialog]') && !document.querySelector('.pc-input__submit').disabled",
      ),
  );
  assert.equal(requests.at(-1).readingOverrides.at(-1).tokenId, "l4c1");
  await tabTo("document.activeElement?.dataset.tokenId === 'l4c1'");
  await enter();
  await waitFor(() =>
    evaluate(
      "document.querySelector('[role=dialog]')?.textContent.includes('用户手动选择')",
    ),
  );
  await key("Escape", "Escape", 27);
  await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"));
  assert.equal(
    await evaluate("document.activeElement?.dataset.tokenId"),
    "l4c1",
  );
  report.steps.push({
    name: "candidate choice reanalyzes and Escape returns focus",
    passed: true,
    override: requests.at(-1).readingOverrides.at(-1),
  });
  await tabTo("document.activeElement?.matches('.pc-settled__summary')");
  await key(" ", "Space", 32, 0, " ");
  assert.equal(
    await evaluate("document.querySelector('.pc-settled').open"),
    true,
  );
  await key(" ", "Space", 32, 0, " ");
  assert.equal(
    await evaluate("document.querySelector('.pc-settled').open"),
    false,
  );
  await tabTo("document.activeElement?.matches('.pc-plinth__toggle')", true);
  const initiallyExpanded = await evaluate(
    "document.activeElement.getAttribute('aria-expanded')",
  );
  await enter();
  await waitFor(() =>
    evaluate(
      `document.querySelector('.pc-plinth__toggle').getAttribute('aria-expanded') !== ${JSON.stringify(initiallyExpanded)}`,
    ),
  );
  await enter();
  await waitFor(() =>
    evaluate(
      `document.querySelector('.pc-plinth__toggle').getAttribute('aria-expanded') === ${JSON.stringify(initiallyExpanded)}`,
    ),
  );
  if (initiallyExpanded === "false") await enter();
  await waitFor(() =>
    evaluate(
      "document.querySelector('.pc-plinth__toggle').getAttribute('aria-expanded') === 'true'",
    ),
  );
  await tabTo("document.activeElement?.matches('.pc-input__text')");
  assert.equal(
    await evaluate("document.querySelector('.pc-input__text').value"),
    POEMS[0].text,
  );
  report.steps.push({
    name: "keyboard settled checks and editor folding preserve input",
    passed: true,
  });
  await tabTo(
    "document.activeElement?.getAttribute('aria-controls') === 'dictionary-space'",
    true,
  );
  await enter();
  await waitFor(() =>
    evaluate("!document.querySelector('#dictionary-space').hidden"),
  );
  await tabTo("document.activeElement?.matches('.pc-dictionary__input')");
  await cdp.send("Input.insertText", { text: "月" });
  await enter();
  await waitFor(() =>
    evaluate(
      "document.querySelector('.pc-dictionary__glyph')?.textContent === '月'",
    ),
  );
  await tabTo(
    "document.activeElement?.matches('.pc-dictionary__source summary')",
  );
  await enter();
  assert.equal(
    await evaluate("document.querySelector('.pc-dictionary__source').open"),
    true,
  );
  report.steps.push({
    name: "keyboard scene navigation, dictionary lookup and provenance",
    passed: true,
  });
  assert.deepEqual(errors, []);
  report.pageErrors = errors;
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.stack;
} finally {
  await browser?.stop();
  if (child?.connected) {
    const exited = once(child, "exit");
    child.send("shutdown");
    await exited;
  }
  report.completedAt = new Date().toISOString();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      { passed: report.passed, steps: report.steps, error: report.error },
      null,
      2,
    ),
  );
  process.exitCode = report.passed ? 0 : 1;
}
