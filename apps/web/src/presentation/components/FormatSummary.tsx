import type { AnalysisResponse } from "@poetry/contracts";
import { FORM_LABEL, rootCauseChecks } from "../../app/reportView";

export function FormatSummary({ report }: { report: AnalysisResponse }) {
  const format = report.prosody.format;
  if (!format) return null;
  const { shape, start, firstLineRhyme: rhyme } = format;
  const second = report.poem.tokens.find((t) => t.tokenId === start.tokenId);
  const groupNames = rhyme.evenLineGroupIds.map(
    (id) => report.provenance.groups.find((g) => g.id === id)?.name ?? id,
  );
  const problems = rootCauseChecks(report).filter(
    (c) => c.status === "fail",
  ).length;
  const pending = report.prosody.checks.filter(
    (c) => c.status === "uncertain",
  ).length;
  return (
    <section className="pc-format" aria-label="格式识别">
      <dl className="pc-format__items">
        <div>
          <dt>形制</dt>
          <dd>
            {shape.width === 5 ? "五" : "七"}言
            {shape.lineCount === 4 ? "四" : "八"}句 · {FORM_LABEL[shape.formId]}
            形制
          </dd>
        </div>
        <div>
          <dt>起式</dt>
          <dd>
            {start.value === null
              ? "待确认"
              : start.value === "ping"
                ? "平起"
                : "仄起"}
          </dd>
          {start.value && second && (
            <p>
              第二字「{second.text}」为{start.value === "ping" ? "平" : "仄"}声
            </p>
          )}
        </div>
        <div>
          <dt>首句用韵</dt>
          <dd>
            {rhyme.value === "rhymed"
              ? "入韵参考"
              : rhyme.value === "unrhymed"
                ? "不入韵参考"
                : "待确认"}
          </dd>
          <p>
            偶数句韵部：
            {groupNames.length
              ? groupNames.join("、")
              : rhyme.evenLineStatus === "different"
                ? "不一致"
                : "未定"}
            {groupNames.length > 0 && rhyme.evenLineStatus === "unknown"
              ? "（候选）"
              : ""}
          </p>
        </div>
        <div>
          <dt>共同检查</dt>
          <dd>
            {problems}处问题 · {pending}项未确定
          </dd>
        </div>
      </dl>
      {start.alternativeReason && (
        <p className="pc-format__alternative" role="status">
          {start.alternativeReason}
        </p>
      )}
      <details className="pc-format__basis">
        <summary>识别依据</summary>
        <p>{shape.description}</p>
        <p>{start.reason}</p>
        <p>{rhyme.reason}</p>
        <p>
          首句实际归部：
          {rhyme.observed === "shared"
            ? "与偶数句有共同韵部"
            : rhyme.observed === "different"
              ? "与偶数句共同韵部不同"
              : "尚未确定"}
          。
        </p>
      </details>
    </section>
  );
}
