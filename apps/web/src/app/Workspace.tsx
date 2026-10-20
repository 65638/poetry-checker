import { useEffect, useRef, useState } from "react";
import type { CheckerViewProps } from "../view-contract";
import { CheckerView } from "../presentation/CheckerView";
import { useMotionPreference } from "../presentation/useMotionPreference";
import { DictionaryContainer } from "./DictionaryContainer";
import "../presentation/styles/dictionary.css";
import { DRAFT_KEY } from "./draftPersistence";

type Place = "checker" | "dictionary";
const initialPlace = (): Place =>
  /^#dictionary(?:\?|$)/u.test(window.location.hash) ? "dictionary" : "checker";

export function Workspace(props: CheckerViewProps) {
  const [place, setPlace] = useState<Place>(initialPlace);
  const [direction, setDirection] = useState("forward");
  const motion = useMotionPreference();
  const scrollPositions = useRef({ checker: 0, dictionary: 0 });
  const current = useRef(place);
  const panels = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);
  const [passageRequest, setPassageRequest] = useState(0);
  const draft = useRef(props.draft);
  draft.current = props.draft;
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
    if (current.current === next) return;
    scrollPositions.current[current.current] = window.scrollY;
    current.current = next;
    setDirection(next === "dictionary" ? "forward" : "backward");
    props.onCloseEvidence();
    setPlace(next);
  };
  useEffect(() => {
    const sync = () => switchPlace(initialPlace());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  });
  const first = useRef(true);
  useEffect(() => {
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
  const navigate = (next: Place) => {
    window.location.hash = next === "dictionary" ? "dictionary" : "checker";
    switchPlace(next);
  };
  return (
    <div
      className="pc-root pc-workspace"
      data-place={place}
      data-direction={direction}
      data-motion={motion.effects ? "on" : "off"}
    >
      <nav
        className="pc-places"
        aria-label="游园导航"
        inert={place === "checker" && props.selectedTokenId !== null}
      >
        <span className="pc-places__caption">
          月下听韵 <i aria-hidden="true" /> 两处风景
        </span>
        <div className="pc-places__links">
          <button
            type="button"
            aria-current={place === "checker" ? "page" : undefined}
            aria-controls="checker-space"
            onClick={() => navigate("checker")}
          >
            <span aria-hidden="true">壹</span> 校诗台
          </button>
          <span className="pc-places__path" aria-hidden="true">
            ···
          </span>
          <button
            type="button"
            aria-current={place === "dictionary" ? "page" : undefined}
            aria-controls="dictionary-space"
            onClick={() => navigate("dictionary")}
          >
            <span aria-hidden="true">贰</span> 藏韵阁
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
          {props.draft.text.trim() && (
            <div className="pc-explore-current">
              <button
                type="button"
                onClick={() => {
                  setPassageRequest((n) => n + 1);
                  navigate("dictionary");
                }}
              >
                {props.error?.code === "HTTP_503"
                  ? "分析数据尚未就绪，先逐字查阅 →"
                  : "带这首诗去藏韵阁 →"}
              </button>
            </div>
          )}
          <span className="pc-draft-save" role="status">
            {saved ? "草稿已存于此设备" : ""}
          </span>
          <CheckerView {...props} />
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
      </div>
    </div>
  );
}
