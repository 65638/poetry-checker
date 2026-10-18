/**
 * 正文指纹（D2 / 队员 E）。
 *
 * 约定（docs/team/15 第 4 节 + 附录）：去标点与空白、保留字形字序，求 SHA-256。
 * 不做简繁转换、不做异文归并——异文与简繁版本必须各自登记。
 */
import { createHash } from "node:crypto";

const HAN = /\p{Script=Han}/u;

/** 是否汉字（与解析侧同一判定，避免跨包依赖）。 */
export function isHanCharacter(char: string): boolean {
  return HAN.test(char);
}

/** 规范化：只保留汉字，去掉标点、空白与其他字符，顺序不变。 */
export function normalizeForFingerprint(text: string): string {
  let normalized = "";
  for (const char of text) {
    if (HAN.test(char)) normalized += char;
  }
  return normalized;
}

/** 正文指纹：规范化后的 SHA-256 小写十六进制。 */
export function fingerprintText(text: string): string {
  return createHash("sha256")
    .update(normalizeForFingerprint(text), "utf8")
    .digest("hex");
}
