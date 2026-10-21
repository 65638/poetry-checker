import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BookId,
  ReadingAssistantStatus,
  ReadingOverride,
  ReadingSuggestionResponse,
} from "@poetry/contracts";
import { createReadingAssistant } from "../api/reading-assistant";
import { readWebEnv, resolveApiConfig } from "./config";
import { ReadingAssistantView } from "../presentation/components/ReadingAssistantView";

export function ReadingAssistantContainer(props: {
  text: string;
  book: BookId;
  tokenId?: string;
  disabled?: boolean;
  onChooseReading?: (override: ReadingOverride) => void;
  onInspect?: (character: string) => void;
}) {
  const client = useMemo(
    () => createReadingAssistant(resolveApiConfig(readWebEnv()).baseUrl),
    [],
  );
  const [status, setStatus] = useState<ReadingAssistantStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [result, setResult] = useState<ReadingSuggestionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const automaticTimer = useRef<number | null>(null);
  const serial = useRef(0);
  const signature = JSON.stringify([
    props.text,
    props.book,
    props.tokenId,
    props.disabled,
  ]);
  const signatureRef = useRef(signature);
  const resultSignature = useRef<string | null>(null);
  signatureRef.current = signature;
  useEffect(() => {
    let live = true;
    setStatusError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    void client
      .status(controller.signal)
      .then((next) => {
        if (live) setStatus(next);
      })
      .catch(() => {
        if (live) setStatusError("无法读取AI配置状态。");
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      live = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, statusAttempt]);
  useEffect(() => {
    serial.current++;
    pending.current?.abort();
    setResult(null);
    setError(null);
    setBusy(false);
    return () => {
      serial.current++;
      pending.current?.abort();
    };
  }, [signature]);
  const run = async () => {
    if (props.disabled || busy || !status?.configured || !props.text.trim())
      return;
    if (automaticTimer.current !== null)
      window.clearTimeout(automaticTimer.current);
    automaticTimer.current = null;
    const id = ++serial.current;
    const requestSignature = signature;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(null);
    // 与服务端 DeepSeek 默认单次请求窗口一致，避免浏览器提前中止。
    const timer = window.setTimeout(() => controller.abort(), 90000);
    try {
      const response = await client.suggest(
        {
          text: props.text,
          rhymeBook: props.book,
          ...(props.tokenId ? { targetTokenIds: [props.tokenId] } : {}),
        },
        controller.signal,
      );
      if (id === serial.current && requestSignature === signatureRef.current) {
        resultSignature.current = requestSignature;
        setResult(response);
      }
    } catch (cause) {
      if (id === serial.current && requestSignature === signatureRef.current)
        setError(
          controller.signal.aborted
            ? "AI等候较久，请重试。"
            : cause instanceof Error
              ? cause.message
              : "读音建议失败，请重试。",
        );
    } finally {
      window.clearTimeout(timer);
      if (id === serial.current) {
        setBusy(false);
        pending.current = null;
      }
    }
  };
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (
      !status?.configured ||
      props.disabled ||
      !/\p{Script=Han}/u.test(props.text) ||
      [...props.text].length > 2000
    )
      return;
    const timer = window.setTimeout(() => {
      void runRef.current();
    }, 900);
    automaticTimer.current = timer;
    return () => window.clearTimeout(timer);
  }, [signature, status?.configured]);
  return (
    <ReadingAssistantView
      model={status?.model ?? "AI"}
      configured={status?.configured ?? false}
      statusText={
        statusError ??
        (status === null
          ? "正在确认AI连接配置…"
          : !status.configured
            ? "AI尚未配置，查字仍可正常使用。"
            : null)
      }
      result={resultSignature.current === signature ? result : null}
      error={error}
      busy={busy}
      disabled={
        !!props.disabled || !props.text.trim() || [...props.text].length > 2000
      }
      onRequest={() => {
        void run();
      }}
      onRefreshStatus={() => setStatusAttempt((attempt) => attempt + 1)}
      onCancel={() => {
        if (automaticTimer.current !== null)
          window.clearTimeout(automaticTimer.current);
        automaticTimer.current = null;
        serial.current++;
        pending.current?.abort();
        setBusy(false);
        setError("已取消本次建议。");
      }}
      onChooseReading={props.onChooseReading}
      onInspect={props.onInspect}
    />
  );
}
