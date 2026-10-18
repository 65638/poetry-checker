import { describe, expect, it } from "vitest";
import { LookupResultSchema, RhymeBooksResponseSchema } from "@poetry/contracts";
import { buildApp } from "../src/server.js";

// 真实模式（未设 POETRY_DEV_MOCK）：装载 A 的未审核样本快照，其余资源缺口如实呈现
const app = buildApp();

describe("HTTP 层·真实模式", () => {
  it("rhyme-books：平水报真实装载版本与韵部数；词林/新韵如实未装载，不编造 106/19/14", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/rhyme-books" });
    expect(res.statusCode).toBe(200);
    const parsed = RhymeBooksResponseSchema.parse(res.json());
    const byId = new Map(parsed.books.map((b) => [b.id, b]));
    expect(byId.get("pingshui")?.dataVersion).toContain("sample");
    expect((byId.get("pingshui")?.groupCount ?? 0)).toBeGreaterThan(0);
    expect(byId.get("pingshui")?.coverageNotice).toContain("未审核");
    expect(byId.get("cilin")?.dataVersion).toBe("not-loaded");
    expect(byId.get("cilin")?.groupCount).toBe(0);
    expect(byId.get("xinyun")?.dataVersion).toBe("not-loaded");
  });

  it("characters：样本字真实查询 200 且过 LookupResult Schema", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/characters/${encodeURIComponent("白")}?book=pingshui`,
    });
    expect(res.statusCode).toBe(200);
    const parsed = LookupResultSchema.parse(res.json());
    expect(parsed.entries[0]?.candidates.length ?? 0).toBeGreaterThan(0);
  });

  it("characters：多码点 422；非法 book 422；未装载书 503", async () => {
    const multi = await app.inject({
      method: "GET",
      url: `/api/v1/characters/${encodeURIComponent("白日")}?book=pingshui`,
    });
    expect(multi.statusCode).toBe(422);
    const badBook = await app.inject({
      method: "GET",
      url: `/api/v1/characters/${encodeURIComponent("白")}?book=guangyun`,
    });
    expect(badBook.statusCode).toBe(422);
    const unloaded = await app.inject({
      method: "GET",
      url: `/api/v1/characters/${encodeURIComponent("白")}?book=cilin`,
    });
    expect(unloaded.statusCode).toBe(503);
  });

  it("rules/sources：未装载目录中的未知 ID 返回 404（真实目录级判断）", async () => {
    const rule = await app.inject({ method: "GET", url: "/api/v1/rules/METER.POSITION" });
    expect(rule.statusCode).toBe(404);
    const src = await app.inject({ method: "GET", url: "/api/v1/sources/never-exists" });
    expect(src.statusCode).toBe(404);
  });

  it("readyz：四资源不齐 → 503 DATA_NOT_READY，列明缺口，不冒充 ready", async () => {
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("DATA_NOT_READY");
  });

  it("analyze：真实模式走编排（未审核证据按 B 门槛 503，HTTP 层语义一致）", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      payload: {
        text: "白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。",
        rhymeBook: "pingshui",
        genreHint: "auto",
        formHint: "auto",
        ruleSet: "teaching-v1",
        readingOverrides: [],
      },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("DATA_NOT_READY");
  });
});
