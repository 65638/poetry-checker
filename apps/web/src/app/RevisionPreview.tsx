import type { AnnotatedPoem, Revision } from "@poetry/contracts";
import { planRevision } from "./revisionPlan";
import "./revision-preview.css";

export function RevisionPreview({
  poem,
  currentText,
  accepted,
  edit,
}: {
  poem: AnnotatedPoem;
  currentText: string;
  accepted: Revision[];
  edit: Revision;
}) {
  let preview: ReturnType<typeof planRevision>;
  try {
    preview = planRevision(poem, currentText, accepted, edit);
  } catch (cause) {
    return (
      <p className="pc-studio-meta">
        {cause instanceof Error ? cause.message : "此建议暂时无法预览。"}
      </p>
    );
  }
  if (preview.text === currentText) return null;
  return (
    <details className="pc-revision-preview">
      <summary>试读整句</summary>
      <p>
        第 {preview.line} 句 ·{" "}
        {preview.beforeCount === preview.afterCount
          ? `${preview.afterCount} 字`
          : `${preview.beforeCount} 字 → ${preview.afterCount} 字`}
      </p>
      <dl>
        <dt>当前稿</dt>
        <dd>{preview.beforeLine}</dd>
        <dt>试改后</dt>
        <dd>{preview.afterLine}</dd>
      </dl>
      {preview.beforeCount !== preview.afterCount && (
        <p>句长会改变，采纳后请核对所用诗体。</p>
      )}
      <details>
        <summary>展开整首试稿</summary>
        <blockquote tabIndex={0} aria-label="尚未采纳的整首试稿">
          {preview.text}
        </blockquote>
      </details>
      <p>当前诗稿仍保留；采纳后可集中核对声律。</p>
    </details>
  );
}
