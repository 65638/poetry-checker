import { describe, expect, it } from "vitest";
import { LexiconError } from "@poetry/lexicon";
import { lexiconErrorStatus, toLexiconErrorResponse } from "../src/lexicon-errors.js";

// A 的错误码是类型联合（无运行时数组）；穷尽性由 lexicon-errors.ts 的
// Record<LexiconErrorCode, number> 在编译期强制——新增码而映射未更新时 typecheck 直接红。
const EXPECTED: Record<string, number> = {
  LEXICON_INVALID_INPUT: 422,
  LEXICON_BOOK_MISMATCH: 422,
  LEXICON_VERSION_NOT_FOUND: 503,
  LEXICON_DUPLICATE_ID: 500,
  LEXICON_REFERENCE_UNRESOLVED: 500,
  LEXICON_INVALID_RESULT: 500,
};

describe("lexicon 错误码 HTTP 映射", () => {
  it("每个已声明错误码都有显式映射且非 200（穷尽性由编译期 Record 强制）", () => {
    for (const [code, status] of Object.entries(EXPECTED)) {
      expect(lexiconErrorStatus(code)).toBe(status);
      expect(lexiconErrorStatus(code)).not.toBe(200);
    }
  });
  it("真实实例：参数类 422 保留具体码；版本未就绪 503 DATA_NOT_READY；数据损坏 500", () => {
    const p = toLexiconErrorResponse(new LexiconError("LEXICON_INVALID_INPUT", "参数非法"));
    expect(p?.status).toBe(422);
    expect(p?.body.error.code).toBe("LEXICON_INVALID_INPUT");
    const v = toLexiconErrorResponse(new LexiconError("LEXICON_VERSION_NOT_FOUND", "版本未注册"));
    expect(v?.status).toBe(503);
    expect(v?.body.error.code).toBe("DATA_NOT_READY");
    expect(v?.body.error.fieldErrors).toEqual([{ path: "lexiconCode", message: "LEXICON_VERSION_NOT_FOUND" }]);
    const d = toLexiconErrorResponse(new LexiconError("LEXICON_DUPLICATE_ID", "重复 ID"));
    expect(d?.status).toBe(500);
    expect(d?.body.error.code).toBe("INTERNAL_ERROR");
  });
  it("前缀回退与非 LexiconError 不处理", () => {
    expect(lexiconErrorStatus("LEXICON_INVALID_FUTURE")).toBe(422);
    expect(lexiconErrorStatus("LEXICON_VERSION_FUTURE")).toBe(503);
    expect(lexiconErrorStatus("LEXICON_CORRUPT_FUTURE")).toBe(500);
    expect(toLexiconErrorResponse(new Error("普通"))).toBeNull();
  });
});
