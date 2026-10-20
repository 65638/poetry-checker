import { useEffect, useRef, useState } from "react";

// Request state remains immediate. Only decorative feedback waits, so fast
// requests do not flash a spinner and slower ones have time to be read.
export function useBusyIndicator(busy: boolean) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    if (busy) {
      if (shownAt.current === null) {
        timer = window.setTimeout(() => {
          shownAt.current = performance.now();
          setVisible(true);
        }, 160);
      }
    } else {
      const remaining =
        shownAt.current === null
          ? 0
          : Math.max(0, 320 - (performance.now() - shownAt.current));
      timer = window.setTimeout(() => {
        shownAt.current = null;
        setVisible(false);
      }, remaining);
    }
    return () => window.clearTimeout(timer);
  }, [busy]);
  return visible;
}
