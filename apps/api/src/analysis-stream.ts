import { PassThrough } from "node:stream";
import type { FastifyReply } from "fastify";
import type { AnalysisEvent, AnalyzeRequest } from "@poetry/contracts";
import { analyze } from "./orchestrator.js";
import type { Resources } from "./resources.js";
import type { ReadingAssistantService } from "./reading-assistant.js";

/** Three bounded events at most; disconnect cancels the same model operation. */
export function streamAnalysis(
  reply: FastifyReply,
  request: AnalyzeRequest,
  resources: Resources,
  readingAssistant: ReadingAssistantService,
) {
  const stream = new PassThrough();
  const controller = new AbortController();
  const close = () => {
    if (!reply.raw.writableEnded) controller.abort();
    if (!stream.destroyed) stream.destroy();
  };
  reply.raw.once("close", close);
  const send = (event: AnalysisEvent) => {
    if (!controller.signal.aborted && !stream.destroyed)
      stream.write(`${JSON.stringify(event)}\n`);
  };
  void analyze(request, resources, {
    readingAssistant,
    signal: controller.signal,
    onReadings: (poem) => send({ type: "readings", poem }),
  }).then(
    (result) => {
      send(
        result.kind === "ok"
          ? { type: "result", report: result.response }
          : { type: "error", status: result.status, body: result.body },
      );
      stream.end();
    },
    () => {
      send({
        type: "error",
        status: 500,
        body: {
          error: {
            code: "INTERNAL_ERROR",
            message: "本次分析未能完成，请重试。",
            fieldErrors: [],
          },
        },
      });
      stream.end();
    },
  );
  return reply
    .header("Cache-Control", "no-store")
    .header("X-Accel-Buffering", "no")
    .type("application/x-ndjson; charset=utf-8")
    .send(stream);
}
