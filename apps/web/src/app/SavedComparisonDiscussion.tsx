import type { StudyEntry } from "./studyArchive";
import { usePoetryTask } from "../hooks/usePoetryTask";
import { useStudyAnswerFocus } from "../hooks/useStudyAnswerFocus";
import { StudioTaskState } from "../presentation/components/StudioControls";
import { StudyQuestion } from "./StudyQuestion";
import { StudyProse } from "./StudyProse";
import { StudyResultActions } from "./StudyResultActions";
import { StudyHistory } from "./StudyHistory";
import { comparisonSourceLabel } from "./comparisonPassages";
import "./saved-study-discussion.css";

/** Resume from archived originals; current editor/library selections never enter this request. */
export function SavedComparisonDiscussion({ entry }: { entry: StudyEntry }) {
  const task = usePoetryTask(entry.id);
  const answerFocus = useStudyAnswerFocus<HTMLDivElement>(task.result);
  if (entry.input.task !== "compare") return null;
  const original = entry.input;
  const input =
    task.resultInput?.task === "compare" ? task.resultInput : original;
  const response = task.result?.task === "compare" ? task.result : null;
  const revision = !!original.revision;
  return (
    <section
      className="pc-saved-discussion pc-saved-comparison"
      aria-label="收藏对读提问"
    >
      <h4>{revision ? "继续推敲这两版稿件" : "继续比较这两份原文"}</h4>
      <p>
        沿用收藏中的{revision ? "两版文字与修改意图" : "左右原文与选段范围"}
        ，不替换当前稿件。新回答可另存，原收藏保留。
      </p>
      <p>每次只发送原文和新问题；如需讨论旧回答，请在问题中写明具体说法。</p>
      <StudyQuestion
        heading={revision ? "向这两版稿件提问" : "向收藏原文提问"}
        comparison={revision ? "revision" : true}
        excerpt={
          !!original.scope &&
          (original.scope.left.parts > 1 || original.scope.right.parts > 1)
        }
        mode="reading"
        disabled={task.busy}
        onAsk={(question) => {
          answerFocus.begin();
          void task.run({ ...original, question });
        }}
      />
      <StudyHistory
        entries={task.history}
        current={response ? input : null}
        busy={task.busy}
        onRestore={task.restore}
      />
      <StudioTaskState {...task} />
      {response && (
        <div
          className="pc-saved-discussion__answer"
          ref={answerFocus.target}
          tabIndex={-1}
          role="region"
          aria-label="收藏对读的新回答"
        >
          <p>
            本次回答：{response.provider === "deepseek" ? "DeepSeek" : "GLM"} ·{" "}
            {response.model}
          </p>
          <p className="pc-study-question-asked">
            这份回答的问题：{input.question}
          </p>
          {input.scope && (
            <p>
              本次范围：左卷{comparisonSourceLabel(input.scope.left)}；右卷
              {comparisonSourceLabel(input.scope.right)}。不据选段评定整篇。
            </p>
          )}
          {input.revision && (
            <p>
              旧稿：{input.revision.beforeLabel} · 新稿：
              {input.revision.afterLabel}
              {input.revision.intention
                ? ` · 修改意图：${input.revision.intention}`
                : ""}
            </p>
          )}
          <StudyProse text={response.result.overview} />
          {response.result.aspects.map((aspect, index) => (
            <div key={index}>
              <h5>{aspect.name}</h5>
              <p>
                <strong>{revision ? "旧稿" : "左卷"}：</strong>
                {aspect.left}
              </p>
              <p>
                <strong>{revision ? "新稿" : "右卷"}：</strong>
                {aspect.right}
              </p>
            </div>
          ))}
          <StudyResultActions
            input={input}
            result={response}
            title={entry.title}
          />
        </div>
      )}
    </section>
  );
}
