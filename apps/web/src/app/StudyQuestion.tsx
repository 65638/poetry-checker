import { useId, useLayoutEffect, useRef, useState } from "react";
import "./study-question.css";

export function StudyQuestion({
  disabled,
  mode,
  onAsk,
  heading = "带着问题读诗",
  prose = false,
  seed,
  comparison = false,
}: {
  disabled: boolean;
  mode: "reading" | "writing";
  onAsk: (question: string) => void;
  heading?: string;
  prose?: boolean;
  seed?: { question: string; revision: number };
  comparison?: boolean | "revision";
}) {
  const [question, setQuestion] = useState("");
  const limitId = useId();
  const root = useRef<HTMLDetailsElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!seed) return;
    setQuestion(seed.question);
    if (root.current) root.current.open = true;
    field.current?.focus({ preventScroll: true });
    field.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [seed]);
  const examples =
    comparison === "revision"
      ? [
          "这次修改是否更贴近原定意图？请比较具体改动。",
          "哪些旧稿表达值得保留？请说明两版的取舍。",
          "改动是否影响前后衔接和情绪？请引用两版原句。",
        ]
      : comparison
        ? [
            "两首诗怎样用景物表达不同的情绪？请引用左右原句。",
            "两首诗的结尾各有什么作用？请比较与前文的联系。",
            "两首诗在结构与表达方式上，有哪些值得借鉴的不同？",
          ]
        : mode === "reading"
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
    <details className="pc-study-question" ref={root}>
      <summary>{heading}</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled && question.trim()) onAsk(question.trim());
        }}
      >
        <label>
          {comparison === "revision"
            ? "想请 AI 看哪些改动？"
            : comparison
              ? "想请 AI 比较什么？"
              : "想请 AI 留意什么？"}
          <textarea
            ref={field}
            aria-label={
              comparison === "revision"
                ? "改稿对照问题"
                : comparison
                  ? "两诗对读问题"
                  : "本诗研读问题"
            }
            aria-describedby={limitId}
            value={question}
            maxLength={240}
            rows={3}
            placeholder={
              comparison === "revision"
                ? "例如：改后的结尾更好吗，还是旧稿更贴合前文？"
                : comparison
                  ? "例如：两首诗都写月亮，情绪有什么不同？"
                  : "例如：最后一句的情绪，和前面的景物衔接自然吗？"
            }
            onChange={(event) => setQuestion(event.target.value)}
          />
          <span className="pc-study-question__limit" id={limitId}>
            最多 240 个字符 <span>{question.length} / 240</span>
          </span>
        </label>
        <div
          className="pc-study-question__examples"
          role="group"
          aria-label="提问示例"
        >
          {examples.map((example) => (
            <button
              type="button"
              key={example}
              data-selected={
                question ===
                (prose ? example.replaceAll("这首诗", "这篇文章") : example)
              }
              onClick={() =>
                setQuestion(
                  prose ? example.replaceAll("这首诗", "这篇文章") : example,
                )
              }
            >
              {prose ? example.replaceAll("这首诗", "这篇文章") : example}
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
