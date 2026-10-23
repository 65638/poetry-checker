import { useMemo, useState } from "react";
import type { InputDraft } from "../view-contract";
import type { NotebookEntry } from "./notebook";
import { usePoetryTask } from "../hooks/usePoetryTask";
import { StudioTaskState } from "../presentation/components/StudioControls";
import { StudyResultActions } from "./StudyResultActions";
import { StudyProse } from "./StudyProse";
import {
  buildDraftComparison,
  draftComparisonChoices,
} from "./draftComparisonRequest";
import { notebookChanges } from "./notebookDiff";
import "./draft-comparison.css";

export function DraftComparison({
  draft,
  entries,
}: {
  draft: InputDraft;
  entries: NotebookEntry[];
}) {
  const choices = useMemo(
    () => draftComparisonChoices(draft, entries),
    [draft, entries],
  );
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [intention, setIntention] = useState("");
  const before = choices.find((choice) => choice.id === beforeId) ?? choices[1];
  const after = choices.find((choice) => choice.id === afterId) ?? choices[0];
  const identity = JSON.stringify([before?.text, after?.text, intention]);
  const task = usePoetryTask(identity);
  const [error, setError] = useState("");
  const invalid =
    !before ||
    !after ||
    before.text.trim() === after.text.trim() ||
    before.text.length > 2000 ||
    after.text.length > 2000;
  const changes =
    before && after
      ? notebookChanges(before.text, after.text).filter(
          (change) => change.kind !== "same",
        )
      : [];
  const input = task.resultInput?.task === "compare" ? task.resultInput : null;
  const result = task.result?.task === "compare" ? task.result : null;
  return (
    <details className="pc-draft-comparison">
      <summary>改稿对照 · 看看修改的得失</summary>
      <p>从推敲笺挑出两版，结合全诗比较表达。选稿和输入意图不会调用 AI。</p>
      {choices.length < 2 ? (
        <p>目前只有一版文字。修改后存一笺，便可对照旧稿与新稿。</p>
      ) : (
        <>
          <div className="pc-draft-comparison__selectors">
            <label>
              旧稿
              <select
                aria-label="对照旧稿"
                value={before?.id ?? ""}
                onChange={(event) => {
                  setBeforeId(event.target.value);
                  setError("");
                }}
              >
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label} · {choice.text.slice(0, 12)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              新稿
              <select
                aria-label="对照新稿"
                value={after?.id ?? ""}
                onChange={(event) => {
                  setAfterId(event.target.value);
                  setError("");
                }}
              >
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label} · {choice.text.slice(0, 12)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="pc-draft-comparison__versions">
            <div>
              <h4>旧稿</h4>
              <blockquote role="region" tabIndex={0} aria-label="旧稿全文">
                {before?.text}
              </blockquote>
            </div>
            <div>
              <h4>新稿</h4>
              <blockquote role="region" tabIndex={0} aria-label="新稿全文">
                {after?.text}
              </blockquote>
            </div>
          </div>
          {!!changes.length && (
            <details className="pc-draft-comparison__changes">
              <summary>查看逐行改动</summary>
              <ul tabIndex={0} aria-label="改稿逐行差异">
                {changes.map((change, index) => (
                  <li key={index}>
                    {change.kind === "removed" ? (
                      <del>删除：{change.text || "（空行）"}</del>
                    ) : (
                      <ins>新增：{change.text || "（空行）"}</ins>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (invalid || task.busy || !before || !after) return;
              try {
                setError("");
                void task.run(buildDraftComparison(before, after, intention), {
                  reuse: true,
                });
              } catch {
                setError("稿件或修改意图过长，请缩短后重试。");
              }
            }}
          >
            <label>
              这次想改进什么？（可不填）
              <textarea
                aria-label="改稿意图"
                rows={2}
                maxLength={800}
                value={intention}
                onChange={(event) => {
                  setIntention(event.target.value);
                  setError("");
                }}
                placeholder="例如：保留清冷的氛围，让结尾更有余味。"
              />
            </label>
            {invalid && <p>请选择两份不同、各不超过 2000 字的稿件。</p>}
            <button
              type="submit"
              className="pc-studio-action"
              disabled={invalid || task.busy}
            >
              比较修改得失
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
          <StudioTaskState {...task} />
          {result && input && (
            <article className="pc-draft-comparison__result">
              <h3>修改得失</h3>
              <StudyProse text={result.result.overview} />
              <p className="pc-studio-meta">
                比较表达得失，不作合律判断；新稿也可能不如旧稿贴切。
              </p>
              {result.result.aspects.map((aspect, index) => (
                <section key={index}>
                  <h4>{aspect.name}</h4>
                  <div className="pc-draft-comparison__versions">
                    <p>
                      <strong>旧稿：</strong>
                      {aspect.left}
                    </p>
                    <p>
                      <strong>新稿：</strong>
                      {aspect.right}
                    </p>
                  </div>
                </section>
              ))}
              <StudyResultActions
                input={input}
                result={result}
                title="改稿对照"
              />
            </article>
          )}
        </>
      )}
    </details>
  );
}
