import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PoetryAssistantRequest,
  PoetryAssistantResponse,
} from "@poetry/contracts";
import { requestPoetry } from "../api/poetry-studio";
import { PoetryResultCache } from "../app/poetryResultCache";

export type PoetryTaskRecord = {
  key: string;
  input: PoetryAssistantRequest;
  result: PoetryAssistantResponse;
};

export function usePoetryTask(identity: string) {
  const [result, setResult] = useState<PoetryAssistantResponse | null>(null);
  const [resultInput, setResultInput] = useState<PoetryAssistantRequest | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reused, setReused] = useState(false);
  const [history, setHistory] = useState<{
    identity: string;
    entries: PoetryTaskRecord[];
  }>({ identity, entries: [] });
  const remember = useCallback((scope: string, entry: PoetryTaskRecord) => {
    setHistory((previous) => ({
      identity: scope,
      entries: [
        ...(previous.identity === scope ? previous.entries : []).filter(
          (item) => item.key !== entry.key,
        ),
        entry,
      ].slice(-6),
    }));
  }, []);
  const cache = useRef(new PoetryResultCache());
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const resultIdentity = useRef<string | null>(null);
  const lastRequest = useRef<{
    identity: string;
    input: PoetryAssistantRequest;
  } | null>(null);
  const resultRequest = useRef<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const cancel = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    setBusy(false);
    setError(null);
    setCancelled(true);
  }, []);
  useEffect(() => {
    cancel();
    setResult(null);
    setResultInput(null);
    setError(null);
    setCancelled(false);
    setReused(false);
    setHistory({ identity, entries: [] });
    lastRequest.current = null;
    resultRequest.current = null;
    return () => {
      sequence.current++;
      controller.current?.abort();
    };
  }, [identity, cancel]);
  const run = useCallback(
    async (
      input: PoetryAssistantRequest,
      options: { reuse?: boolean } = {},
    ) => {
      const id = ++sequence.current;
      const requestIdentity = currentIdentity.current;
      const requestKey = JSON.stringify(input);
      lastRequest.current = { identity: requestIdentity, input };
      controller.current?.abort();
      setReused(false);
      const cached = options.reuse ? cache.current.get(input) : null;
      if (cached) {
        resultIdentity.current = requestIdentity;
        resultRequest.current = requestKey;
        setResult(cached);
        setResultInput(input);
        setBusy(false);
        setError(null);
        setCancelled(false);
        setReused(true);
        remember(requestIdentity, { key: requestKey, input, result: cached });
        return;
      }
      const own = new AbortController();
      controller.current = own;
      setBusy(true);
      if (resultRequest.current !== requestKey) setResult(null);
      setError(null);
      setCancelled(false);
      try {
        const value = await requestPoetry(input, own.signal);
        if (
          id === sequence.current &&
          requestIdentity === currentIdentity.current
        ) {
          resultIdentity.current = requestIdentity;
          resultRequest.current = requestKey;
          cache.current.set(input, value);
          setResult(value);
          setResultInput(input);
          remember(requestIdentity, { key: requestKey, input, result: value });
        }
      } catch (cause) {
        if (id === sequence.current && !own.signal.aborted)
          setError(cause instanceof Error ? cause.message : "建议暂不可用。");
      } finally {
        if (id === sequence.current) setBusy(false);
      }
    },
    [remember],
  );
  const restore = useCallback(
    (key: string) => {
      if (history.identity !== currentIdentity.current) return;
      const entry = history.entries.find((item) => item.key === key);
      if (!entry) return;
      sequence.current++;
      controller.current?.abort();
      resultIdentity.current = currentIdentity.current;
      resultRequest.current = entry.key;
      lastRequest.current = {
        identity: currentIdentity.current,
        input: entry.input,
      };
      setResult(entry.result);
      setResultInput(entry.input);
      setBusy(false);
      setError(null);
      setCancelled(false);
      setReused(true);
    },
    [history],
  );
  const retry = useCallback(() => {
    const request = lastRequest.current;
    if (request && request.identity === currentIdentity.current)
      void run(request.input);
  }, [run]);
  return {
    result: resultIdentity.current === identity ? result : null,
    resultInput: resultIdentity.current === identity ? resultInput : null,
    busy,
    error,
    run,
    cancel,
    cancelled,
    retry,
    reused,
    history: history.identity === identity ? history.entries : [],
    restore,
  };
}
