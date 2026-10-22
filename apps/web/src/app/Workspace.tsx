import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { CheckerViewProps } from "../view-contract";
import { CheckerView } from "../presentation/CheckerView";
import { useMotionPreference } from "../presentation/useMotionPreference";
import { DictionaryContainer } from "./DictionaryContainer";
import "../presentation/styles/dictionary.css";
import { DRAFT_KEY } from "./draftPersistence";
import { ContinuousGarden } from "../presentation/components/ContinuousGarden";
import "../presentation/styles/continuous-garden.css";
import "../presentation/styles/poetry-studio.css";
import "../presentation/styles/library-atmosphere.css";
import "../presentation/styles/final-polish.css";
import "../presentation/styles/three-round-polish.css";
import "../presentation/styles/final-frontend.css";
import "../presentation/styles/product-refinement.css";
import "../presentation/styles/reading-experience.css";
import { LibraryContainer } from "./LibraryContainer";
import { PoetryDesk } from "./PoetryDesk";
import { ReadingTools } from "../presentation/components/ReadingTools";
import { CharacterReference } from "./CharacterReference";
import {
  NOTEBOOK_KEY,
  NOTEBOOK_LIMIT,
  readNotebook,
  type NotebookEntry,
} from "./notebook";
import type { InputDraft } from "../view-contract";

type Place = "checker" | "dictionary" | "library";
const places: Place[] = ["checker", "dictionary", "library"];
const initialPlace = (): Place =>
  /^#library(?:\?|$)/u.test(window.location.hash)
    ? "library"
    : /^#dictionary(?:\?|$)/u.test(window.location.hash)
      ? "dictionary"
      : "checker";

