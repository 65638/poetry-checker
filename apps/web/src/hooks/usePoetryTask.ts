import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PoetryAssistantRequest,
  PoetryAssistantResponse,
} from "@poetry/contracts";
import { requestPoetry } from "../api/poetry-studio";

export function usePoetryTask(identity: string) {
  const [result, setResult] = useState<PoetryAssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const resultIdentity = useRef<string | null>(null);
  const cancel = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    setBusy(false);
  }, []);
  useEffect(() => {
    cancel();
    setResult(null);
    setError(null);
    return () => {
      sequence.current++;
      controller.current?.abort();
    };
  }, [identity, cancel]);
  const run = useCallback(async (input: PoetryAssistantRequest) => {
    const id = ++sequence.current;
    const requestIdentity = currentIdentity.current;
    controller.current?.abort();
    const own = new AbortController();
    controller.current = own;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const value = await requestPoetry(input, own.signal);
      if (
        id === sequence.current &&
        requestIdentity === currentIdentity.current
      ) {
        resultIdentity.current = requestIdentity;
        setResult(value);
      }
    } catch (cause) {
      if (id === sequence.current && !own.signal.aborted)
        setError(cause instanceof Error ? cause.message : "建议暂不可用。");
    } finally {
      if (id === sequence.current) setBusy(false);
    }
  }, []);
  return {
    result: resultIdentity.current === identity ? result : null,
    busy,
    error,
    run,
    cancel,
  };
}
