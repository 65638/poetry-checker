import type { StudyEntry } from "./studyArchive";
import { usePoetryTask } from "../hooks/usePoetryTask";
import { StudioTaskState } from "../presentation/components/StudioControls";
import { StudyFollowUp, StudyFollowUpContext } from "./StudyFollowUp";
import { StudyProse } from "./StudyProse";
import { StudyResultActions } from "./StudyResultActions";
import { StudyHistory } from "./StudyHistory";
import { RuleReviewNote } from "./RuleReviewNote";
import "./saved-study-discussion.css";

/** A saved discussion owns its original text independently of the editor and current library selection. */
export function SavedStudyDiscussion({ entry }: { entry: StudyEntry }) {
  const task = usePoetryTask(entry.id);
  const last =
    task.history.find(
      (record) => record.key === JSON.stringify(task.resultInput),
    ) ?? task.history.at(-1);
  const input = task.result ? task.resultInput : (last?.input ?? entry.input);
  const response = task.result ?? last?.result ?? entry.response;
  if (entry.input.task !== "critique" || response.task !== "critique")
    return null;
  return (
    <section className="pc-saved-discussion" aria-label="收藏续问">
      <h4>从这份收藏接着问</h4>
      <p>
        围绕收藏中的《{entry.title}
        》原文继续讨论。使用当时的研读选项和格律依据，新回答可另存一份。
      </p>
      <StudyHistory
        entries={task.history}
        current={task.result ? task.resultInput : null}
        busy={task.busy}
        onRestore={task.restore}
      />
      <StudioTaskState {...task} result={last ? response : null} />
      {last && (
        <div className="pc-saved-discussion__answer">
          {input?.task === "critique" && input.question && (
            <p className="pc-study-question-asked">
              本次提问：{input.question}
            </p>
          )}
          <StudyProse text={response.result.overview} />
          {response.result.strengths.length > 0 && (
            <ul>
              {response.result.strengths.map((strength, index) => (
                <li key={index}>{strength}</li>
              ))}
            </ul>
          )}
          {response.result.revisionNotice && (
            <p>{response.result.revisionNotice}</p>
          )}
          {response.result.revisions.length > 0 && (
            <details className="pc-saved-discussion__revisions">
              <summary>针对收藏原文的推敲建议</summary>
              <ul>
                {response.result.revisions.map((edit, index) => (
                  <li key={index}>
                    <p>
                      “{edit.original}” → “{edit.replacement}”
                    </p>
                    <p>原因：{edit.reason}</p>
                    <p>取舍：{edit.tradeoff}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <StudyFollowUpContext input={input} />
          <RuleReviewNote review={response.result.ruleReview} />
          <StudyResultActions
            input={input}
            result={response}
            title={entry.title}
          />
        </div>
      )}
      <StudyFollowUp
        key={response.inputHash}
        input={input}
        response={response}
        disabled={task.busy}
        onAsk={(next) => void task.run(next, { reuse: true })}
      />
    </section>
  );
}
