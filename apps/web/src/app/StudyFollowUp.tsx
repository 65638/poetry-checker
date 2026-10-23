import { useId, useState } from "react";
import type {
  PoetryAssistantRequest,
  PoetryAssistantResponse,
} from "@poetry/contracts";
import { buildStudyFollowUp } from "./followUpRequest";
import "./study-follow-up.css";

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
  const hintId = useId();
  if (input?.task !== "critique" || response?.task !== "critique") return null;
  return (
    <details className="pc-study-follow-up">
      <summary>围绕这份回答继续追问</summary>
      <p id={hintId}>
        连同原文与最近最多 3 轮回答正文一起发送；选示例不会自动请求。
      </p>
      <details className="pc-study-follow-up__reference">
        <summary>追问所依据的回答</summary>
        {input.question && <p>上次问题：{input.question}</p>}
        <blockquote>{response.result.overview}</blockquote>
      </details>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || !question.trim()) return;
          try {
            setError(null);
            onAsk(buildStudyFollowUp(input, response, question.trim()));
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
            onChange={(event) => setQuestion(event.target.value)}
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
              onClick={() => setQuestion(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <div className="pc-study-follow-up__actions">
          <small>{question.length} / 240</small>
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
          </li>
        ))}
      </ol>
    </details>
  );
}
