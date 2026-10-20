/* global process, setTimeout */
// Shared CDP harness for Moonlit UI checks: isolated API + Vite on port 0, text-only results.
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  REPO_ROOT,
  startApi,
  waitFor,
  revision,
} from "../../../scripts/acceptance-runtime.mjs";
import { launchBrowser } from "../../../tests/e2e/cdp.mjs";

export { REPO_ROOT, waitFor, revision };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Only lines whose evidence is reviewed in the real data set; unreviewed characters return 503.
export const LONG =
  "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。床前明月光，疑是地上霜。举头望明月，低头思故乡。".repeat(
    2,
  );

export async function startStack({ production = false } = {}) {
  const api = await startApi();
  const root = join(REPO_ROOT, "apps/web");
  const require = createRequire(join(root, "package.json"));
  const { createServer, preview } = await import(
    pathToFileURL(require.resolve("vite")).href
  );
  process.env.VITE_API_BASE_URL = "";
  const serverOptions = {
    host: "127.0.0.1",
    port: 0,
    proxy: Object.fromEntries(
      ["/api", "/healthz", "/readyz"].map((p) => [p, api.baseUrl]),
    ),
  };
  const config = {
    root,
    configFile: join(root, "vite.config.ts"),
    server: serverOptions,
    preview: serverOptions,
  };
  let web;
  try {
    web = production ? await preview(config) : await createServer(config);
    if (!production) await web.listen();
  } catch (error) {
    await api.stop();
    throw error;
  }
  const url = `http://127.0.0.1:${web.httpServer.address().port}/`;
  async function stop() {
    if (production)
      await new Promise((resolve) => web.httpServer.close(resolve));
    else await web.close();
    await api.stop();
  }
  return { url, stop, apiPid: api.child.pid };
}

export async function startHarness(options) {
  const stack = await startStack(options);
  const { url } = stack;
  let browser;
  try {
    browser = await launchBrowser();
  } catch (error) {
    await stack.stop();
    throw error;
  }
  const { cdp, evaluate } = browser;

  const viewport = (width, height, mobile = false) =>
    cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
  const media = (reduce) =>
    cdp.send("Emulation.setEmulatedMedia", {
      features: [
        {
          name: "prefers-reduced-motion",
          value: reduce ? "reduce" : "no-preference",
        },
      ],
    });

  async function load({
    width = 1440,
    height = 900,
    mobile = false,
    reduce = false,
    clear = true,
    path = "",
  } = {}) {
    await viewport(width, height, mobile);
    await media(reduce);
    await cdp.send("Page.navigate", { url: url + path });
    await waitFor(() =>
      evaluate("Boolean(document.querySelector('.pc-root'))"),
    );
    if (clear) {
      await evaluate(
        "(() => { try { localStorage.clear(); } catch { return 0; } return 1; })()",
      );
      await cdp.send("Page.reload", {});
      await sleep(200);
      await waitFor(() =>
        evaluate("Boolean(document.querySelector('.pc-root'))"),
      );
    }
    await sleep(reduce ? 100 : 1000);
    await evaluate(`(() => {
      window.__intoView = [];
      const into = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (o) { window.__intoView.push(this.id || this.className); return into.call(this, o); };
      window.__raf = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => { window.__raf += 1; return raf(cb); };
    })()`);
  }

  const idle = () =>
    waitFor(
      () =>
        evaluate(
          "!document.querySelector('.pc-root--busy') && !document.querySelector('.pc-input__submit').disabled",
        ),
      20000,
    );

  const setText = (text) =>
    evaluate(`(() => {
    const ta = document.querySelector('.pc-input__text');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

  async function analyze() {
    await browser.click(".pc-input__submit");
    await sleep(150);
    await idle();
    await waitFor(
      () => evaluate("Boolean(document.querySelector('.pc-report'))"),
      20000,
    );
    await sleep(500);
  }

  const sceneAnims = (state) =>
    evaluate(`document.getAnimations().filter((a) => {
    const t = a.effect && a.effect.target;
    return t && t.closest && t.closest('.pc-scene') && ${state ? `a.playState === ${JSON.stringify(state)}` : "true"};
  }).length`);

  const mouse = (type, x, y, extra = {}) =>
    cdp.send("Input.dispatchMouseEvent", { type, x, y, ...extra });

  async function stop() {
    await browser.stop();
    await stack.stop();
  }

  return {
    url,
    cdp,
    evaluate,
    click: browser.click,
    key: browser.key,
    viewport,
    media,
    load,
    idle,
    setText,
    analyze,
    sceneAnims,
    mouse,
    stop,
  };
}

export function makeRecorder(results) {
  return async function scenario(name, fn) {
    try {
      results.scenarios.push({ name, status: "pass", detail: await fn() });
    } catch (e) {
      results.scenarios.push({ name, status: "fail", error: e.message });
    }
  };
}
