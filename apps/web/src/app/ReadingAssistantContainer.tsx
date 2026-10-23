import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BookId,
  ReadingAssistantStatus,
  ReadingOverride,
  ReadingSuggestionResponse,
} from "@poetry/contracts";
import { createReadingAssistant } from "../api/reading-assistant";
import { AI_CLIENT_TIMEOUT_MS } from "../api/timeouts";
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
  const [page, setPage] = useState(0);
  const pages = useRef(new Map<number, ReadingSuggestionResponse>());
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
    setPage(0);
    pages.current.clear();
    return () => {
      serial.current++;
      pending.current?.abort();
    };
  }, [signature]);
  const run = async (nextPage = 0, reuse = false) => {
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
    const cached = reuse ? pages.current.get(nextPage) : undefined;
    if (cached) {
      resultSignature.current = requestSignature;
      setResult(cached);
      setPage(nextPage);
      setBusy(false);
      pending.current = null;
      return;
    }
    const timer = window.setTimeout(
      () => controller.abort(),
      AI_CLIENT_TIMEOUT_MS,
    );
    try {
      const response = await client.suggest(
        {
          text: props.text,
          rhymeBook: props.book,
          ...(props.tokenId ? { targetTokenIds: [props.tokenId] } : {}),
          ...(!props.tokenId ? { offset: nextPage * 24 } : {}),
        },
        controller.signal,
      );
      if (id === serial.current && requestSignature === signatureRef.current) {
        resultSignature.current = requestSignature;
        if (
          pages.current.size &&
          [...pages.current.values()].some(
            (value) => value.dataVersion !== response.dataVersion,
          )
        ) {
          pages.current.clear();
          if (nextPage !== 0)
            throw new Error("韵书资料已更新，请点击重新辨音从第一批开始。");
        }
        pages.current.set(nextPage, response);
        setResult(response);
        setPage(nextPage);
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
      page={page}
      onPage={(nextPage) => void run(nextPage, true)}
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
