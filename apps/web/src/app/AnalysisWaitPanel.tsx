import { useEffect, useState } from "react";
import { useBusyIndicator } from "../presentation/useBusyIndicator";
import "./analysis-wait.css";
import type { AnnotatedPoem } from "@poetry/contracts";
import { PreliminaryReadings } from "./PreliminaryReadings";

export function AnalysisWaitPanel({
  busy,
  text,
  onCancel,
  preliminaryPoem,
}: {
  busy: boolean;
  text: string;
  onCancel?: () => void;
  preliminaryPoem?: AnnotatedPoem | null;
}) {
  const visible = useBusyIndicator(busy);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!busy) return;
    const start = Date.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [busy]);
  if (!busy || !visible) return null;
  return (
    <section className="pc-analysis-wait" aria-label="本次分析进度">
      <header>
        <strong>正在分析这首诗</strong>
        <span aria-hidden="true">已等候 {seconds} 秒</span>
      </header>
      <p role="status" aria-live="polite">
        {preliminaryPoem
          ? seconds >= 60
            ? "本地读音已返回；AI 仍未完成，可继续等候或停止本次分析。"
            : seconds >= 20
              ? "AI 核对还需要一些时间；先看下方原诗，也可以停止等待。"
              : "本地读音已返回，正在等待 AI 核对。"
          : seconds >= 60
            ? "仍在等待分析服务返回，尚未生成新结果。"
            : seconds >= 20
              ? "这次用时较久，可以先读诗，也可以停止等待。"
              : "正在结合全诗查对读音与格律，原文留在这里。"}
      </p>
      {preliminaryPoem && <PreliminaryReadings poem={preliminaryPoem} />}
      <details>
        <summary>查看本次提交的原诗</summary>
        <blockquote aria-label="正在分析的原诗" tabIndex={0}>
          {text}
        </blockquote>
      </details>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          停止等待
        </button>
      )}
    </section>
  );
}
