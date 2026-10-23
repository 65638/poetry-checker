import type { PoetryAssistantRequest } from "@poetry/contracts";
import "./task-request-preview.css";
import { StudyFollowUpContext } from "./StudyFollowUp";
import { comparisonSourceLabel } from "./comparisonPassages";

export function taskWaitLabel(input?: PoetryAssistantRequest | null): string {
  if (input?.task === "search") return "正在寻找契合意境的诗句…";
  if (input?.task === "compare")
    return input.revision ? "正在比较改稿前后的得失…" : "正在对照两首诗的表达…";
  if (input?.task === "rhyme") return "正在结合全诗筛选同韵字…";
  return input?.question ? "正在结合原诗回答你的问题…" : "正在研读…";
}

export function TaskRequestPreview({
  input,
}: {
  input: PoetryAssistantRequest;
}) {
  if (input.task === "search")
    return (
      <div className="pc-task-request-preview">
        <p>本次诗境：{input.query}</p>
      </div>
    );
  const texts =
    input.task === "compare" ? [input.left, input.right] : [input.text];
  return (
    <div className="pc-task-request-preview">
      <StudyFollowUpContext input={input} />
      {input.task === "compare" && input.scope && (
        <p>
          本次范围：左卷{comparisonSourceLabel(input.scope.left)}；右卷
          {comparisonSourceLabel(input.scope.right)}。仅按所选文字比较。
        </p>
      )}
      {input.task === "compare" && input.revision?.intention && (
        <p>修改意图：{input.revision.intention}</p>
      )}
      {(input.task === "critique" || input.task === "compare") &&
        input.question && <p>本次提问：{input.question}</p>}
      {texts.map((text, index) => (
        <details key={index}>
          <summary>
            {input.task === "compare"
              ? input.revision
                ? index === 0
                  ? "旧稿"
                  : "新稿"
                : `${index === 0 ? "左" : "右"}诗`
              : "本次原文"}{" "}
            · {text.slice(0, 28)}
            {text.length > 28 ? "…" : ""}
          </summary>
          <blockquote tabIndex={0}>{text}</blockquote>
        </details>
      ))}
    </div>
  );
}
