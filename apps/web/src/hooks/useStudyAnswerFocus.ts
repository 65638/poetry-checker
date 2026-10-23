import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Follow an explicit question to its answer only while the reader has stayed put. */
export function useStudyAnswerFocus<T extends HTMLElement>(answer: unknown) {
  const target = useRef<T>(null);
  const origin = useRef<Element | null>(null);
  const previousAnswer = useRef(answer);
  const begin = useCallback(() => {
    origin.current = document.activeElement;
  }, []);
  useEffect(() => {
    const clear = () => {
      origin.current = null;
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target !== origin.current && event.target !== document.body)
        clear();
    };
    // Once the reader resumes navigating, typing, or leaves the window, don't steal focus.
    document.addEventListener("pointerdown", clear, true);
    document.addEventListener("keydown", clear, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("visibilitychange", clear);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointerdown", clear, true);
      document.removeEventListener("keydown", clear, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("visibilitychange", clear);
      window.removeEventListener("blur", clear);
    };
  }, []);
  useLayoutEffect(() => {
    if (previousAnswer.current === answer) return;
    previousAnswer.current = answer;
    const source = origin.current;
    origin.current = null;
    if (
      answer &&
      source &&
      !document.hidden &&
      (document.activeElement === source ||
        document.activeElement === document.body)
    ) {
      target.current?.focus({ preventScroll: true });
    }
  }, [answer]);
  return { target, begin };
}
