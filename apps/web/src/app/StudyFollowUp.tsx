import { useId, useLayoutEffect, useRef, useState } from "react";
import type {
  PoetryAssistantRequest,
  PoetryAssistantResponse,
} from "@poetry/contracts";
import { buildStudyFollowUp, studyAnswerDetails } from "./followUpRequest";
import { StudyProse } from "./StudyProse";
import "./study-follow-up.css";
import { submitQuestionShortcut } from "./questionKeyboard";
import { sha256Hex } from "../utils/sha256";
import { studyContextKey } from "./studyContinuity";

export function StudyFollowUp({
  input,
  response,
  disabled,
  onAsk,
}: {
  input: PoetryAssistantRequest | null;
  response: PoetryAssistantResponse | null;
  disabled: boolean;
  onAsk: (input: Extract<PoetryAssistantRequest, { task: "critique" }>) => void;
}) {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const editVersion = useRef(0);
  const submitted = useRef<{ hash: string; version: number } | null>(null);
  const identity =
    input?.task === "critique"
      ? studyContextKey([
          input.text,
          input.rhymeBook,
          input.mode,
          input.direction,
          input.prosodyContext,
        ])
      : null;
  useLayoutEffect(() => {
    setQuestion("");
    setError(null);
    submitted.current = null;
    editVersion.current = 0;
  }, [identity]);
  useLayoutEffect(() => {
    const sent = submitted.current;
    if (!sent || response?.inputHash !== sent.hash) return;
    if (editVersion.current === sent.version) setQuestion("");
    submitted.current = null;
    setError(null);
  }, [response]);
  function editQuestion(next: string) {
    editVersion.current++;
    setQuestion(next);
  }
  const hintId = useId();
  if (input?.task !== "critique" || response?.task !== "critique") return null;
  const context = studyAnswerDetails(response.result);
  return (
    <details className="pc-study-follow-up">
      <summary>围绕这份回答继续追问</summary>
      <p id={hintId}>
        连同原文与最近最多 3
        轮总评、可取之处和改字建议一起发送；较长理由仅带摘录。选示例不会自动请求。
      </p>
      <details className="pc-study-follow-up__reference">
        <summary>追问所依据的回答</summary>
        {input.question && <p>上次问题：{input.question}</p>}
        <blockquote>{response.result.overview}</blockquote>
        <StudyDetailsExcerpt {...context} />
      </details>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || !question.trim()) return;
          try {
            setError(null);
            const next = buildStudyFollowUp(input, response, question.trim());
            submitted.current = {
              hash: sha256Hex(JSON.stringify(next)),
              version: editVersion.current,
            };
            onAsk(next);
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "追问暂未发送，请重试。",
            );
          }
        }}
      >
        <label>
          继续问什么？
          <textarea
            aria-label="围绕回答追问"
            aria-describedby={hintId}
            rows={3}
            maxLength={240}
            value={question}
            onChange={(event) => editQuestion(event.target.value)}
            onKeyDown={(event) => submitQuestionShortcut(event, disabled)}
            placeholder="例如：你说的层次感，具体体现在哪两句？"
          />
        </label>
        <div
          className="pc-study-follow-up__examples"
          role="group"
          aria-label="追问示例"
        >
          {[
            "请结合原句把刚才的解释说得更具体。",
            "有哪些其他理解？请比较各自的依据。",
            "刚才的回答有哪些地方还需要核实？",
          ].map((example) => (
            <button
              type="button"
              key={example}
              onClick={() => editQuestion(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <div className="pc-study-follow-up__actions">
          <small>{question.length} / 240 · Ctrl / ⌘ + Enter 发送</small>
          <button
            type="submit"
            disabled={disabled || !question.trim()}
            className="pc-studio-action"
          >
            发送追问
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}

export function StudyFollowUpContext({
  input,
}: {
  input: PoetryAssistantRequest | null;
}) {
  if (input?.task !== "critique" || !input.followUp) return null;
  return (
    <details className="pc-study-follow-up-context">
      <summary>本次追问参考了 {input.followUp.turns.length} 轮回答</summary>
      <ol>
        {input.followUp.turns.map((turn, index) => (
          <li key={index}>
            <p>{turn.question ?? "通篇观照"}</p>
            <blockquote>{turn.answer}</blockquote>
            <StudyDetailsExcerpt {...turn} />
          </li>
        ))}
      </ol>
    </details>
  );
}

function StudyDetailsExcerpt({
  details,
  detailsTruncated,
}: {
  details?: string;
  detailsTruncated?: boolean;
}) {
  if (!details) return null;
  return (
    <div className="pc-study-follow-up__details">
      {detailsTruncated && <p>以下为建议摘录，较长的理由有所省略。</p>}
      <StudyProse text={details} />
    </div>
  );
}
