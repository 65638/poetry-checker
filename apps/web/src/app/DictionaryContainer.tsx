import { copyText } from "../utils/browser.js";
import { useEffect, useRef, useState } from "react";
import type { BookId, LookupResult } from "@poetry/contracts";
import { characterInputError, createCharacterLookup } from "../api/characters";
import { readWebEnv, resolveApiConfig } from "./config";
import { DictionaryView } from "../presentation/DictionaryView";
import { CharacterReference } from "./CharacterReference";
import { ReadingAssistantContainer } from "./ReadingAssistantContainer";
import { compareBooks, type BookComparison } from "./dictionaryComparison";
import { lookupPassage, type PassageLookup } from "./passageLookup";
import {
  dictionaryHash,
  dictionaryText,
  extractCharacters,
  FAVORITES_LIMIT,
  importShelfBackup,
  readDictionaryLink,
  readShelf,
  remember,
  SHELF_KEY,
  shelfId,
  shelfBackup,
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
  const [shelfFeedback, setShelfFeedback] = useState<string | null>(null);
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
  const resetPassageLookup = (keepResult = false) => {
    passageSerial.current++;
    passageController.current?.abort();
    setPassageBusy(false);
    if (!keepResult) setPassageResult(null);
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
  const shelfRef = useRef(shelf);
  shelfRef.current = shelf;
  useEffect(() => {
    try {
      window.localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
    } catch {
      setFeedback("浏览器未允许本机保存，收藏与最近查询仅保留到本页关闭。");
    }
  }, [shelf]);
  const pending = useRef<AbortController | null>(null);
  const serial = useRef(0);
  const copySerial = useRef(0);
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

  const invalidate = (keepResult = false) => {
    // The committed page retains its own character/book while a new query runs.
    serial.current++;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    if (!keepResult) setResult(null);
    setError(null);
    setFeedback(null);
    comparisonRequest.current++;
    comparisonController.current?.abort();
    if (!keepResult) setComparisons([]);
    setComparing(false);
  };
  const lookup = async (nextText = text, nextBook = book) => {
    invalidate(true);
    const validation = characterInputError(nextText);
    if (validation) {
      setError(validation);
      return;
    }
    const query = nextText.trim();
    setText(query);
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
        if (
          query !== character ||
          nextBook !== result?.book ||
          response.dataVersion !== result?.dataVersion
        )
          setComparisons([]);
        setCharacter(query);
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
        resetPassageLookup();
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
    (entry) =>
      shelfId(entry) === shelfId({ character, book: result?.book ?? book }),
  );
  const compare = async () => {
    if (!result) return;
    const id = ++comparisonRequest.current;
    comparisonController.current?.abort();
    const controller = new AbortController();
    comparisonController.current = controller;
    setComparing(true);
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
    resetPassageLookup(true);
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
    const lookupId = serial.current;
    const copyId = ++copySerial.current;
    try {
      await copyText(
        link
          ? `${window.location.href.split("#")[0]}${dictionaryHash({ character, book: result.book })}`
          : dictionaryText(character, result),
      );
      if (lookupId !== serial.current || copyId !== copySerial.current) return;
      setFeedback(
        link
          ? "查字链接已复制。打开链接会重新查询最新数据。"
          : "查字条目已复制，包含审核状态与数据版本。",
      );
    } catch {
      if (lookupId !== serial.current || copyId !== copySerial.current) return;
      setFeedback("复制未成功，请允许剪贴板访问后重试。");
    }
  };
  const exportShelf = () => {
    const url = URL.createObjectURL(
      new Blob([shelfBackup(shelf)], {
        type: "application/json;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "藏韵阁-我的字笺.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShelfFeedback(
      "已导出收藏字笺。可在其他浏览器或本地地址导入；查阅结果会重新获取。",
    );
  };
  const importShelf = async (file: File) => {
    try {
      if (file.size > 20000)
        throw new Error("字笺文件过大，请选择本工具导出的 JSON 文件。");
      const raw = await file.text();
      const imported = importShelfBackup(raw, shelfRef.current);
      setShelf(imported.shelf);
      setShelfFeedback(
        `已导入 ${imported.added} 条新收藏，原收藏与最近查询已保留。`,
      );
    } catch (cause) {
      setShelfFeedback(
        cause instanceof Error
          ? cause.message
          : "字笺导入失败，现有收藏已保留。",
      );
    }
  };
  return (
    <DictionaryView
      characterReference={
        character ? (
          <CharacterReference
            character={character}
            onLookup={(next) => {
              setText(next);
              void lookup(next);
            }}
          />
        ) : undefined
      }
      readingAssistant={
        passageOpen ? (
          <ReadingAssistantContainer
            text={passage}
            book={book}
            onInspect={(next) => {
              setText(next);
              void lookup(next);
            }}
          />
        ) : undefined
      }
      text={text}
      book={book}
      result={result}
      character={character}
      busy={busy}
      error={error}
      onTextChange={(next) => {
        invalidate(true);
        setText(next);
      }}
      onBookChange={(next) => {
        resetPassageLookup();
        invalidate(true);
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
      shelfFeedback={shelfFeedback}
      onExportShelf={exportShelf}
      onImportShelf={(file) => {
        void importShelf(file);
      }}
      onOpenEntry={openEntry}
      onClearRecent={() => setShelf((current) => ({ ...current, recent: [] }))}
      favorite={favorite}
      onToggleFavorite={() => {
        if (!favorite && shelf.favorites.length >= FAVORITES_LIMIT) {
          setFeedback(
            `字笺已收满 ${FAVORITES_LIMIT} 条，请先移出一条收藏再添加。原收藏已保留。`,
          );
          return;
        }
        setShelf((current) =>
          toggleFavorite(current, { character, book: result?.book ?? book }),
        );
        setFeedback(
          favorite
            ? "已移出收藏。"
            : "已收进本机字笺。打开时会重新查询当前数据。",
        );
      }}
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
