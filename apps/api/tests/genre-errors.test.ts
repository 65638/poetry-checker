import { describe, expect, it } from "vitest";
import { GENRE_ERROR_CODES, GenreError } from "@poetry/genre";
import {
  genreErrorStatus,
  toGenreErrorResponse,
} from "../src/genre-errors.js";

const EXPECTED_STATUS: Record<string, number> = {
  GENRE_BRANCH_PENDING: 503,
  GENRE_REQUEST_INVALID: 422,
};

describe("genre 错误码 HTTP 映射", () => {
  it("源码中的每个错误码都有显式映射，且绝不是 200", () => {
    for (const code of GENRE_ERROR_CODES) {
      expect(genreErrorStatus(code), `错误码 ${code} 未被映射到约定状态`).toBe(
        EXPECTED_STATUS[code],
      );
      expect(genreErrorStatus(code)).not.toBe(200);
    }
  });

  it("映射与源码声明一一对应（新增未映射码会使本测试失败）", () => {
    const declared = new Set<string>(GENRE_ERROR_CODES);
    for (const code of Object.keys(EXPECTED_STATUS)) {
      expect(declared.has(code), `EXPECTED_STATUS 含未声明的码 ${code}`).toBe(true);
    }
    expect(Object.keys(EXPECTED_STATUS)).toHaveLength(declared.size);
  });

  it("真实 GenreError 实例：未实现分支 → 503 + DATA_NOT_READY 错误体，branch 可定位", () => {
    const error = new GenreError(
      "GENRE_BRANCH_PENDING",
      "排律判定分支尚未实现",
      "pailv-template-match",
    );
    const mapped = toGenreErrorResponse(error);
    expect(mapped?.status).toBe(503);
    expect(mapped?.body.error.code).toBe("DATA_NOT_READY");
    expect(mapped?.body.error.message).toBe("GENRE_BRANCH_PENDING：排律判定分支尚未实现");
    expect(mapped?.body.error.fieldErrors).toEqual([
      { path: "branch", message: "pailv-template-match" },
      { path: "genreCode", message: "GENRE_BRANCH_PENDING" },
    ]);
  });

  it("真实 GenreError 实例：绕过校验 → 422，保留具体码", () => {
    const error = new GenreError("GENRE_REQUEST_INVALID", "genreHint 与 formHint 冲突");
    const mapped = toGenreErrorResponse(error);
    expect(mapped?.status).toBe(422);
    expect(mapped?.body.error.code).toBe("GENRE_REQUEST_INVALID");
    expect(mapped?.body.error.fieldErrors).toEqual([]);
  });

  it("未知前缀回退：GENRE_REQUEST_*→422、其余 GENRE_*→503、无前缀→500", () => {
    expect(genreErrorStatus("GENRE_REQUEST_FUTURE")).toBe(422);
    expect(genreErrorStatus("GENRE_FUTURE")).toBe(503);
    expect(genreErrorStatus("TOTALLY_UNKNOWN")).toBe(500);
  });

  it("非 GenreError 的异常不被该映射处理", () => {
    expect(toGenreErrorResponse(new Error("普通错误"))).toBeNull();
  });
});
