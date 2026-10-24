import { createHash, webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { browserId } from "../src/utils/browser";
import { digest } from "../src/app/library";

afterEach(() => vi.unstubAllGlobals());
it("公网HTTP缺少subtle及randomUUID时仍保持摘要一致、生成有效唯一ID", async () => {
  vi.stubGlobal("crypto", {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
  });
  for (const text of ["", "空山不见人。𠀀", "a".repeat(1000), "\ud800"]) {
    expect(await digest(text)).toBe(
      createHash("sha256").update(text).digest("hex"),
    );
  }
  const ids = Array.from({ length: 100 }, () => browserId());
  expect(new Set(ids).size).toBe(100);
  for (const id of ids)
    expect(id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,
    );
});
