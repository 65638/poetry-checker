import { describe, expect, it, vi } from "vitest";
import {
  buildAnalyzeRequest,
  validateAnalysisResult,
} from "../src/api/analyze";
import { CheckerStore } from "../src/app/store";
import {
  ANALYSIS_SESSION_KEY,
  ANALYSIS_SESSION_TTL,
  connectAnalysisSession,
  decodeAnalysisSession,
  encodeAnalysisSession,
} from "../src/app/analysisSession";
import {
  deferred,
  loadMockScenario,
  scenarioDraft,
  scriptedTransport,
  okResponse,
} from "./fixtures";

const session = "12345678-1234-4234-8234-123456789abc";
const draft = scenarioDraft("pass");
const report = loadMockScenario("pass");
const complete = () => {
  const outcome = validateAnalysisResult(
    report,
    buildAnalyzeRequest(draft).request,
  );
  if (!outcome.ok) throw outcome.error;
  return { ...outcome, serverSession: session };
};
const ready = (id = session) =>
  new Response(JSON.stringify({ status: "ready" }), {
    headers: { "X-Poetry-Analysis-Session": id, "X-Poetry-Mode": "real" },
  });
function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}
describe("tab-scoped completed-analysis recovery", () => {
  it("round-trips the report and rejects changed instances, expired or damaged cache", () => {
    const raw = encodeAnalysisSession(session, complete(), 100);
    expect(decodeAnalysisSession(raw, session, 200)).toEqual(complete());
    expect(decodeAnalysisSession(raw, "another-service", 200)).toBeNull();
    expect(
      decodeAnalysisSession(raw, session, 100 + ANALYSIS_SESSION_TTL + 1),
    ).toBeNull();
    expect(decodeAnalysisSession(raw, session, 99)).toBeNull();
    expect(
      decodeAnalysisSession(
        raw.replace('"version":1', '"version":2'),
        session,
        200,
      ),
    ).toBeNull();
    const changed = complete();
    changed.request.text += "山";
    expect(
      decodeAnalysisSession(
        encodeAnalysisSession(session, changed, 100),
        session,
        200,
      ),
    ).toBeNull();
    const overridden = complete();
    overridden.request.readingOverrides = [
      { tokenId: "l99c1", readingId: "foreign" },
    ];
    expect(
      decodeAnalysisSession(
        encodeAnalysisSession(session, overridden, 100),
        session,
        200,
      ),
    ).toBeNull();
  });
  it("restores atomically without a model request or extending the cache lifetime", async () => {
    const port = storage(encodeAnalysisSession(session, complete(), 100));
    const transport = scriptedTransport([]);
    const store = new CheckerStore(draft, { transport });
    const dispose = connectAnalysisSession(store, {
      storage: port,
      fetcher: async () => ready(),
      now: () => 200,
    });
    await vi.waitFor(() =>
      expect(store.getState().restoredFromSession).toBe(true),
    );
    expect(store.getState().report).toEqual(report);
    expect(store.getState().requestSnapshot).toEqual(complete().request);
    expect(store.getState().stale).toBe(false);
    expect(port.setItem).not.toHaveBeenCalled();
    expect(transport.calls).toHaveLength(0);
    dispose();
  });
  it("does not overwrite edits made while readiness is pending", async () => {
    const pending = deferred<Response>();
    const store = new CheckerStore(draft, { transport: scriptedTransport([]) });
    const dispose = connectAnalysisSession(store, {
      storage: storage(encodeAnalysisSession(session, complete(), 100)),
      fetcher: () => pending.promise,
      now: () => 200,
    });
    store.setDraft({ ...draft, text: "新的诗稿。" });
    pending.resolve(ready());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.getState().report).toBeNull();
    expect(store.getState().draft.text).toBe("新的诗稿。");
    dispose();
  });
  it("uses the actual analysis-response instance even if readiness observed a different server", async () => {
    const reply = okResponse(report);
    reply.headers.set("X-Poetry-Analysis-Session", session);
    const port = storage();
    const store = new CheckerStore(draft, {
      transport: scriptedTransport([reply]),
    });
    const dispose = connectAnalysisSession(store, {
      storage: port,
      fetcher: async () => ready("99999999-1234-4234-8234-123456789abc"),
      now: () => 200,
    });
    await store.analyze();
    expect(port.setItem).toHaveBeenCalledTimes(1);
    expect(port.setItem.mock.calls[0]![0]).toBe(ANALYSIS_SESSION_KEY);
    expect(decodeAnalysisSession(port.getItem(), session, 200)?.report).toEqual(
      report,
    );
    dispose();
  });
  it("never restores over a new in-flight analysis, and storage failures do not lose the successful result", async () => {
    const pending = deferred<Response>();
    const reply = okResponse(report);
    reply.headers.set("X-Poetry-Analysis-Session", session);
    const store = new CheckerStore(draft, {
      transport: scriptedTransport([pending.promise]),
    });
    const initial = store.getState();
    const dispose = connectAnalysisSession(store, {
      storage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("full");
        },
      },
      fetcher: async () => ready(),
    });
    const analysis = store.analyze();
    expect(store.restoreCompletedAnalysis(complete(), initial)).toBe(false);
    pending.resolve(reply);
    await analysis;
    expect(store.getState().report).toEqual(report);
    expect(store.getState().restoredFromSession).toBe(false);
    dispose();
  });
  it("ignores legacy services without instance headers", async () => {
    const port = storage(encodeAnalysisSession(session, complete(), 100));
    const store = new CheckerStore(draft, {
      transport: scriptedTransport([okResponse(report)]),
    });
    const dispose = connectAnalysisSession(store, {
      storage: port,
      fetcher: async () => new Response('{"status":"ready"}'),
      now: () => 200,
    });
    await store.analyze();
    expect(port.setItem).not.toHaveBeenCalled();
    expect(store.getState().restoredFromSession).toBe(false);
    dispose();
  });
});
