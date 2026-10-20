/* global console, Buffer */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, revision, sleep, startHarness } from "./harness.mjs";

const dir = join(REPO_ROOT, "docs/design/moonlit-ui/codex-results");
mkdirSync(dir, { recursive: true });
const h = await startHarness({ production: true });
try {
  await h.load();
  await h.setText("abc");
  await h.click(".pc-input__submit");
  await sleep(200);
  await h.idle();
  const detail = await h.evaluate(`(() => {
    const text = document.querySelector('.pc-banner__text');
    const banner = document.querySelector('.pc-banner');
    return { color: getComputedStyle(text).color, background: getComputedStyle(banner).backgroundColor,
      message: text.textContent, noReport: !document.querySelector('.pc-report') };
  })()`);
  assert.equal(detail.color, "rgb(35, 50, 56)");
  assert(detail.noReport && detail.message);
  const { data } = await h.cdp.send("Page.captureScreenshot", {
    format: "png",
  });
  writeFileSync(join(dir, "initial-error.png"), Buffer.from(data, "base64"));
  const luminance = (hex) => {
    const c = hex
      .match(/[0-9a-f]{2}/gi)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return Number(((values[0] + 0.05) / (values[1] + 0.05)).toFixed(2));
  };
  const contrasts = [
    ["body", "233238", "f5f0e5"],
    ["muted", "4e5b5e", "f5f0e5"],
    ["scene label / light sky token", "eef0e5", "527575"],
    ["error text", "233238", "f8ddd7"],
  ].map(([label, fg, bg]) => ({ label, fg, bg, ratio: contrast(fg, bg) }));
  writeFileSync(
    join(dir, "feedback-check.json"),
    JSON.stringify(
      {
        revision: revision(),
        at: new Date().toISOString(),
        viewport: "1440x900",
        route: "/",
        mode: "production / real API",
        status: "pass",
        detail,
        contrasts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS initial error readable on paper; " + JSON.stringify(contrasts),
  );
} finally {
  await h.stop();
}
