import { useEffect, useRef, useState } from "react";
import type { BookId, LookupResult } from "@poetry/contracts";
import { characterInputError, createCharacterLookup } from "../api/characters";
import { readWebEnv, resolveApiConfig } from "./config";
import { DictionaryView } from "../presentation/DictionaryView";
import { compareBooks, type BookComparison } from "./dictionaryComparison";
import { lookupPassage, type PassageLookup } from "./passageLookup";
import {
  dictionaryHash,
  dictionaryText,
  extractCharacters,
  readDictionaryLink,
  readShelf,
  remember,
  SHELF_KEY,
  shelfId,
  toggleFavorite,
  type DictionaryShelf,
  type ShelfEntry,
} from "./dictionaryShelf";

export function DictionaryContainer({
  poemText,
  passageRequest,
}: {
  poemText: string;
  passageRequest: number;
}) {
  const [text, setText] = useState("");
  const [book, setBook] = useState<BookId>("pingshui");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [character, setCharacter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passage, setPassage] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [comparisons, setComparisons] = useState<BookComparison[]>([]);
  const [comparing, setComparing] = useState(false);
  const comparisonRequest = useRef(0);
  const comparisonController = useRef<AbortController | null>(null);
  const [passageOpen, setPassageOpen] = useState(false);
  const [passageResult, setPassageResult] = useState<PassageLookup | null>(
    null,
  );
  const [passageBusy, setPassageBusy] = useState(false);
  const [passageProgress, setPassageProgress] = useState(0);
  const [passageError, setPassageError] = useState<string | null>(null);
  const passageSerial = useRef(0);
  const passageController = useRef<AbortController | null>(null);
  const resetPassageLookup = () => {
    passageSerial.current++;
    passageController.current?.abort();
    setPassageBusy(false);
    setPassageResult(null);
    setPassageError(null);
    setPassageProgress(0);
  };
  const poemTextRef = useRef(poemText);
  poemTextRef.current = poemText;
  useEffect(() => {
    if (passageRequest) {
      resetPassageLookup();
      setPassage(poemTextRef.current);
      setPassageOpen(true);
    }
  }, [passageRequest]);
  const [shelf, setShelf] = useState<DictionaryShelf>(() => {
    try {
      return readShelf(window.localStorage.getItem(SHELF_KEY));
    } catch {
      return readShelf(null);
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
    } catch {
      setFeedback("浏览器未允许本机保存，收藏与最近查询仅保留到本页关闭。");
    }
  }, [shelf]);
  const pending = useRef<AbortController | null>(null);
  const serial = useRef(0);
  useEffect(
    () => () => {
      serial.current++;
      pending.current?.abort();
      comparisonRequest.current++;
      comparisonController.current?.abort();
      passageSerial.current++;
      passageController.current?.abort();
    },
    [],
  );

  const invalidate = () => {
    serial.current++;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setResult(null);
    setError(null);
    setFeedback(null);
    comparisonRequest.current++;
    comparisonController.current?.abort();
    setComparisons([]);
    setComparing(false);
  };
  const lookup = async (nextText = text, nextBook = book) => {
    invalidate();
    const validation = characterInputError(nextText);
    if (validation) {
      setError(validation);
      return;
    }
    const query = nextText.trim();
    setText(query);
    setCharacter(query);
    const id = serial.current;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    const timer = window.setTimeout(() => {
      if (serial.current !== id) return;
      serial.current++;
      controller.abort();
      setBusy(false);
      setError("查询等候较久，请重新查字。");
    }, 15000);
    try {
      const config = resolveApiConfig(readWebEnv());
      const response = await createCharacterLookup(config.baseUrl)(
        query,
        nextBook,
        controller.signal,
      );
      if (id === serial.current) {
        setResult(response);
        setShelf((current) =>
          remember(current, { character: query, book: nextBook }),
        );
      }
    } catch (cause) {
      if (id === serial.current)
        setError(
          cause instanceof TypeError
            ? "无法连接查字服务，请检查网络后重试。"
            : cause instanceof Error
              ? cause.message
              : "查询失败，请重试。",
        );
    } finally {
      window.clearTimeout(timer);
      if (id === serial.current) {
        setBusy(false);
        pending.current = null;
      }
    }
  };
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  useEffect(() => {
    const sync = () => {
      const entry = readDictionaryLink(window.location.hash);
      if (entry) {
        setText(entry.character);
        setBook(entry.book);
        void lookupRef.current(entry.character, entry.book);
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const favorite = shelf.favorites.some(
    (entry) => shelfId(entry) === shelfId({ character, book }),
  );
  const compare = async () => {
    if (!result) return;
    const id = ++comparisonRequest.current;
    comparisonController.current?.abort();
    const controller = new AbortController();
    comparisonController.current = controller;
    setComparing(true);
    setComparisons([]);
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const config = resolveApiConfig(readWebEnv());
      const rows = await compareBooks(
        character,
        result,
        createCharacterLookup(config.baseUrl),
        controller.signal,
      );
      if (comparisonRequest.current === id) setComparisons(rows);
    } catch {
      if (comparisonRequest.current === id)
        setFeedback("对照服务暂不可用，请稍后重试。");
    } finally {
      window.clearTimeout(timer);
      if (comparisonRequest.current === id) setComparing(false);
    }
  };
  const openEntry = (entry: ShelfEntry) => {
    if (entry.book !== book) resetPassageLookup();
    setText(entry.character);
    setBook(entry.book);
    void lookup(entry.character, entry.book);
  };
  const runPassage = async () => {
    resetPassageLookup();
    const id = passageSerial.current;
    const controller = new AbortController();
    passageController.current = controller;
    setPassageBusy(true);
    const timer = window.setTimeout(() => controller.abort(), 30000);
    try {
      const config = resolveApiConfig(readWebEnv());
      const response = await lookupPassage(
        passage,
        book,
        createCharacterLookup(config.baseUrl),
        controller.signal,
        (done) => {
          if (passageSerial.current === id) setPassageProgress(done);
        },
      );
      if (passageSerial.current === id) setPassageResult(response);
    } catch (cause) {
      if (passageSerial.current === id)
        setPassageError(
          controller.signal.aborted
            ? "逐字查询等候较久，请分段重试。"
            : cause instanceof Error
              ? cause.message
              : "逐字查询失败，请重试。",
        );
    } finally {
      window.clearTimeout(timer);
      if (passageSerial.current === id) setPassageBusy(false);
    }
  };
  const copy = async (link: boolean) => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        link
          ? `${window.location.href.split("#")[0]}${dictionaryHash({ character, book })}`
          : dictionaryText(character, result),
      );
      setFeedback(
        link
          ? "查字链接已复制。打开链接会重新查询最新数据。"
          : "查字条目已复制，包含审核状态与数据版本。",
      );
    } catch {
      setFeedback("复制未成功，请允许剪贴板访问后重试。");
    }
  };
  return (
    <DictionaryView
      text={text}
      book={book}
      result={result}
      character={character}
      busy={busy}
      error={error}
      onTextChange={(next) => {
        invalidate();
        setText(next);
      }}
      onBookChange={(next) => {
        resetPassageLookup();
        invalidate();
        setBook(next);
        if (!characterInputError(text)) void lookup(text, next);
      }}
      onLookup={() => {
        void lookup();
      }}
      onExample={(next) => {
        setText(next);
        void lookup(next);
      }}
      passage={passage}
      passageCharacters={extractCharacters(passage)}
      onPassageChange={(next) => {
        resetPassageLookup();
        setPassage([...next].slice(0, 2000).join(""));
      }}
      canImportPoem={!!poemText.trim()}
      onImportPoem={() => {
        resetPassageLookup();
        setPassage(poemText);
      }}
      passageOpen={passageOpen}
      onPassageToggle={setPassageOpen}
      shelf={shelf}
      onOpenEntry={openEntry}
      onClearRecent={() => setShelf((current) => ({ ...current, recent: [] }))}
      favorite={favorite}
      onToggleFavorite={() =>
        setShelf((current) => toggleFavorite(current, { character, book }))
      }
      feedback={feedback}
      onCopy={() => {
        void copy(false);
      }}
      onCopyLink={() => {
        void copy(true);
      }}
      comparisons={comparisons}
      comparing={comparing}
      onCompare={() => {
        void compare();
      }}
      passageResult={passageResult}
      passageBusy={passageBusy}
      passageProgress={passageProgress}
      passageError={passageError}
      onLookupPassage={() => {
        void runPassage();
      }}
    />
  );
}
