import { useId } from "react";
import type {
  ReadingOverride,
  ReadingSuggestionResponse,
} from "@poetry/contracts";
import "../styles/reading-assistant.css";

export function ReadingAssistantView(props: {
  model: string;
  configured: boolean;
  statusText: string | null;
  result: ReadingSuggestionResponse | null;
  error: string | null;
  busy: boolean;
  disabled: boolean;
  onRequest: () => void;
  onRefreshStatus: () => void;
  onCancel: () => void;
  onChooseReading?: (override: ReadingOverride) => void;
  onInspect?: (character: string) => void;
}) {
  const uid = useId();
  return (
    <section className="pc-reading-assistant" aria-labelledby={`${uid}-title`}>
      <div className="pc-reading-assistant__head">
        <h3 id={`${uid}-title`}>AI 辨音</h3>
        <span>{props.model}</span>
      </div>
      <div className="pc-reading-assistant__actions">
        <button
          type="button"
          className="pc-button pc-reading-assistant__request"
          disabled={!props.configured || props.disabled || props.busy}
          onClick={props.onRequest}
        >
          {props.busy ? "GLM 正在斟酌…" : "请 GLM 辨音"}
        </button>
        {props.busy && (
          <button
            type="button"
            className="pc-button pc-button--quiet"
            onClick={props.onCancel}
          >
            取消
          </button>
        )}
        {!props.configured && (
          <button
            type="button"
            className="pc-button pc-button--quiet"
            onClick={props.onRefreshStatus}
          >
            检查连接
          </button>
        )}
      </div>
      {props.statusText && <p role="status">{props.statusText}</p>}
      {props.configured && !props.result && (
        <p className="pc-reading-assistant__notice">
          诗句与候选将发送至智谱。AI建议供参考，按账户额度计费。
        </p>
      )}
      {props.error && <p role="alert">{props.error}</p>}
      {props.result && (
        <div className="pc-reading-assistant__result" aria-live="polite">
          {!props.result.suggestions.length && (
            <p>当前没有需要辨析的多候选字位。</p>
          )}
          <ol>
            {props.result.suggestions.map((item) => (
              <li key={item.tokenId}>
                <div className="pc-reading-assistant__entry">
                  <strong>
                    「{item.character}」{item.pronunciation ?? "读音未定"}
                  </strong>
                  <span>
                    第{item.line}句·第{item.column}字
                  </span>
                </div>
                {item.candidate && (
                  <p>
                    {item.groupNames.join("、")} ·{" "}
                    {item.candidate.tone === "P"
                      ? "平"
                      : item.candidate.tone === "Z"
                        ? "仄"
                        : "声调未定"}
                  </p>
                )}
                <p>{item.reason}</p>
                {item.candidate && (
                  <p className="pc-reading-assistant__notice">
                    {item.evidenceApproved
                      ? "候选依据已审；语境建议未经人审。"
                      : "候选依据待审；本建议不改变审核状态。"}
                  </p>
                )}
                <div className="pc-reading-assistant__actions">
                  {item.candidateId && props.onChooseReading && (
                    <button
                      type="button"
                      className="pc-button"
                      disabled={props.disabled || props.busy}
                      onClick={() =>
                        props.onChooseReading?.({
                          tokenId: item.tokenId,
                          readingId: item.candidateId!,
                        })
                      }
                    >
                      采用此读音并重查
                    </button>
                  )}
                  {props.onInspect && (
                    <button
                      type="button"
                      className="pc-button pc-button--quiet"
                      onClick={() => props.onInspect?.(item.character)}
                    >
                      查「{item.character}」字
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {!!props.result.missingTokenIds.length && (
            <p>
              另有{props.result.missingTokenIds.length}个字位未收录，保留未定。
            </p>
          )}
          {props.result.truncated && (
            <p>本次取前24个多候选字位，可分段继续。</p>
          )}
          <p className="pc-reading-assistant__notice">{props.result.notice}</p>
        </div>
      )}
    </section>
  );
}
