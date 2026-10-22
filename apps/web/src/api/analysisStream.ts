import { AnalysisEventSchema, type AnnotatedPoem } from "@poetry/contracts";
import { ApiError } from "./errors";

/** UTF-8 chunk boundaries are arbitrary. Never turn an unfinished stream into success. */
export async function readAnalysisStream(
  response: Response,
  onReadings: (poem: AnnotatedPoem) => void,
  signal?: AbortSignal,
): Promise<Response> {
  if (!response.body)
    throw new ApiError("BAD_JSON", "分析结果没有返回，请重试。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let bytes = 0;
  let seenReadings = false;
  let terminal: Response | undefined;
  const invalid = () =>
    new ApiError("BAD_SCHEMA", "分析结果传输不完整，请重试。原文已保留。");
  const consume = (line: string) => {
    if (!line.trim()) return;
    if (terminal) throw invalid();
    const event = AnalysisEventSchema.safeParse(JSON.parse(line));
    if (!event.success) throw invalid();
    const data = event.data;
    if (data.type === "readings") {
      if (seenReadings) throw invalid();
      seenReadings = true;
      onReadings(data.poem);
    } else {
      terminal = new Response(
        JSON.stringify(data.type === "result" ? data.report : data.body),
        {
          status: data.type === "result" ? 200 : data.status,
          headers: { "content-type": "application/json" },
        },
      );
    }
  };
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16 * 1024 * 1024) throw invalid();
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!terminal) throw invalid();
    return terminal;
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
