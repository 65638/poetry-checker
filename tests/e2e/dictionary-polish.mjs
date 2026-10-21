import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  startHarness,
  sleep,
  waitFor,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";

const out = resolve(process.argv[2] ?? "artifacts/dictionary-polish");
mkdirSync(out, { recursive: true });
const report = {
  revision: revision(),
  mode: "production + real API",
  checks: [],
};
const h = await startHarness({ production: true });
const { evaluate, click, cdp } = h;
const shot = async (name) => {
  const image = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, name + ".png"), Buffer.from(image.data, "base64"));
};
const ready = () =>
  waitFor(() =>
    evaluate(
      "!!document.querySelector('.pc-dictionary__glyph') && document.querySelector('.pc-dictionary__folio').getAttribute('aria-busy') === 'false'",
    ),
  );
const check = async (name, run) => {
  await run();
  report.checks.push({ name, status: "pass" });
  console.log("[PASS]", name);
};
try {
  await h.load({ path: "#dictionary" });
  await shot("after-empty");
  await click(".pc-dictionary__examples button");
  await ready();
  await sleep(500);
  await evaluate("window.scrollTo(0, 0)");
  await shot("after-desktop");
  await check("folio-text-selection-and-surface-cursor", async () => {
    const styles = await evaluate(`({
      selection: getComputedStyle(document.querySelector('.pc-dictionary__facts')).userSelect,
      cursor: getComputedStyle(document.querySelector('.pc-dictionary__folio')).cursor,
      tone: parseFloat(getComputedStyle(document.querySelector('.pc-dictionary__tone')).fontSize)
    })`);
    assert.equal(styles.selection, "text");
    assert.match(styles.cursor, /cursor-rain-ink/);
    assert.ok(styles.tone >= 24);
  });
  await check("delayed-repeat-retains-result-and-button-geometry", async () => {
    await evaluate(`(() => {
      window.__originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await window.__originalFetch(...args);
        if (String(args[0]).includes('/characters/'))
          await new Promise(r => setTimeout(r, 400));
        return response;
      };
      window.__oldResult = document.querySelector('.pc-dictionary__result');
      window.__samples = [];
      window.__sampling = true;
      const sample = () => {
        const button = document.querySelector('.pc-dictionary__searchline button');
        window.__samples.push({
          at: performance.now(),
          width: button.getBoundingClientRect().width,
          color: getComputedStyle(button).backgroundColor,
          label: button.textContent,
          retained: document.querySelector('.pc-dictionary__result') === window.__oldResult
        });
        if (window.__sampling) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    })()`);
    await click(".pc-dictionary__searchline button");
    await sleep(850);
    const samples = await evaluate(
      "window.__sampling = false; window.__samples",
    );
    assert.ok(samples.every((s) => s.retained));
    assert.ok(
      Math.max(...samples.map((s) => s.width)) -
        Math.min(...samples.map((s) => s.width)) <
        1,
    );
    // Hover/press may ease between seal reds; pending must never flash grey.
    assert.ok(
      samples.every((s) => {
        const [red, green] = s.color.match(/[\d.]+/g).map(Number);
        return red > green * 1.3;
      }),
    );
    const busy = samples.filter((s) => s.label.includes("查阅中"));
    assert.ok(busy.length > 2);
    assert.ok(busy.at(-1).at - busy[0].at >= 280);
    await evaluate("window.fetch = window.__originalFetch");
  });
  await check("fast-repeat-has-no-loading-flash", async () => {
    // Reuse a cloned real response for deterministic sub-frame completion.
    await evaluate(`(async () => {
      const response = await fetch('/api/v1/characters/' + encodeURIComponent('月') + '?book=pingshui');
      window.__originalFetch = window.fetch;
      window.fetch = (...args) => String(args[0]).includes('/characters/')
        ? Promise.resolve(response.clone()) : window.__originalFetch(...args);
      window.__labels = [];
      window.__labelObserver = new MutationObserver(() => {
        window.__labels.push(document.querySelector('.pc-dictionary__searchline button').textContent);
      });
      window.__labelObserver.observe(document.querySelector('.pc-dictionary__searchline'), {subtree:true,childList:true,characterData:true});
    })()`);
    await click(".pc-dictionary__searchline button");
    await sleep(550);
    assert.ok(
      (await evaluate("window.__labels")).every((s) => !s.includes("查阅中")),
    );
    await evaluate(
      "window.__labelObserver.disconnect(); window.fetch = window.__originalFetch",
    );
  });
  await check("comparison-reveals-and-repeat-preserves-height", async () => {
    await click(".pc-dictionary__compare-button");
    await waitFor(() =>
      evaluate(
        "document.querySelectorAll('.pc-dictionary__comparison-row').length === 3",
      ),
    );
    await sleep(450);
    await evaluate("window.scrollTo(0,180)");
    await shot("after-comparison");
    const height = await evaluate(
      "document.querySelector('.pc-dictionary__comparison').getBoundingClientRect().height",
    );
    await click(".pc-dictionary__compare-button");
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-dictionary__comparison').getBoundingClientRect().height",
      ),
      height,
    );
    await sleep(500);
  });
  await check("mobile-320-375-768-no-overflow", async () => {
    for (const width of [320, 375, 768]) {
      await h.viewport(width, 900);
      await evaluate("window.scrollTo(0,0)");
      await sleep(250);
      assert.ok(
        await evaluate(
          "document.documentElement.scrollWidth <= innerWidth + 1",
        ),
      );
      if (width === 375) {
        await shot("after-mobile");
        await evaluate(
          "document.querySelector('.pc-dictionary__folio').scrollIntoView()",
        );
        await shot("after-mobile-result");
      }
    }
  });
  await check("garden-rain-persists-across-navigation", async () => {
    await h.viewport(1440, 900);
    await click('[aria-controls="checker-space"]');
    await waitFor(() => evaluate("!document.documentElement.dataset.journey"));
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-continuous .pc-rain').dataset.running",
      ),
      "true",
    );
    await click('[aria-controls="dictionary-space"]');
    await waitFor(() => evaluate("!document.documentElement.dataset.journey"));
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-continuous .pc-rain').dataset.running",
      ),
      "true",
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.pc-rain').length"),
      1,
    );
  });
  await check("effects-off-and-system-reduced-motion", async () => {
    await click(".pc-dictionary .pc-motion-toggle");
    await sleep(100);
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-continuous .pc-rain').dataset.running",
      ),
      "false",
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-dictionary__result')).animationName",
      ),
      "none",
    );
    await click(".pc-dictionary .pc-motion-toggle");
    await h.media(true);
    await sleep(200);
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-continuous .pc-rain').dataset.running",
      ),
      "false",
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.pc-dictionary__reveal')).transitionDuration",
      ),
      "0s, 0s, 0s",
    );
  });
  await check("failed-refresh-does-not-announce-old-success", async () => {
    await evaluate(`(() => {
      window.__originalFetch = window.fetch;
      window.fetch = (...args) => String(args[0]).includes('/characters/')
        ? Promise.reject(new TypeError('Test connection failure')) : window.__originalFetch(...args);
    })()`);
    await click(".pc-dictionary__searchline button");
    await waitFor(() =>
      evaluate("!!document.querySelector('.pc-dictionary__error')"),
    );
    await sleep(550);
    assert.equal(
      await evaluate(
        "document.querySelector('.pc-dictionary__status').textContent",
      ),
      "本次查阅未完成",
    );
    assert.equal(
      await evaluate("!!document.querySelector('.pc-dictionary__glyph')"),
      false,
    );
    await evaluate("window.fetch = window.__originalFetch");
    await click(".pc-dictionary__error button");
    await ready();
  });
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  writeFileSync(join(out, "polish.json"), JSON.stringify(report, null, 2));
  await h.stop();
}
