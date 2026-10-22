import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pc-motion-effects";
const QUERY = "(prefers-reduced-motion: reduce)";
const CHANGE_EVENT = "pc-motion-preference-change";

type Saved = "on" | "off" | null;

function readSaved(): Saved {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

function writeSaved(value: "on" | "off") {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* Storage blocked: the choice still applies for this page session. */
  }
}

function systemReduced(): boolean {
  return (
    typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches
  );
}

export interface MotionPreference {
  /** Effects actually running: system reduced motion always wins over a saved "on". */
  effects: boolean;
  systemReduced: boolean;
  toggle: () => void;
}

export function useMotionPreference(): MotionPreference {
  const [reduced, setReduced] = useState(systemReduced);
  const [saved, setSaved] = useState<Saved>(readSaved);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(QUERY);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    // The preference can change between the first render and this effect.
    // Reconcile after subscribing so that initial transitions are not missed.
    onChange();
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const sync = () => setSaved(readSaved());
    const local = (event: Event) =>
      setSaved((event as CustomEvent<"on" | "off">).detail);
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, local);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, local);
    };
  }, []);

  const effects = !reduced && saved !== "off";

  const toggle = useCallback(() => {
    const next = !reduced && saved !== "off" ? "off" : "on";
    writeSaved(next);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  }, [reduced, saved]);

  return { effects, systemReduced: reduced, toggle };
}
