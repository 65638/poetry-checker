import { describe, expect, it, vi } from "vitest";
import { analyze } from "../src/api/analyze";
import { CheckerStore } from "../src/app/store";
import {
  loadMockScenario,
  scenarioDraft,
  scriptedTransport,
  deferred,
  okResponse,
} from "./fixtures";

const report = loadMockScenario("pass");
const draft = scenarioDraft("pass");
const first = { type: "readings", poem: report.poem };
const last = { type: "result", report };
const encoder = new TextEncoder();
function response(events: unknown[], chunkSize = 65536) {
  const bytes = encoder.encode(
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
  );
  let offset = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, (offset += chunkSize)));
      },
    }),
    { headers: { "content-type": "application/x-ndjson; charset=utf-8" } },
  );
}
describe("progressive analysis ownership and completion", () => {
  it("handles split UTF-8, delivering local readings before committing the final report", async () => {
    const preview = vi.fn();
    const result = await analyze(
      draft,
      scriptedTransport([response([first, last], 17)]),
      [],
      undefined,
      preview,
    );
    expect(preview).toHaveBeenCalledExactlyOnceWith(report.poem);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report).toEqual(report);
  });
  it.each([
    [first],
    [first, first, last],
    [last, first],
    [last, last],
    [{ type: "result", report: {} }],
    [
      { type: "readings", poem: { ...report.poem, originalText: "另一首诗" } },
      last,
    ],
  ])("rejects incomplete/invalid/mixed streams %#", async (...events) => {
    const result = await analyze(draft, scriptedTransport([response(events)]));
    expect(result.ok).toBe(false);
  });
  it("preserves structured failure and never promotes the preliminary poem", async () => {
    const result = await analyze(
      draft,
      scriptedTransport([
        response([
          first,
          {
            type: "error",
            status: 503,
            body: {
              error: {
                code: "DATA_NOT_READY",
                message: "资料暂不可用",
                fieldErrors: [],
              },
            },
          },
        ]),
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("HTTP_503");
  });
  it("refuses foreign previews before notifying the caller", async () => {
    const preview = vi.fn();
    await analyze(
      draft,
      scriptedTransport([
        response([{ ...first, poem: loadMockScenario("fail").poem }, last]),
      ]),
      [],
      undefined,
      preview,
    );
    expect(preview).not.toHaveBeenCalled();
  });
  it("keeps the successful snapshot/export source separate while waiting and clears preview on cancel", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      }),
      {
        headers: { "content-type": "application/x-ndjson" },
      },
    );
    const store = new CheckerStore(draft, {
      transport: scriptedTransport([okResponse(report), stream]),
    });
    await store.analyze();
    const snapshot = store.getState().requestSnapshot;
    const completed = store.getState().report;
    const pending = store.analyze();
    controller.enqueue(encoder.encode(JSON.stringify(first) + "\n"));
    await vi.waitFor(() =>
      expect(store.getState().preliminaryPoem).not.toBeNull(),
    );
    expect(store.getState().report).toBe(completed);
    expect(store.getState().requestSnapshot).toBe(snapshot);
    store.cancelAnalysis();
    await pending;
    expect(store.getState().preliminaryPoem).toBeNull();
    expect(store.getState().report).toBe(completed);
    expect(store.getState().busy).toBe(false);
  });
  it("ignores late preliminary/final results after editing and permits a new request", async () => {
    const late = deferred<Response>();
    const store = new CheckerStore(draft, {
      transport: scriptedTransport([
        late.promise,
        okResponse(loadMockScenario("fail")),
      ]),
    });
    const pending = store.analyze();
    store.setDraft(scenarioDraft("fail"));
    await store.analyze();
    late.resolve(response([first, last]));
    await pending;
    expect(store.getState().preliminaryPoem).toBeNull();
    expect(store.getState().report?.inputHash).toBe(
      loadMockScenario("fail").inputHash,
    );
  });
  it("clears preview on an interrupted stream without replacing the prior success", async () => {
    const store = new CheckerStore(draft, {
      transport: scriptedTransport([okResponse(report), response([first])]),
    });
    await store.analyze();
    const previous = store.getState().report;
    await store.analyze();
    expect(store.getState().preliminaryPoem).toBeNull();
    expect(store.getState().report).toBe(previous);
    expect(store.getState().error).not.toBeNull();
  });
});
