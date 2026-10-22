import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PoetryAssistantRequest,
  PoetryAssistantResponse,
} from "@poetry/contracts";
import { requestPoetry } from "../api/poetry-studio";
import { PoetryResultCache } from "../app/poetryResultCache";

export function usePoetryTask(identity: string) {
  const [result, setResult] = useState<PoetryAssistantResponse | null>(null);
  const [resultInput, setResultInput] = useState<PoetryAssistantRequest | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reused, setReused] = useState(false);
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
        }
      } catch (cause) {
        if (id === sequence.current && !own.signal.aborted)
          setError(cause instanceof Error ? cause.message : "建议暂不可用。");
      } finally {
        if (id === sequence.current) setBusy(false);
      }
    },
    [],
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
  };
}
