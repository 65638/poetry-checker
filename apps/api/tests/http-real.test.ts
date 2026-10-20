import { describe, expect, it } from "vitest";
import {
  LookupResultSchema,
  ErrorResponseSchema,
  VersionsSchema,
  RhymeBooksResponseSchema,
} from "@poetry/contracts";
import { buildApp } from "../src/server.js";
import { loadResources } from "../src/resources.js";
import { AnalysisResponseSchema } from "@poetry/contracts";

// 诗文以数组拼接构造，源文件不含任何反斜杠转义
const POEM_LINES = ["白日依山尽，黄河入海流。", "欲穷千里目，更上一层楼。"];
const POEM = POEM_LINES.join(String.fromCharCode(10));

const app = buildApp();

describe("HTTP 层·真实模式（A 全量数据，manifest 装载）", () => {
  it("rhyme-books：三库主部 106/19/14，子卷另计，未审核如实标注", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/rhyme-books" });
    expect(res.statusCode).toBe(200);
    const parsed = RhymeBooksResponseSchema.parse(res.json());
    const byId = new Map(parsed.books.map((b) => [b.id, b]));
    expect(byId.get("pingshui")?.groupCount).toBe(106);
    expect(byId.get("cilin")?.groupCount).toBe(19);
    expect(byId.get("xinyun")?.groupCount).toBe(14);
    expect(byId.get("cilin")?.coverageNotice).toContain("33");
    expect(byId.get("xinyun")?.coverageNotice).toContain("56");
  });

  it("manifest 不注册报告文件；来源冲突已消除（A 按库拆分 ID，474afd9）", () => {
    const r = loadResources();
    expect(JSON.stringify(r.snapshots)).not.toContain("works-coverage");
    expect(r.loadErrors).toEqual([]);
  });

  it("characters：三库单码点真查 200 过 Schema", async () => {
    for (const [ch, book] of [
      ["白", "pingshui"],
      ["流", "cilin"],
      ["一", "xinyun"],
    ] as const) {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/characters/${encodeURIComponent(ch)}?book=${book}`,
      });
      expect(res.statusCode, `${ch}/${book}`).toBe(200);
      expect(() => LookupResultSchema.parse(res.json())).not.toThrow();
    }
  });

  it("characters：多码点 422；非法 book 422", async () => {
    const two = POEM_LINES[0]!.slice(0, 2);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/characters/${encodeURIComponent(two)}?book=pingshui`,
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/characters/${encodeURIComponent("白")}?book=guangyun`,
        })
      ).statusCode,
    ).toBe(422);
  });

  it("rules：运行卡可查 200；sources：未知 404、已知可追溯", async () => {
    const meter = await app.inject({
      method: "GET",
      url: "/api/v1/rules/METER.POSITION",
    });
    expect(meter.statusCode).toBe(200);
    expect(meter.json().rule.id).toBe("METER.POSITION");
    expect(meter.json().evidence.length).toBeGreaterThan(0);
    const known = loadResources().sourceRegistry[0]?.id;
    if (known !== undefined) {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/sources/${encodeURIComponent(known)}`,
      });
      expect([200, 503]).toContain(res.statusCode);
    }
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/sources/never-exists" }))
        .statusCode,
    ).toBe(404);
  });

  it("readyz：全库未审核与规则部分依据 → 503 列明缺口", async () => {
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(503);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe(
      "DATA_NOT_READY",
    );
    expect(res.headers["x-poetry-mode"]).toBe("real");
    const versions = VersionsSchema.parse(
      JSON.parse(decodeURIComponent(String(res.headers["x-poetry-versions"]))),
    );
    for (const book of ["pingshui", "cilin", "xinyun"])
      expect(versions.data).toContain(`${book}=`);
    expect(versions.rules).toBe("teaching-v1+reviewed-works-v1");
  });

  it("analyze：平水已审范围返回 200，词林与新韵仍受证据门槛约束", async () => {
    for (const book of ["pingshui", "cilin", "xinyun"] as const) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/analyze",
        payload: {
          text: POEM,
          rhymeBook: book,
          genreHint: "auto",
          formHint: "auto",
          ruleSet: "teaching-v1",
          readingOverrides: [],
        },
      });
      if (book === "pingshui") {
        expect(res.statusCode, book).toBe(200);
        expect(AnalysisResponseSchema.parse(res.json()).summary.status).toBe(
          "pass",
        );
      } else {
        expect(res.statusCode, book).toBe(503);
        expect(res.json().error.code).toBe("DATA_NOT_READY");
      }
    }
  });

  it("真实已审字形能走完分析返回200；这不是三首名篇验收", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/analyze",
      payload: {
        text: "白一更流楼雪物",
        rhymeBook: "pingshui",
        genreHint: "auto",
        formHint: "auto",
        ruleSet: "teaching-v1",
        readingOverrides: [],
      },
    });
    expect(res.statusCode).toBe(200);
    const report = AnalysisResponseSchema.parse(res.json());
    expect(report.poem.tokens).toHaveLength(7);
    expect(report.summary.status).toBe("unsupported");
    expect(report.provenance.rules).toHaveLength(10);
    expect(report.policy.notice).toContain("全库审核尚未完成");
    expect(
      report.poem.tokens.find((token) => token.text === "更")?.readingStatus,
    ).toBe("ambiguous");
  });
});
