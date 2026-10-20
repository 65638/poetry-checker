/* global process, console */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_ROOT,
  revision,
  sleep,
  startHarness,
  makeRecorder,
} from "./harness.mjs";

const results = {
  suite: "codex-takeover",
  revision: revision(),
  at: new Date().toISOString(),
  scenarios: [],
};
const scenario = makeRecorder(results);
const poem = "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。";
const h = await startHarness();
results.url = h.url;
try {
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [1280, 800],
    [1100, 900],
    [1024, 768],
    [900, 900],
    [899, 900],
    [768, 1024],
    [375, 812],
    [720, 450],
  ]) {
    await scenario(`working-layout-${width}x${height}`, async () => {
      await h.load({ width, height, mobile: width === 375 });
      await h.evaluate(
        'window.__originalEditor = document.querySelector("textarea"), 1',
      );
      await h.setText(poem);
      await h.analyze();
      await h.evaluate('window.scrollTo({ top: 0, behavior: "instant" }), 1');
      await sleep(150);
      const result = await h.evaluate(`(() => {
        const first = document.querySelector('.pc-line').getBoundingClientRect();
        const rail = document.querySelector('.pc-rail').getBoundingClientRect();
        const editor = document.querySelector('textarea');
        return { overflow: document.documentElement.scrollWidth > innerWidth, firstLineBottom: first.bottom, railBottom: rail.bottom,
          sameEditor: editor === window.__originalEditor, bookVisible: document.querySelector('.pc-input__books').getBoundingClientRect().height > 0 };
      })()`);
      assert(!result.overflow, JSON.stringify(result));
      assert(result.sameEditor && result.bookVisible, JSON.stringify(result));
      if (width >= 900) {
        assert(
          result.firstLineBottom <= height,
          `poem below fold: ${JSON.stringify(result)}`,
        );
        assert(
          result.railBottom <= height,
          `rail below fold: ${JSON.stringify(result)}`,
        );
      }
      return result;
    });
  }

  await scenario("mobile-directory-disclosure-and-keyboard-jump", async () => {
    await h.load({ width: 375, height: 812, mobile: true });
    await h.setText(poem);
    await h.analyze();
    assert.equal(
      await h.evaluate(
        "getComputedStyle(document.querySelector('.pc-rail__directory')).display",
      ),
      "none",
    );
    await h.evaluate(
      "document.querySelector('.pc-rail__directory-toggle').focus(), 1",
    );
    await h.key("Enter", "Enter", 13, 0, "\r");
    assert.notEqual(
      await h.evaluate(
        "getComputedStyle(document.querySelector('.pc-rail__directory')).display",
      ),
      "none",
    );
    await h.evaluate("document.querySelector('.pc-rail__line').focus(), 1");
    await h.key("Enter", "Enter", 13, 0, "\r");
    assert.equal(await h.evaluate("document.activeElement.id"), "pc-line-1");
    return { collapsedInitially: true, keyboardDestination: "pc-line-1" };
  });

  await scenario("compact-settings-and-textarea-identity", async () => {
    await h.load();
    await h.evaluate(
      'window.__originalEditor = document.querySelector("textarea"), 1',
    );
    await h.setText(poem);
    await h.analyze();
    await h.click(".pc-input__settings");
    assert.equal(
      await h.evaluate("document.querySelector('.pc-examples').hidden"),
      false,
    );
    await h.click(".pc-examples__item");
    await h.click(".pc-input__settings");
    assert(
      await h.evaluate(
        'document.querySelector("textarea") === window.__originalEditor',
      ),
    );
    return { examplesAccessible: true, editorPreserved: true };
  });

  await scenario(
    "pointer-cancel-and-forced-colors-stop-frame-loop",
    async () => {
      await h.load();
      await h.mouse("mouseMoved", 1100, 600);
      await sleep(100);
      await h.evaluate(
        "window.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'mouse' }))",
      );
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-rain').dataset.reacting || null",
        ),
        null,
      );
      await sleep(150);
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-rain').dataset.reacting || null",
        ),
        null,
      );
      await h.cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "forced-colors", value: "active" }],
      });
      await h.mouse("mouseMoved", 900, 500);
      await sleep(100);
      const before = await h.evaluate("window.__raf");
      await sleep(100);
      assert.equal(await h.evaluate("window.__raf"), before);
      await h.cdp.send("Emulation.setEmulatedMedia", { features: [] });
      return { cancelled: true, forcedColorsHasNoFollowerLoop: true };
    },
  );

  await scenario("blur-pauses-ambient-and-focus-resumes", async () => {
    await h.load();
    await h.evaluate("window.dispatchEvent(new Event('blur'))");
    await sleep(100);
    assert.equal(await h.sceneAnims("running"), 0);
    await h.evaluate("window.dispatchEvent(new Event('focus'))");
    await sleep(100);
    assert((await h.sceneAnims("running")) >= 3);
    return { pausedOnBlur: true, resumed: true };
  });

  await scenario("sky-and-text-clicks-do-not-spawn-water-ripples", async () => {
    await h.load();
    await h.evaluate(`(() => {
      window.__largestRing = 0;
      const original = CanvasRenderingContext2D.prototype.ellipse;
      window.__restoreEllipse = () => { CanvasRenderingContext2D.prototype.ellipse = original; };
      CanvasRenderingContext2D.prototype.ellipse = function(...a) {
        if(this.canvas.classList.contains('pc-rain')) window.__largestRing = Math.max(window.__largestRing, a[2]);
        return original.apply(this,a);
      };
    })()`);
    for (const [x, y] of [
      [1400, 180],
      [650, 290],
      [300, 380],
    ]) {
      await h.mouse("mousePressed", x, y, { button: "left", clickCount: 1 });
      await h.mouse("mouseReleased", x, y, { button: "left", clickCount: 1 });
      await sleep(280);
    }
    await sleep(500);
    const radius = await h.evaluate("window.__largestRing");
    await h.evaluate("window.__restoreEllipse()");
    assert(radius <= 26, `non-water click spawned a large ring ${radius}`);
    return { nonWaterRipples: 0 };
  });
} finally {
  await h.stop();
  const dir = join(REPO_ROOT, "docs/design/moonlit-ui/codex-results");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "takeover-checks.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
}
for (const s of results.scenarios) console.log(s.status, s.name, s.error ?? "");
process.exitCode = results.scenarios.some((s) => s.status !== "pass") ? 1 : 0;
