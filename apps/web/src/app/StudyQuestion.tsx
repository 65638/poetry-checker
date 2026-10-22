import { useState } from "react";
import "./study-question.css";

export function StudyQuestion({
  disabled,
  mode,
  onAsk,
}: {
  disabled: boolean;
  mode: "reading" | "writing";
  onAsk: (question: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const examples =
    mode === "reading"
      ? [
          "这首诗的情绪是怎样层层展开的？",
          "哪些字最能体现这首诗的意境？",
          "请结合原句解释虚写和实写的关系。",
        ]
      : [
          "哪些词最值得推敲，又不损害原意？",
          "转折和结尾是否自然？请结合前文说明。",
          "画面有没有重复或不连贯的地方？",
        ];
  return (
    <details className="pc-study-question">
      <summary>带着问题读诗</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled && question.trim()) onAsk(question.trim());
        }}
      >
        <label>
          想请 AI 留意什么？
          <textarea
            aria-label="本诗研读问题"
            value={question}
            maxLength={240}
            rows={3}
            placeholder="例如：最后一句的情绪，和前面的景物衔接自然吗？"
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <div className="pc-study-question__examples" aria-label="提问示例">
          {examples.map((example) => (
            <button
              type="button"
              key={example}
              onClick={() => setQuestion(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <div className="pc-study-question__actions">
          <span>填写或选示例后，点击提问才发送。</span>
          <button
            type="submit"
            className="pc-studio-action"
            disabled={disabled || !question.trim()}
          >
            就此提问
          </button>
        </div>
      </form>
    </details>
  );
}
