import { describe, expect, it } from "vitest";
import { AnalysisEventSchema, AnalysisResponseSchema } from "@poetry/contracts";
import { buildApp } from "../src/server.js";
import { loadResources } from "../src/resources.js";

const payload = {
  text: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
  rhymeBook: "pingshui",
  genreHint: "auto",
  formHint: "auto",
  ruleSet: "teaching-v1",
  readingOverrides: [],
};
describe("optional analysis NDJSON transport", () => {
  it("streams local readings and a complete validated final response", async () => {
    const app = buildApp({ readingAssistant: { apiKey: "" } });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/analyze",
        payload,
        headers: { accept: "application/x-ndjson, application/json" },
      });
      expect(response.headers["content-type"]).toContain(
        "application/x-ndjson",
      );
      const events = response.body
        .trim()
        .split("\n")
        .map((line) => AnalysisEventSchema.parse(JSON.parse(line)));
      expect(events.map((event) => event.type)).toEqual(["readings", "result"]);
      const json = await app.inject({
        method: "POST",
        url: "/api/v1/analyze",
        payload,
      });
      expect(json.headers["content-type"]).toContain("application/json");
      const final = events[1];
      if (final?.type === "result")
        expect(final.report).toEqual(AnalysisResponseSchema.parse(json.json()));
    } finally {
      await app.close();
    }
  });
  it("keeps invalid requests as ordinary HTTP422 before starting a stream", async () => {
    const app = buildApp({ readingAssistant: { apiKey: "" } });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/analyze",
        payload: {},
        headers: { accept: "application/x-ndjson" },
      });
      expect(response.statusCode).toBe(422);
      expect(response.headers["content-type"]).toContain("application/json");
    } finally {
      await app.close();
    }
  });
  it("encodes unavailable resources as a terminal error, never a preliminary success", async () => {
    const resources = loadResources();
    const app = buildApp({
      resources: { ...resources, loadErrors: ["受控资源不可用"] },
      readingAssistant: { apiKey: "" },
    });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/analyze",
        payload,
        headers: { accept: "application/x-ndjson" },
      });
      const event = AnalysisEventSchema.parse(JSON.parse(response.body));
      expect(event.type).toBe("error");
      if (event.type === "error") expect(event.status).toBe(503);
    } finally {
      await app.close();
    }
  });
});
