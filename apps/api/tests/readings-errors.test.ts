import { describe, expect, it } from "vitest";
import {
  ReadingsError,
  READINGS_ERROR_CODES,
} from "@poetry/readings";
import {
  readingsErrorStatus,
  toReadingsErrorResponse,
} from "../src/readings-errors.js";

const EXPECTED_STATUS: Record<string, number> = {
  POEM_TOKEN_SLICE_MISMATCH: 500,
  POEM_TOKEN_DUPLICATE: 500,
  LOOKUP_ENTRY_DUPLICATE: 503,
  LOOKUP_CANDIDATE_CHARACTER_MISMATCH: 503,
  LOOKUP_CANDIDATE_BOOK_MISMATCH: 503,
  LOOKUP_CANDIDATE_DUPLICATE: 503,
  LOOKUP_EVIDENCE_UNKNOWN: 503,
  LOOKUP_EVIDENCE_UNVERIFIED: 503,
  OVERRIDE_DUPLICATE_TOKEN: 422,
  OVERRIDE_TOKEN_UNKNOWN: 422,
  OVERRIDE_READING_UNKNOWN: 422,
  CONTEXT_RULE_INVALID: 503,
  CONTEXT_RULE_STALE: 503,
  CONTEXT_RULES_PENDING: 503,
};

describe("readings 错误码 HTTP 映射", () => {
  it("源码中的每个错误码都有显式映射，且绝不是 200", () => {
    for (const code of READINGS_ERROR_CODES) {
      const status = readingsErrorStatus(code);
      expect(status, `错误码 ${code} 未被映射到约定状态`).toBe(
        EXPECTED_STATUS[code],
      );
      expect(status).not.toBe(200);
    }
  });

  it("映射覆盖了源码声明的全部错误码（新增未映射码会使本测试失败）", () => {
    const declared = new Set<string>(READINGS_ERROR_CODES);
    for (const code of Object.keys(EXPECTED_STATUS)) {
      expect(declared.has(code), `EXPECTED_STATUS 含未声明的码 ${code}`).toBe(
        true,
      );
    }
    expect(Object.keys(EXPECTED_STATUS)).toHaveLength(declared.size);
  });

  it("真实 ReadingsError 实例：每个源码错误码都映射到约定状态（非字符串回退）", () => {
    for (const code of READINGS_ERROR_CODES) {
      const error = new ReadingsError(code, `测试 ${code}`, {
        tokenId: "l1c1",
      });
      const mapped = toReadingsErrorResponse(error);
      expect(mapped, `错误码 ${code} 未被识别为 ReadingsError`).not.toBeNull();
      expect(mapped?.status, `错误码 ${code} 状态不符`).toBe(
        EXPECTED_STATUS[code],
      );
    }
  });

  it("保留码 CONTEXT_RULES_PENDING 映射为 503，不会被静默吞掉", () => {
    expect(readingsErrorStatus("CONTEXT_RULES_PENDING")).toBe(503);
  });

  it("503 族错误体对齐 DATA_NOT_READY 约定，readings 码保留在 message 与 fieldErrors", () => {
    const error = new ReadingsError(
      "LOOKUP_EVIDENCE_UNVERIFIED",
      "候选证据未审核",
      { character: "更" },
    );
    const mapped = toReadingsErrorResponse(error);
    expect(mapped?.status).toBe(503);
    expect(mapped?.body.error.code).toBe("DATA_NOT_READY");
    expect(mapped?.body.error.message).toBe(
      "LOOKUP_EVIDENCE_UNVERIFIED：候选证据未审核",
    );
    expect(mapped?.body.error.fieldErrors).toEqual([
      { path: "character", message: "更" },
      { path: "readingsCode", message: "LOOKUP_EVIDENCE_UNVERIFIED" },
    ]);
  });

  it("500 族错误体对齐 INTERNAL_ERROR 约定，readings 码保留在 message", () => {
    const error = new ReadingsError(
      "POEM_TOKEN_SLICE_MISMATCH",
      "token 区间切不回原文",
      { tokenId: "l2c4" },
    );
    const mapped = toReadingsErrorResponse(error);
    expect(mapped?.status).toBe(500);
    expect(mapped?.body.error.code).toBe("INTERNAL_ERROR");
    expect(mapped?.body.error.message).toBe(
      "POEM_TOKEN_SLICE_MISMATCH：token 区间切不回原文",
    );
    expect(mapped?.body.error.fieldErrors).toEqual([
      { path: "tokenId", message: "l2c4" },
    ]);
  });

  it("422 族保留具体 readings 码（选音类问题需要可区分）", () => {
    const error = new ReadingsError(
      "OVERRIDE_READING_UNKNOWN",
      "覆盖的候选不属于该字位",
      { tokenId: "l2c3", readingId: "rc-1" },
    );
    const mapped = toReadingsErrorResponse(error);
    expect(mapped?.status).toBe(422);
    expect(mapped?.body.error.code).toBe("OVERRIDE_READING_UNKNOWN");
    expect(mapped?.body.error.message).toBe("覆盖的候选不属于该字位");
    expect(mapped?.body.error.fieldErrors).toEqual([
      { path: "tokenId", message: "l2c3" },
      { path: "readingId", message: "rc-1" },
    ]);
  });

  it("未知前缀的新码按约定回退（OVERRIDE→422、LOOKUP/CONTEXT_RULE→503、POEM_TOKEN→500、其余→500）", () => {
    expect(readingsErrorStatus("OVERRIDE_FUTURE_CODE")).toBe(422);
    expect(readingsErrorStatus("LOOKUP_FUTURE_CODE")).toBe(503);
    expect(readingsErrorStatus("CONTEXT_RULE_FUTURE")).toBe(503);
    expect(readingsErrorStatus("POEM_TOKEN_FUTURE")).toBe(500);
    expect(readingsErrorStatus("TOTALLY_UNKNOWN")).toBe(500);
  });

  it("非 ReadingsError 的异常不被该映射处理", () => {
    expect(toReadingsErrorResponse(new Error("普通错误"))).toBeNull();
    expect(toReadingsErrorResponse("字符串")).toBeNull();
  });
});
