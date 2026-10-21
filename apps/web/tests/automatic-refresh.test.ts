import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckerStore } from "../src/app/store";
import {
  deferred,
  errorResponse,
  loadMockScenario,
  okResponse,
  scenarioDraft,
  unabortableTransport,
} from "./fixtures";

const delay = 1500;
const original = scenarioDraft("pass");
const revised = scenarioDraft("fail");
const stores: CheckerStore[] = [];

function setup(script: Array<Response | Promise<Response>>) {
  vi.useFakeTimers();
  const transport = unabortableTransport(script);
  const download = vi.fn();
  const store = new CheckerStore(original, {
    transport,
    download,
    autoAnalyzeDelayMs: delay,
  });
  stores.push(store);
  return { store, transport, download };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.abort();
  vi.useRealTimers();
});

describe("editing an existing analysis updates after a pause", () => {
  it("holds adopted edits and further typing until one manual analysis", async () => {
    const { store, transport } = setup([
      okResponse(loadMockScenario("pass")),
      okResponse(loadMockScenario("fail")),
      okResponse(loadMockScenario("pass")),
    ]);
    await store.analyze();
    store.setDraft({ ...original, text: original.text + "字" });
    store.setDraft(revised, { autoAnalyze: false });
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(transport.calls).toHaveLength(1);
    expect(store.getState().stale).toBe(true);
    expect(store.getState().report?.poem.originalText).toBe(original.text);
    store.setDraft({ ...revised, text: revised.text + "字" });
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(transport.calls).toHaveLength(1);
    store.setDraft(revised, { autoAnalyze: false });
    await store.analyze();
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(transport.calls).toHaveLength(2);
    expect(store.getState().stale).toBe(false);
    store.setDraft(original);
    await vi.advanceTimersByTimeAsync(delay);
    expect(transport.calls).toHaveLength(3);
  });

  it("cancels a pending refresh even when adoption leaves the draft unchanged", async () => {
    const { store, transport } = setup([okResponse(loadMockScenario("pass"))]);
    await store.analyze();
    store.setDraft(revised);
    store.setDraft(revised, { autoAnalyze: false });
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(transport.calls).toHaveLength(1);
  });

  it("does not analyze initial typing until the first manual submission", async () => {
    const { store, transport } = setup([]);
    store.setDraft(revised);
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(transport.calls).toHaveLength(0);
  });

  it("coalesces edits, keeps the previous report readable and exports only the updated snapshot", async () => {
    const { store, transport, download } = setup([
      okResponse(loadMockScenario("pass")),
      okResponse(loadMockScenario("fail")),
    ]);
    await store.analyze();
    const oldReport = store.getState().report;
    store.setDraft({ ...revised, text: revised.text + "字" });
    await vi.advanceTimersByTimeAsync(1000);
    store.setDraft(revised);
    await vi.advanceTimersByTimeAsync(1499);
    expect(transport.calls).toHaveLength(1);
    expect(store.getState().report).toBe(oldReport);
    expect(store.getState().stale).toBe(true);
    store.downloadReport();
    expect(download).not.toHaveBeenCalled();
    store.selectToken(oldReport!.poem.tokens[0]!.tokenId);
    expect(store.getState().selectedTokenId).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.calls).toHaveLength(2);
    expect(store.getState().stale).toBe(false);
    expect(store.getState().requestSnapshot?.text).toBe(revised.text);
    expect(store.getState().report?.poem.originalText).toBe(revised.text);
    store.downloadReport();
    expect(download).toHaveBeenCalledOnce();
    expect(JSON.parse(download.mock.calls[0]![1]).request.text).toBe(
      revised.text,
    );
  });

  it("reading selections and unchanged draft notifications do not trigger or postpone requests", async () => {
    const { store, transport } = setup([
      okResponse(loadMockScenario("pass")),
      okResponse(loadMockScenario("fail")),
    ]);
    await store.analyze();
    store.selectToken(store.getState().report!.poem.tokens[0]!.tokenId);
    store.closeEvidence();
    store.setDraft({ ...original });
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(transport.calls).toHaveLength(1);
    store.setDraft(revised);
    await vi.advanceTimersByTimeAsync(1000);
    store.setDraft({ ...revised });
    await vi.advanceTimersByTimeAsync(500);
    expect(transport.calls).toHaveLength(2);
  });

  it("restoring the analyzed input cancels the pending refresh", async () => {
    const { store, transport } = setup([okResponse(loadMockScenario("pass"))]);
    await store.analyze();
    store.setDraft(revised);
    store.setDraft(original);
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(transport.calls).toHaveLength(1);
    expect(store.getState().stale).toBe(false);
  });

  it("manual submission cancels the scheduled duplicate request", async () => {
    const { store, transport } = setup([
      okResponse(loadMockScenario("pass")),
      okResponse(loadMockScenario("fail")),
    ]);
    await store.analyze();
    store.setDraft(revised);
    await store.analyze();
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(transport.calls).toHaveLength(2);
    expect(store.getState().stale).toBe(false);
  });

  it("does not send invalid drafts or repeatedly retry a failed refresh", async () => {
    const { store, transport } = setup([
      okResponse(loadMockScenario("pass")),
      errorResponse("INTERNAL_ERROR", "controlled failure", 500),
    ]);
    await store.analyze();
    store.setDraft({ ...original, text: "" });
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(transport.calls).toHaveLength(1);
    store.setDraft(revised);
    await vi.advanceTimersByTimeAsync(delay);
    expect(store.getState().error).not.toBeNull();
    await vi.advanceTimersByTimeAsync(delay * 5);
    expect(transport.calls).toHaveLength(2);
    expect(store.getState().report?.poem.originalText).toBe(original.text);
    expect(store.getState().stale).toBe(true);
  });

  it("cancellation removes a scheduled refresh", async () => {
    const { store, transport } = setup([okResponse(loadMockScenario("pass"))]);
    await store.analyze();
    store.setDraft(revised);
    store.abort();
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(transport.calls).toHaveLength(1);
  });

  it("ignores an automatic response arriving after the user restores the old input", async () => {
    const pending = deferred<Response>();
    const { store, transport } = setup([
      okResponse(loadMockScenario("pass")),
      pending.promise,
    ]);
    await store.analyze();
    store.setDraft(revised);
    await vi.advanceTimersByTimeAsync(delay);
    expect(store.getState().busy).toBe(true);
    store.setDraft(original);
    expect(transport.calls[1]!.signal?.aborted).toBe(true);
    pending.resolve(okResponse(loadMockScenario("fail")));
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(store.getState().busy).toBe(false);
    expect(store.getState().stale).toBe(false);
    expect(store.getState().report?.poem.originalText).toBe(original.text);
    expect(transport.calls).toHaveLength(2);
  });
});
