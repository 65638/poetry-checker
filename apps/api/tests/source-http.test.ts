import { afterAll, describe, expect, it } from "vitest";
import { SourceResponseSchema, ErrorResponseSchema } from "@poetry/contracts";
import { buildApp } from "../src/server.js";
import { loadResources } from "../src/resources.js";

const resources = loadResources();
const app = buildApp({ resources });
afterAll(async () => {
  await app.close();
});
describe("real source lookup serves loaded provenance without approving data", () => {
  it("round-trips every registered source with exactly its evidence and original review status", async () => {
    expect(resources.sourceRegistry.length).toBeGreaterThan(0);
    for (const source of resources.sourceRegistry) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sources/${encodeURIComponent(source.id)}`,
      });
      expect(response.statusCode, source.id).toBe(200);
      const parsed = SourceResponseSchema.parse(response.json());
      expect(parsed.source).toEqual(source);
      expect(parsed.evidence).toEqual(
        resources.evidenceRegistry.filter(
          (item) => item.sourceId === source.id,
        ),
      );
    }
    expect(
      (await app.inject({ method: "GET", url: "/readyz" })).statusCode,
    ).toBe(503);
  });
  it("unknown sources remain 404 and load conflicts remain blocked", async () => {
    const unknown = await app.inject({
      method: "GET",
      url: "/api/v1/sources/no-such-source",
    });
    expect(unknown.statusCode).toBe(404);
    expect(ErrorResponseSchema.parse(unknown.json()).error.code).toBe(
      "NOT_FOUND",
    );
    const broken = buildApp({
      resources: { ...resources, loadErrors: ["test-only source conflict"] },
    });
    try {
      const response = await broken.inject({
        method: "GET",
        url: `/api/v1/sources/${encodeURIComponent(resources.sourceRegistry[0]!.id)}`,
      });
      expect(response.statusCode).toBe(503);
      expect(ErrorResponseSchema.parse(response.json()).error.code).toBe(
        "DATA_NOT_READY",
      );
    } finally {
      await broken.close();
    }
  });
});
