// Run: pnpm exec tsx tests/e2e/study-continuity.mjs [output-directory] [--source]
// Uses the real API/lexicon and a controlled model; this does not assess model quality.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { buildApp } from "../../apps/api/src/server.ts";
import {
  startHarness,
  waitFor,
  revision,
} from "../../docs/design/moonlit-ui/harness.mjs";

const production = !process.argv.includes("--source");
const out = resolve(
  process.argv.slice(2).find((argument) => !argument.startsWith("--")) ??
    "artifacts/continuous-improvement/study-continuity",
);
mkdirSync(out, { recursive: true });
const poem = "空山不见人，但闻人语响。返景入深林，复照青苔上。";
const firstQuestion = "请解释光线的作用。";
const followQuestion = "请继续解释声音的作用。";
const nextDraft = "这是等待期间写下的下一题。";
const answer = (question) => `受控回答：${question ?? "通篇观照"}`;
const requests = [];
let heldQuestion = null;
let releaseResponse = null;
const app = buildApp({
  readingAssistant: {
    provider: "deepseek",
    apiKey: "controlled-test-key",
    fetcher: async (_url, init) => {
      const input = JSON.parse(JSON.parse(init.body).messages[1].content);
      if (input.task === "critique" && input.question === heldQuestion)
        await new Promise((release) => {
          releaseResponse = release;
        });
      const output =
        input.task === "critique"
          ? {
              overview: answer(input.question),
              strengths: ["仅验证交互，不代表真实模型结论。"],
              revisions: [],
            }
          : {
              suggestions: input.targets.map((target) => ({
                tokenId: target.tokenId,
                candidateId: target.candidates[0].id,
                pronunciation: null,
                reason: "受控读音，仅测试交互。",
              })),
            };
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(output) },
            },
          ],
        }),
      );
    },
  },
});
app.addHook("preHandler", async (request) => {
  if (request.url === "/api/v1/poetry-assistant")
    requests.push(structuredClone(request.body));
});
const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
const h = await startHarness({
  production,
  api: { baseUrl, stop: () => app.close() },
});
const result = {
  revision: revision(),
  mode: `controlled-upstream-real-api-${production ? "production" : "source"}-browser`,
  realModelInference: false,
  checks: [],
  errors: [],
};
h.cdp.on("Runtime.exceptionThrown", (event) =>
  result.errors.push(
    event.exceptionDetails.exception?.description ??
      event.exceptionDetails.text,
  ),
);
async function check(name, run) {
  await run();
  result.checks.push({ name, status: "pass" });
  console.log("[PASS]", name);
}
async function key(key, code, windowsVirtualKeyCode, modifiers = 2) {
  for (const type of ["keyDown", "keyUp"])
    await h.cdp.send("Input.dispatchKeyEvent", {
      type,
      key,
      code,
      windowsVirtualKeyCode,
      modifiers,
    });
}
async function fill(selector, value) {
  await h.click(selector);
  await key("a", "KeyA", 65);
  await h.cdp.send("Input.insertText", { text: value });
}
async function holdAndSend(question) {
  heldQuestion = question;
  releaseResponse = null;
  await key("Enter", "Enter", 13);
  await waitFor(() => releaseResponse !== null);
  assert.equal(requests.at(-1).question, question);
}
function release() {
  heldQuestion = null;
  releaseResponse?.();
  releaseResponse = null;
}
const hasAnswer = (question) =>
  h.evaluate(
    `document.querySelector('.pc-poetry-review')?.textContent.includes(${JSON.stringify(answer(question))})`,
  );

try {
  await h.load({ path: "#checker", reduce: true });
  await h.setText(poem);
  await h.analyze();
  await waitFor(() => hasAnswer());

  await check(
    "nonempty-prosody-context-first-explicit-question-focuses-answer",
    async () => {
      const initial = requests.at(-1);
      assert.equal(initial.text, poem);
      assert(
        initial.prosodyContext.issues.length > 0,
        "An empty issue list would miss the schema key-order continuity regression",
      );
      result.issueCount = initial.prosodyContext.issues.length;
      await h.click(".pc-study-question > summary");
      await fill(".pc-study-question textarea", firstQuestion);
      await holdAndSend(firstQuestion);
      release();
      await waitFor(() => hasAnswer(firstQuestion));
      await waitFor(() =>
        h.evaluate(
          "document.activeElement === document.querySelector('.pc-poetry-review h3')",
        ),
      );
      assert.deepEqual(requests.at(-1).prosodyContext, initial.prosodyContext);
    },
  );

  await check(
    "follow-up-keeps-answer-and-field-while-model-is-pending",
    async () => {
      await h.click(".pc-study-follow-up > summary");
      await fill(".pc-study-follow-up textarea", followQuestion);
      await holdAndSend(followQuestion);
      assert.equal(await hasAnswer(firstQuestion), true);
      assert.equal(
        await h.evaluate(
          "!!document.querySelector('.pc-study-follow-up textarea')",
        ),
        true,
      );
      assert.equal(requests.at(-1).text, poem);
      assert(requests.at(-1).prosodyContext.issues.length > 0);
      assert.equal(
        requests.at(-1).followUp.turns.at(-1).question,
        firstQuestion,
      );
    },
  );

  await check(
    "new-answer-preserves-next-question-and-does-not-steal-typing-focus",
    async () => {
      const count = requests.length;
      await fill(".pc-study-follow-up textarea", nextDraft);
      assert.equal(
        requests.length,
        count,
        "Typing must not submit another request",
      );
      release();
      await waitFor(() => hasAnswer(followQuestion));
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-study-follow-up textarea').value",
        ),
        nextDraft,
      );
      assert.equal(
        await h.evaluate(
          "document.activeElement === document.querySelector('.pc-study-follow-up textarea')",
        ),
        true,
      );
      assert.equal(requests.length, count);
    },
  );

  await check(
    "preserved-draft-sends-explicitly-with-latest-context-and-focuses-answer",
    async () => {
      const count = requests.length;
      await holdAndSend(nextDraft);
      assert.equal(requests.length, count + 1);
      assert.equal(
        requests.at(-1).followUp.turns.at(-1).question,
        followQuestion,
      );
      assert.deepEqual(
        requests.at(-1).prosodyContext,
        requests[0].prosodyContext,
      );
      release();
      await waitFor(() => hasAnswer(nextDraft));
      await waitFor(() =>
        h.evaluate(
          "document.activeElement === document.querySelector('.pc-poetry-review h3')",
        ),
      );
      assert.equal(
        await h.evaluate(
          "document.querySelector('.pc-study-follow-up textarea').value",
        ),
        "",
      );
    },
  );
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = error.stack;
  process.exitCode = 1;
} finally {
  release();
  result.requestCount = requests.length;
  await h.stop();
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
}
