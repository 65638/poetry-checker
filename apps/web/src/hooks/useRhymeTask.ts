import { useCallback, useEffect, useRef, useState } from "react";
import {
  RhymeBatchSession,
  type RhymeBatchResult,
  type RhymeProgress,
  type RhymeTaskInput,
} from "../api/rhyme-batches";

type State = {
  identity: string;
  result: RhymeBatchResult | null;
  busy: boolean;
  error: string | null;
  cancelled: boolean;
  pendingInput: RhymeTaskInput | null;
  progress: RhymeProgress;
};
const initial = (identity: string): State => ({
  identity,
  result: null,
  busy: false,
  error: null,
  cancelled: false,
  pendingInput: null,
  progress: { completed: 0, total: 0 },
});

export function useRhymeTask(identity: string) {
  const [state, setState] = useState<State>(() => initial(identity));
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  // React's disabled state is not committed synchronously with a click handler.
  const running = useRef<{ identity: string; id: number } | null>(null);
  const last = useRef<{ identity: string; session: RhymeBatchSession } | null>(
    null,
  );

  useEffect(() => {
    sequence.current++;
    controller.current?.abort();
    running.current = null;
    last.current = null;
    setState(initial(identity));
    return () => {
      sequence.current++;
      controller.current?.abort();
      running.current = null;
    };
  }, [identity]);

  const execute = useCallback(async (session: RhymeBatchSession) => {
    const scope = currentIdentity.current;
    if (running.current?.identity === scope) return;
    const id = ++sequence.current;
    controller.current?.abort();
    const own = new AbortController();
    controller.current = own;
    running.current = { identity: scope, id };
    last.current = { identity: scope, session };
    const active = () =>
      !own.signal.aborted &&
      id === sequence.current &&
      scope === currentIdentity.current;
    setState((previous) => ({
      ...(previous.identity === scope ? previous : initial(scope)),
      busy: true,
      error: null,
      cancelled: false,
      pendingInput: session.input,
      progress: session.progress,
    }));
    try {
      const result = await session.run(own.signal, (progress) => {
        if (active()) setState((previous) => ({ ...previous, progress }));
      });
      if (active()) setState((previous) => ({ ...previous, result }));
    } catch (cause) {
      if (active()) {
        const detail =
          cause instanceof Error ? cause.message : "荐字暂不可用。";
        const { completed, total } = session.progress;
        setState((previous) => ({
          ...previous,
          error: `已处理 ${completed}/${total} 个读音候选，本次尚未完成。${detail}重试会从未完成处继续。`,
        }));
      }
    } finally {
      if (active())
        setState((previous) => ({
          ...previous,
          busy: false,
          pendingInput: null,
        }));
      if (running.current?.id === id) running.current = null;
    }
  }, []);

  const run = useCallback(
    async (input: RhymeTaskInput) => {
      if (running.current?.identity === currentIdentity.current) return;
      try {
        await execute(new RhymeBatchSession(input));
      } catch (cause) {
        sequence.current++;
        controller.current?.abort();
        running.current = null;
        last.current = null;
        const scope = currentIdentity.current;
        setState((previous) => ({
          ...(previous.identity === scope ? previous : initial(scope)),
          busy: false,
          pendingInput: null,
          cancelled: false,
          error: cause instanceof Error ? cause.message : "候选资料不完整。",
        }));
      }
    },
    [execute],
  );
  const retry = useCallback(() => {
    const request = last.current;
    if (request?.identity === currentIdentity.current)
      void execute(request.session);
  }, [execute]);
  const cancel = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    running.current = null;
    setState((previous) => ({
      ...previous,
      busy: false,
      pendingInput: null,
      error: null,
      cancelled: true,
    }));
  }, []);
  const visible = state.identity === identity ? state : initial(identity);
  return { ...visible, run, retry, cancel };
}