export function Workspace(props: CheckerViewProps) {
  const [place, setPlace] = useState<Place>(initialPlace);
  const [sceneryPlace, setSceneryPlace] = useState<Place>(initialPlace);
  const [direction, setDirection] = useState("forward");
  const motion = useMotionPreference();
  const scrollPositions = useRef({ checker: 0, dictionary: 0, library: 0 });
  const current = useRef(place);
  const rendered = useRef(place);
  const transition = useRef<ViewTransition | null>(null);
  const pendingPlace = useRef<Place | null>(null);
  const switchLatest = useRef<(next: Place) => void>(() => {});
  const [requestedPlace, setRequestedPlace] = useState<Place>(initialPlace);
  const journey = useRef(0);
  const panels = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);
  const [passageRequest, setPassageRequest] = useState(0);
  const [notebook, setNotebook] = useState(readNotebook);
  const [notebookNotice, setNotebookNotice] = useState<string | null>(null);
  const [workMode, setWorkMode] = useState<"writing" | "reading">("writing");
  const undoStack = useRef<InputDraft[]>([]);
  const redoStack = useRef<InputDraft[]>([]);
  const draft = useRef(props.draft);
  draft.current = props.draft;
  function persistNotebook(next: NotebookEntry[]) {
    setNotebook(next);
    try {
      localStorage.setItem(
        NOTEBOOK_KEY,
        JSON.stringify({ version: 1, entries: next }),
      );
      setNotebookNotice("推敲笺已存于此设备。");
    } catch {
      setNotebookNotice(
        "修改已保留在本次会话，推敲笺未能写入设备，请导出备份。",
      );
    }
  }
  function revise(
    next: InputDraft,
    note: string,
    action: "edit" | "undo" | "redo" = "edit",
  ) {
    const before =
      JSON.stringify(next) === JSON.stringify(props.draft)
        ? (notebook.at(-1)?.after ?? props.draft)
        : props.draft;
    if (action === "edit" && JSON.stringify(before) !== JSON.stringify(next)) {
      undoStack.current.push(before);
      redoStack.current = [];
    }
    persistNotebook(
      [
        ...notebook,
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          before,
          after: next,
          note,
        },
      ].slice(-NOTEBOOK_LIMIT),
    );
    props.onDraftChange(next, { autoAnalyze: false });
  }
  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(props.draft);
    revise(previous, "撤销上次修改", "undo");
  }
  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(props.draft);
    revise(next, "重做修改", "redo");
  }
  useEffect(() => {
    setSaved(false);
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(props.draft));
        setSaved(true);
      } catch {
        setSaved(false);
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [props.draft]);
  useEffect(() => {
    const flush = () => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft.current));
      } catch {
        /* Storage can be unavailable. */
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);
  const switchPlace = (next: Place) => {
    setRequestedPlace(next);
    // Never tear down a visible snapshot to start another one: Chromium exposes
    // the destination for a frame when skipTransition() is used mid-flight.
    // Coalesce rapid input into one latest destination, then continue the walk.
    if (transition.current) {
      pendingPlace.current = next;
      return;
    }
    if (current.current === next) return;
    scrollPositions.current[rendered.current] = window.scrollY;
    const previous = current.current;
    current.current = next;
    const id = ++journey.current;
    const heading =
      places.indexOf(next) > places.indexOf(previous) ? "forward" : "backward";
    const previousScroll = window.scrollY;
    const update = () => {
      if (id !== journey.current) return;
      flushSync(() => {
        setDirection(heading);
        props.onCloseEvidence();
        setPlace(next);
      });
      document.documentElement.style.setProperty(
        "--pc-journey-scroll-shift",
        `${window.scrollY - previousScroll}px`,
      );
    };
    if (!motion.effects || !document.startViewTransition) {
      transition.current = null;
      delete document.documentElement.dataset.journey;
      document.documentElement.style.removeProperty("--pc-journey-span");
      update();
      setSceneryPlace(next);
      return;
    }
    document.documentElement.dataset.journey = heading;
    document.documentElement.style.setProperty(
      "--pc-journey-span",
      `${document.documentElement.clientWidth}px`,
    );
    const nextTransition = document.startViewTransition(update);
    transition.current = nextTransition;
    // Snapshot failure still commits the destination without leaving the world behind.
    const moveScenery = () => {
      if (id === journey.current) setSceneryPlace(next);
    };
    void nextTransition.ready.then(moveScenery, moveScenery);
    void nextTransition.finished
      .finally(() => {
        if (id !== journey.current) return;
        transition.current = null;
        delete document.documentElement.dataset.journey;
        document.documentElement.style.removeProperty("--pc-journey-span");
        document.documentElement.style.removeProperty(
          "--pc-journey-scroll-shift",
        );
        const pending = pendingPlace.current;
        pendingPlace.current = null;
        if (pending !== null && pending !== current.current)
          switchLatest.current(pending);
      })
      .catch(() => {});
  };
  switchLatest.current = switchPlace;
  useEffect(() => {
    const sync = () => switchPlace(initialPlace());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  });
  const first = useRef(true);
  useLayoutEffect(() => {
    rendered.current = place;
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({
      top: scrollPositions.current[place],
      behavior: "instant",
    });
    panels.current
      ?.querySelector<HTMLElement>(`#${place}-space`)
      ?.focus({ preventScroll: true });
  }, [place]);
  useEffect(() => {
    if (!motion.effects) transition.current?.skipTransition();
  }, [motion.effects]);
  useEffect(
    () => () => {
      journey.current++;
      pendingPlace.current = null;
      transition.current?.skipTransition();
      delete document.documentElement.dataset.journey;
      document.documentElement.style.removeProperty("--pc-journey-span");
    },
    [],
  );
  const navigate = (next: Place) => {
    window.location.hash = next;
    switchPlace(next);
  };
  useEffect(() => {
    // During a snapshot transition Chromium hit-tests captured navigation as
    // the document root. Keep its stationary buttons usable for a reversal.
    const navigateSnapshot = (event: MouseEvent) => {
      if (
        !transition.current ||
        event.target !== document.documentElement ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const buttons =
        panels.current?.parentElement?.querySelectorAll<HTMLButtonElement>(
          ".pc-places button[aria-controls]",
        );
      for (const button of buttons ?? []) {
        const rect = button.getBoundingClientRect();
        if (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        ) {
          const target = button
            .getAttribute("aria-controls")
            ?.replace(/-space$/u, "") as Place;
          if (places.includes(target)) navigate(target);
          break;
        }
      }
    };
    window.addEventListener("click", navigateSnapshot);
    return () => window.removeEventListener("click", navigateSnapshot);
  });
  return (
    <div
      className="pc-root pc-workspace"
      data-place={place}
      data-requested-place={requestedPlace}
      data-direction={direction}
      data-motion={motion.effects ? "on" : "off"}
    >
      <a
        className="pc-skip-link"
        href={`#${place}-space`}
        onClick={(event) => {
          event.preventDefault();
          document.getElementById(`${place}-space`)?.focus();
        }}
      >
        跳到主要内容
      </a>
      <ContinuousGarden
        place={sceneryPlace}
        active={motion.effects}
        quiet={
          place !== "checker" ||
          !!props.report ||
          props.busy ||
          props.selectedTokenId !== null
        }
      />
      <nav
        className="pc-places"
        aria-label="游园导航"
        inert={place === "checker" && props.selectedTokenId !== null}
      >
        <span className="pc-places__caption">
          <span className="pc-places__seal" aria-hidden="true">
            韵
          </span>
          <span>
            月下听韵<small>一庭山水 · 三处书声</small>
          </span>
        </span>
        <div className="pc-places__links">
          <button
            type="button"
            aria-current={place === "checker" ? "page" : undefined}
            aria-controls="checker-space"
            data-requested={requestedPlace === "checker" && place !== "checker"}
            onClick={() => navigate("checker")}
          >
            <span aria-hidden="true">壹</span>
            <b>
              校诗台<small>听雨 · 校诗</small>
            </b>
          </button>
          <button
            type="button"
            aria-current={place === "dictionary" ? "page" : undefined}
            aria-controls="dictionary-space"
            data-requested={
              requestedPlace === "dictionary" && place !== "dictionary"
            }
            onClick={() => navigate("dictionary")}
          >
            <span aria-hidden="true">贰</span>
            <b>
              藏韵阁<small>临水 · 寻字</small>
            </b>
          </button>
          <button
            type="button"
            aria-current={place === "library" ? "page" : undefined}
            aria-controls="library-space"
            data-requested={requestedPlace === "library" && place !== "library"}
            onClick={() => navigate("library")}
          >
            <span aria-hidden="true">叁</span>
            <b>
              典籍馆<small>灯前 · 展卷</small>
            </b>
          </button>
        </div>
      </nav>
      <div ref={panels}>
        <div
          id="checker-space"
          className="pc-place"
          role="region"
          aria-label="校诗台"
          tabIndex={-1}
          hidden={place !== "checker"}
        >
          <CheckerView
            {...props}
            onDraftChange={(next, options) => {
              if (JSON.stringify(next) !== JSON.stringify(props.draft))
                redoStack.current = [];
              props.onDraftChange(next, options);
            }}
            onLoadExample={(id) => {
              redoStack.current = [];
              props.onLoadExample(id);
            }}
            sharedScene
            draftTools={
              <div className="pc-draft-tools">
                <span className="pc-draft-save" role="status">
                  {saved ? "草稿已存于此设备" : ""}
                </span>
                {props.draft.text.trim() && (
                  <div className="pc-explore-current">
                    <button
                      type="button"
                      onClick={() => {
                        setPassageRequest((n) => n + 1);
                        navigate("dictionary");
                      }}
                    >
                      带此诗查字 <span aria-hidden="true">→</span>
                    </button>
                  </div>
                )}
              </div>
            }
            readingAssistant={(() => {
              const token = props.report?.poem.tokens.find(
                (t) => t.tokenId === props.selectedTokenId,
              );
              return token ? (
                <CharacterReference
                  key={token.tokenId}
                  character={token.text}
                  onLookup={(char) => {
                    window.location.hash = `dictionary?char=${encodeURIComponent(char)}&book=${props.draft.rhymeBook}`;
                    switchPlace("dictionary");
                  }}
                />
              ) : undefined;
            })()}
            poetryDesk={
              <PoetryDesk
                checker={props}
                entries={notebook}
                notice={notebookNotice}
                onRevise={revise}
                onImport={(incoming) => {
                  const ids = new Set(notebook.map((n) => n.id));
                  if (
                    incoming.some(
                      (n) =>
                        ids.has(n.id) &&
                        JSON.stringify(n) !==
                          JSON.stringify(
                            notebook.find((old) => old.id === n.id),
                          ),
                    )
                  )
                    throw new Error("推敲笺有相同ID但内容不同的记录，未合并。");
                  const merged = [
                    ...notebook,
                    ...incoming.filter((n) => !ids.has(n.id)),
                  ].sort((a, b) => a.at.localeCompare(b.at));
                  if (merged.length > NOTEBOOK_LIMIT)
                    throw new Error("合并后超过80笺，请先导出备份后分批整理。");
                  persistNotebook(merged);
                }}
                onUndo={undo}
                onRedo={redo}
                canUndo={undoStack.current.length > 0}
                canRedo={redoStack.current.length > 0}
                mode={workMode}
                onModeChange={setWorkMode}
              />
            }
          />
        </div>
        <div
          id="dictionary-space"
          className="pc-place"
          role="region"
          aria-label="藏韵阁"
          tabIndex={-1}
          hidden={place !== "dictionary"}
        >
          <DictionaryContainer
            poemText={props.draft.text}
            passageRequest={passageRequest}
          />
        </div>
        <div
          id="library-space"
          className="pc-place"
          role="region"
          aria-label="典籍馆"
          tabIndex={-1}
          hidden={place !== "library"}
        >
          <LibraryContainer
            active={place === "library"}
            onStudy={(work) => {
              revise(
                {
                  ...props.draft,
                  text: work.paragraphs.join("\n"),
                  genreHint: "auto",
                  formHint: "auto",
                },
                `研读《${work.title}》·${work.author}；来源：${work.source}`,
              );
              setWorkMode("reading");
              navigate("checker");
              props.onAnalyze();
            }}
            onLookup={(char) => {
              window.location.hash = `dictionary?char=${encodeURIComponent(char)}&book=${props.draft.rhymeBook}`;
              switchPlace("dictionary");
            }}
          />
        </div>
      </div>
      <ReadingTools place={place} />
    </div>
  );
}
