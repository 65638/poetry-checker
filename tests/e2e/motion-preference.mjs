import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  startHarness,
  waitFor,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";

const out = resolve(process.argv[2] ?? "artifacts/motion-preference");
mkdirSync(out, { recursive: true });
const h = await startHarness({ production: true });
const results = { revision: revision(), checks: [], errors: [] };
h.cdp.on("Runtime.exceptionThrown", (event) =>
  results.errors.push(event.exceptionDetails.text),
);
const check = async (name, run) => {
  await run();
  results.checks.push(name);
  console.log("[PASS]", name);
};
try {
  await check(
    "preference-changed-before-subscription-is-reconciled",
    async () => {
      // Controlled timing: initial reads return false; by subscription the
      // preference is true, with no event available to the new subscriber.
      const { identifier } = await h.cdp.send(
        "Page.addScriptToEvaluateOnNewDocument",
        {
          source: `(() => {
        const match = window.matchMedia.bind(window);
        let reduced = false;
        window.matchMedia = (query) => {
          const media = match(query);
          if (query !== '(prefers-reduced-motion: reduce)') return media;
          Object.defineProperty(media, 'matches', { get: () => reduced });
          const subscribe = media.addEventListener.bind(media);
          media.addEventListener = (...args) => { reduced = true; subscribe(...args); };
          return media;
        };
      })();`,
        },
      );
      try {
        await h.load({ clear: false });
        assert.equal(
          await h.evaluate(
            "document.querySelector('.pc-workspace').dataset.motion",
          ),
          "off",
        );
        assert.equal(
          await h.evaluate(
            "document.querySelector('.pc-rain').dataset.running",
          ),
          "false",
        );
      } finally {
        await h.cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
          identifier,
        });
      }
    },
  );
  await check("live-system-change-stops-and-resumes-canvas", async () => {
    await h.load();
    await waitFor(() =>
      h.evaluate(
        "document.querySelector('.pc-rain')?.dataset.running === 'true'",
      ),
    );
    await h.media(true);
    await waitFor(() =>
      h.evaluate(
        "document.querySelector('.pc-workspace')?.dataset.motion === 'off'",
      ),
    );
    assert.equal(
      await h.evaluate("document.querySelector('.pc-rain').dataset.running"),
      "false",
    );
    await h.media(false);
    await waitFor(() =>
      h.evaluate(
        "document.querySelector('.pc-rain')?.dataset.running === 'true'",
      ),
    );
  });
  assert.deepEqual(results.errors, []);
} catch (error) {
  results.failure = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  await h.stop();
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
}
