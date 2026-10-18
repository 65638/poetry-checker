/** 计算三首固定作品的正文指纹（E / D2）。输出 JSON，便于复制进 data/works。 */
import {
  fingerprintText,
  normalizeForFingerprint,
} from "../../../packages/genre/src/index.js";

const texts = {
  dengguanquelou: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
  "jingyesi-tang300": "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
  "jingyesi-songkan": "床前看月光，疑是地上霜。举头望山月，低头思故乡。",
  huanghelou:
    "昔人已乘黄鹤去，此地空余黄鹤楼。黄鹤一去不复返，白云千载空悠悠。晴川历历汉阳树，芳草萋萋鹦鹉洲。日暮乡关何处是，烟波江上使人愁。",
  "huanghelou-variant-first-line":
    "昔人已乘白云去，此地空余黄鹤楼。黄鹤一去不复返，白云千载空悠悠。晴川历历汉阳树，芳草萋萋鹦鹉洲。日暮乡关何处是，烟波江上使人愁。",
};

const out: Record<string, { chars: number; fingerprint: string }> = {};
for (const [key, text] of Object.entries(texts)) {
  out[key] = {
    chars: normalizeForFingerprint(text).length,
    fingerprint: fingerprintText(text),
  };
}
console.log(JSON.stringify(out, null, 2));
