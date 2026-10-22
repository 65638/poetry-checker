import { useEffect, useState } from "react";
import type { LibraryWork } from "@poetry/contracts";
import {
  addExcerpt,
  EXCERPTS_KEY,
  excerptArchive,
  mergeExcerpts,
  parseExcerpts,
  type Excerpt,
} from "../app/excerpts";

function load() {
  try {
    return {
      entries: parseExcerpts(localStorage.getItem(EXCERPTS_KEY)),
      error: "",
    };
  } catch (cause) {
    return {
      entries: [] as Excerpt[],
      error: cause instanceof Error ? cause.message : "摘句暂时无法读取。",
    };
  }
}
export function useExcerpts() {
  const [state, setState] = useState(load);
  const [removed, setRemoved] = useState<Excerpt | null>(null);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (!event.key || event.key === EXCERPTS_KEY) setState(load());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function change(transform: (current: Excerpt[]) => Excerpt[]): {
    saved: boolean;
    message: string;
  } {
    try {
      const current = parseExcerpts(localStorage.getItem(EXCERPTS_KEY));
      const next = transform(current);
      localStorage.setItem(EXCERPTS_KEY, JSON.stringify(excerptArchive(next)));
      setState({ entries: next, error: "" });
      return { saved: true, message: "摘句已存于此设备。" };
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "摘句未能保存，请检查存储空间。";
      setState((previous) => ({ ...previous, error: message }));
      return { saved: false, message };
    }
  }
  return {
    ...state,
    add: (work: LibraryWork, paragraph: number) =>
      change((current) => addExcerpt(current, work, paragraph)),
    saveNote: (id: string, note: string, expected: string) =>
      change((current) => {
        const entry = current.find((e) => e.id === id);
        if (!entry)
          throw new Error("这条摘句已被移除，请先复制尚未保存的笔记。");
        if (entry.note !== expected)
          throw new Error(
            "笔记已在其他页面更新，请先复制当前文字，再核对最新笔记。",
          );
        if (note.length > 1000) throw new Error("随手记最多1000字。");
        return current.map((e) => (e.id === id ? { ...e, note } : e));
      }),
    remove: (id: string) => {
      let removedEntry: Excerpt | undefined;
      const result = change((current) => {
        removedEntry = current.find((e) => e.id === id);
        return current.filter((e) => e.id !== id);
      });
      if (result.saved && removedEntry) setRemoved(removedEntry);
      return result;
    },
    removed,
    undoRemove: () => {
      if (!removed) return;
      const result = change((current) => mergeExcerpts(current, [removed]));
      if (result.saved) setRemoved(null);
    },
  };
}
