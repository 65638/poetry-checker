import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  startHarness,
  sleep,
  waitFor,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";
import { POEMS } from "../integration/e2e/d3-acceptance-api.mjs";

const out = resolve(process.argv[2] ?? "artifacts/nearby-notes");
mkdirSync(out, { recursive: true });
const h = await startHarness({ production: true });
const { evaluate, cdp } = h;
// Let sticky layout settle after test-driven scrolling before sending a real click.
const click = async (selector) => {
  await evaluate(
    `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',behavior:'instant'});true`,
  );
  await sleep(80);
  const rect = await box(selector);
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  await h.mouse("mouseMoved", x, y);
  await h.mouse("mousePressed", x, y, { button: "left", clickCount: 1 });
  await h.mouse("mouseReleased", x, y, { button: "left", clickCount: 1 });
};
const result = { revision: revision(), checks: [], errors: [] };
cdp.on("Runtime.exceptionThrown", (e) =>
  result.errors.push(e.exceptionDetails.text),
);
const shot = async (name) =>
  writeFileSync(
    join(out, name + ".png"),
    Buffer.from(
      (await cdp.send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
const box = (selector) =>
  evaluate(
    `(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; })()`,
  );
const check = async (name, run) => {
  await run();
  result.checks.push({ name, status: "pass" });
  console.log("[PASS]", name);
};
try {
  await h.load({ path: "#dictionary" });
  await check("dictionary-picker-beside-result-in-first-viewport", async () => {
    const picker = await box(".pc-dictionary__picker");
    const folio = await box(".pc-dictionary__folio");
    const slips = await box(".pc-dictionary__examples");
    assert.ok(Math.abs(picker.y - folio.y) < 2);
    assert.ok(
      picker.right < folio.x && slips.bottom < 850,
      JSON.stringify({ picker, folio, slips }),
    );
    await shot("dictionary");
    await click(".pc-dictionary__examples button");
    await waitFor(() =>
      evaluate("!!document.querySelector('.pc-dictionary__result')"),
    );
    await shot("dictionary-entry");
  });
  await check(
    "poem-characters-before-secondary-actions-and-beside-entry",
    async () => {
      await click(".pc-dictionary__passage summary");
      await sleep(450);
      await evaluate(`(() => {
      const ta=document.querySelector('.pc-dictionary__passage textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta,'明月松间照，清泉石上流。');
      ta.dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
      await waitFor(() =>
        evaluate(
          "document.querySelectorAll('.pc-dictionary__character-list button').length===10",
        ),
      );
      const chars = await box(".pc-dictionary__character-list");
      const batch = await box(".pc-dictionary__lookup-passage");
      assert.ok(chars.y < batch.y && chars.bottom < 850);
      assert.ok(
        await evaluate(
          "document.querySelector('.pc-dictionary__wordslips').hidden",
        ),
      );
      await click(".pc-dictionary__character-list button");
      await waitFor(() =>
        evaluate(
          "document.querySelector('.pc-dictionary__glyph')?.textContent==='明'",
        ),
      );
      await shot("dictionary-poem");
    },
  );
  await click('[aria-controls="checker-space"]');
  await waitFor(() => evaluate("!document.documentElement.dataset.journey"));
  await h.setText(POEMS.find((p) => p.id === "huanghelou").text);
  await h.analyze();
  await check("report-notes-start-beside-poem", async () => {
    await evaluate(
      "document.querySelector('.pc-report-workbench').scrollIntoView({block:'start'});true",
    );
    await sleep(300);
    const poem = await box(".pc-reading");
    const notes = await box(".pc-notes");
    assert.ok(
      notes.x > poem.x && Math.abs(notes.y - poem.y) < 26,
      JSON.stringify({ poem, notes }),
    );
    const wrapped =
      await evaluate(`Array.from(document.querySelectorAll('.pc-line')).some(line=>{
      const ys=Array.from(line.querySelectorAll('.pc-cell')).map(el=>el.getBoundingClientRect().top);
      return Math.max(...ys)-Math.min(...ys)>2;
    })`);
    assert.equal(wrapped, false);
    await shot("report");
  });
  await check("hover-reason-at-mark-and-dismiss-with-escape", async () => {
    const mark = await box(".pc-cell__reference");
    await h.mouse(
      "mouseMoved",
      mark.x + mark.width / 2,
      mark.y + mark.height / 2,
    );
    await waitFor(() =>
      evaluate("!!document.querySelector('.pc-reference__note:popover-open')"),
    );
    await sleep(180);
    const note = await box(".pc-reference__note");
    const marks = await box(
      ".pc-cell-wrap:has(.pc-cell__reference) .pc-cell__references",
    );
    assert.ok(
      note.x >= 0 && note.right <= 1440 && note.y >= 0 && note.bottom <= 900,
    );
    assert.ok(
      Math.min(
        Math.abs(note.y - marks.bottom),
        Math.abs(marks.y - note.bottom),
      ) < 12,
      JSON.stringify({ note, mark }),
    );
    assert.ok(
      await evaluate(
        "document.querySelector('.pc-reference__note p').textContent.length>5",
      ),
    );
    await shot("reason");
    await h.key("Escape", "Escape", 27);
    assert.equal(
      await evaluate("!!document.querySelector('.pc-reference__note')"),
      false,
    );
  });
  await check("keyboard-follows-exact-number-without-extra-link", async () => {
    await evaluate(
      "document.querySelector('.pc-cell__reference').focus();true",
    );
    await waitFor(() =>
      evaluate("!!document.querySelector('.pc-reference__note:popover-open')"),
    );
    await h.key("Tab", "Tab", 9);
    await sleep(900);
    assert.ok(
      await evaluate(
        "document.activeElement.matches('.pc-cell__reference') && document.activeElement.textContent.trim()==='6'",
      ),
    );
    await h.key("Enter", "Enter", 13, 0, "\r");
    assert.ok(
      await evaluate(
        "document.querySelector('.pc-finding--selected .pc-finding__no').textContent.trim()==='6' && !document.querySelector('.pc-reference__note button')",
      ),
    );
    const note = await box(".pc-finding--selected");
    const pane = await box(".pc-notes__body");
    assert.ok(
      Math.abs(note.y - pane.y - 8) < 3,
      JSON.stringify({ note, pane }),
    );
  });
  await check(
    "pointer-and-click-follow-1-6-without-page-scroll-or-obstruction",
    async () => {
      await h.key("Escape", "Escape", 27);
      const pageY = await evaluate("scrollY");
      await h.mouse("mouseMoved", 370, 20);
      const first =
        ".pc-cell-wrap:has(.pc-cell__reference) .pc-reference:first-child .pc-cell__reference";
      const second =
        ".pc-cell-wrap:has(.pc-cell__reference) .pc-reference:nth-child(2) .pc-cell__reference";
      const point = async (selector) => {
        const mark = await box(selector);
        await h.mouse(
          "mouseMoved",
          mark.x + mark.width / 2,
          mark.y + mark.height / 2,
        );
        await sleep(900);
        return mark;
      };
      await point(first);
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-finding--selected .pc-finding__no').textContent.trim()",
        ),
        "1",
      );
      const mark = await point(second);
      const x = mark.x + mark.width / 2,
        y = mark.y + mark.height / 2;
      assert.equal(
        await evaluate(
          `document.elementFromPoint(${x},${y}).closest('button')?.textContent.trim()`,
        ),
        "6",
      );
      await h.mouse("mousePressed", x, y, { button: "left", clickCount: 1 });
      await h.mouse("mouseReleased", x, y, { button: "left", clickCount: 1 });
      await sleep(900);
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-finding--selected .pc-finding__no').textContent.trim()",
        ),
        "6",
      );
      assert.equal(await evaluate("scrollY"), pageY);
      const item = await box(".pc-finding--selected");
      const pane = await box(".pc-notes__body");
      assert.ok(Math.abs(item.y - pane.y - 8) < 3);
      await shot("follow-six");
      await h.key("Escape", "Escape", 27);
      await click(".pc-finding--selected .pc-finding__locate");
      await sleep(900);
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-finding--selected .pc-finding__no').textContent.trim()",
        ),
        "6",
      );
      assert.ok(
        await evaluate("document.activeElement.matches('[data-token-id]')"),
      );
      await evaluate(
        "document.querySelector('.pc-report-workbench').scrollIntoView({block:'start',behavior:'instant'});true",
      );
      await sleep(150);
      await point(second);
      // Hover the character itself: use its first issue, with no keyboard-focus theft.
      await h.key("Escape", "Escape", 27);
      const focus = await evaluate("document.activeElement.textContent");
      await point(".pc-cell-wrap:has(.pc-cell__reference) .pc-cell");
      assert.equal(
        await evaluate(
          "document.querySelector('.pc-finding--selected .pc-finding__no').textContent.trim()",
        ),
        "1",
      );
      assert.equal(await evaluate("document.activeElement.textContent"), focus);
      assert.equal(await evaluate("scrollY"), pageY);
    },
  );
  await check("one-note-at-a-time-and-outside-click-dismissal", async () => {
    await click(".pc-cell__reference");
    const other = await box(".pc-reference:nth-child(2) .pc-cell__reference");
    await h.mouse(
      "mouseMoved",
      other.x + other.width / 2,
      other.y + other.height / 2,
    );
    await sleep(220);
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.pc-reference__note:popover-open').length",
      ),
      1,
    );
    const reading = await box(".pc-reading__head");
    await h.mouse("mousePressed", reading.x + 8, reading.y + 8, {
      button: "left",
      clickCount: 1,
    });
    await h.mouse("mouseReleased", reading.x + 8, reading.y + 8, {
      button: "left",
      clickCount: 1,
    });
    assert.equal(
      await evaluate("document.querySelectorAll('.pc-reference__note').length"),
      0,
    );
  });
  await check(
    "small-screens-keep-notes-above-poem-and-popover-on-screen",
    async () => {
      for (const width of [768, 375, 320]) {
        await h.viewport(width, 900);
        await evaluate(
          "document.querySelector('.pc-report-workbench').scrollIntoView({block:'start'});true",
        );
        await sleep(250);
        assert.ok(
          await evaluate("document.documentElement.scrollWidth<=innerWidth"),
          String(width),
        );
        const notes = await box(".pc-notes");
        const poem = await box(".pc-reading");
        assert.ok(
          notes.bottom <= poem.y && notes.height < 340,
          JSON.stringify({ width, notes, poem }),
        );
        await click(".pc-cell__reference");
        await waitFor(() =>
          evaluate(
            "!!document.querySelector('.pc-reference__note:popover-open')",
          ),
        );
        const tooltip = await box(".pc-reference__note");
        assert.ok(
          tooltip.x >= 0 && tooltip.right <= width && tooltip.bottom <= 900,
          JSON.stringify(tooltip),
        );
        await shot("report-" + width);
        await h.key("Escape", "Escape", 27);
      }
    },
  );
  await check("dictionary-mobile-header-and-character-picker", async () => {
    for (const width of [375, 320]) {
      await h.load({ path: "#dictionary", width, height: 900 });
      const title = await box(".pc-dictionary__title");
      assert.ok(title.x >= 0 && title.right <= width);
      assert.ok(
        await evaluate("document.documentElement.scrollWidth<=innerWidth"),
      );
      const slips = await box(".pc-dictionary__examples");
      assert.ok(slips.bottom < 900, JSON.stringify({ width, slips }));
      await shot("dictionary-" + width);
    }
  });
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.stack;
  await shot("failure");
  console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await h.stop();
}
