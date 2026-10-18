import type { InputDraft } from "../view-contract";

/**
 * 示例入口。正文必须来自审核案例；当前尚无审核通过的版本，
 * 因此占位为空字符串，并在 UI 里标注「待 E 的来源/版本核对」。
 * 不把合成 fixture 挂上《登鹳雀楼》《静夜思》《黄鹤楼》的名字。
 */
export const EXAMPLES: Array<{ id: string; title: string; text: string }> = [
  { id: "deng-guan-que-lou", title: "登鹳雀楼", text: "" },
  { id: "jing-ye-si", title: "静夜思", text: "" },
  { id: "huang-he-lou", title: "黄鹤楼", text: "" },
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
