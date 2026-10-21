import type { InputDraft } from "../view-contract.js";

/**
 * 示例入口：三首已批准固定正文。
 *
 * 正文来源与授权范围（不是"网上通行版"，是仓库内的已审记录）：
 * - 批准记录 `tests/golden/cases/{dengguanquelou,jingyesi,huanghelou}.json`，
 *   其 `reviewStatus = "approved"`，审查者为组长 J03（2026-10-18 电子裁定）
 *   与 C（文本及体裁来源核对，见 docs/rule-sources.md）。
 * - 作品元数据 `data/works/metadata.json` 给出 `approvedTextFingerprints`，
 *   由 `packages/genre` 的 `fingerprintText`（去标点空白、保留字形字序）判定。
 * - 语言证据 `ev:work:{dengguanquelou,jingyesi,huanghelou}:j03`。
 *
 * 边界（务必保持）：
 * 1. 只取**题名与正文**。不把来源报告、逐字审核表或证据正文打进前端包。
 * 2. 正文逐字照抄已批版本（含原标点），不简化、不改字、不做简繁转换。
 *    一致性由 `tests/examples.test.ts` 对照 golden 用例与 SHA-256 指纹强制。
 * 3. 三个示例的正文已含句读，`parseText` 把换行与句读都当句边界，
 *    因此这里不再手工插换行——照抄原文即可正确切成四句/八句。
 * 4. 审批只覆盖上述固定正文与体裁断言；**不代表全库发布已批准**。
 *    `/readyz` 仍可能因其他范围未审核而 503，那是发布门槛，不是"分析不可用"。
 */
export interface ExampleWork {
  id: string;
  title: string;
  author: string;
  /** 已批准固定正文：逐字取自 tests/golden/cases，正文内不插换行。 */
  text: string;
}

export const EXAMPLES: ExampleWork[] = [
  {
    id: "deng-guan-que-lou",
    title: "登鹳雀楼",
    author: "王之涣",
    // golden-dengguanquelou-ps-v1；指纹 33836d10…（wujue / applicable）
    text: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
  },
  {
    id: "jing-ye-si",
    title: "静夜思",
    author: "李白",
    // golden-jingyesi-ps-v1；指纹 9d68fef6…（ancient / not_applicable）
    text: "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
  },
  {
    id: "huang-he-lou",
    title: "黄鹤楼",
    author: "崔颢",
    // golden-huanghelou-ps-v1；指纹 7b65737c…（qilv / 特殊拗律）
    text: "昔人已乘黄鹤去，此地空余黄鹤楼。黄鹤一去不复返，白云千载空悠悠。晴川历历汉阳树，芳草萋萋鹦鹉洲。日暮乡关何处是，烟波江上使人愁。",
  },
];

/** 正文上限，与公共契约 AnalyzeRequestSchema 的 2,000 码点一致。 */
export const MAX_CODE_POINTS = 2000;

export const RHYME_BOOK_LABELS: Record<InputDraft["rhymeBook"], string> = {
  pingshui: "平水韵",
  cilin: "词林正韵",
  xinyun: "中华新韵",
};

export const FORM_LABELS: Record<string, string> = {
  auto: "自动",
  wujue: "五绝",
  qijue: "七绝",
  wulv: "五律",
  qilv: "七律",
};

export const GENRE_LABELS: Record<InputDraft["genreHint"], string> = {
  auto: "自动",
  regulated: "近体",
  ancient: "古体",
};

/** 古体与具体近体形式互斥：选择古体时把 formHint 归为 auto。 */
export function normalizeDraft(next: InputDraft): InputDraft {
  if (next.genreHint === "ancient" && next.formHint !== "auto") {
    return { ...next, formHint: "auto" };
  }
  return next;
}

/** 按 Unicode 码点计数，不按 UTF-16 码元。 */
export function codePointLength(text: string): number {
  return [...text].length;
}

/** 输入校验：返回给用户看的可恢复提示。 */
export function validateDraft(draft: InputDraft): string | null {
  if (draft.text.trim().length === 0) return "请先粘贴正文。";
  if (!/\p{Script=Han}/u.test(draft.text)) {
    return "正文必须包含汉字；标点、空格、字母不算有效内容。";
  }
  if (codePointLength(draft.text) > MAX_CODE_POINTS) {
    return `正文超长：当前 ${codePointLength(draft.text)} 个码点，上限 ${MAX_CODE_POINTS}。`;
  }
  if (draft.text.split("\n").length > 100) {
    return "诗句超过 100 行上限。";
  }
  return null;
}

/** 与某个报告是否对应当前草稿：原文、韵书、体裁与形式都要一致。 */
export function sameInput(
  draft: InputDraft,
  snapshot: InputDraft | null,
): boolean {
  if (snapshot === null) return false;
  return (
    draft.text === snapshot.text &&
    draft.rhymeBook === snapshot.rhymeBook &&
    draft.genreHint === snapshot.genreHint &&
    draft.formHint === snapshot.formHint
  );
}
