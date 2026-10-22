import { useEffect, useState } from "react";
import {
  ResearchResponseSchema,
  type ResearchResponse,
} from "@poetry/contracts";
import { readWebEnv, resolveApiConfig } from "../../app/config";
import { digest } from "../../app/library";
import "../styles/research.css";
import "../styles/research-experience.css";
import { CorpusNotes } from "./CorpusNotes";

const scope: Record<string, string> = {
  direct_context: "诗句注音",
  dictionary_sense_only: "字典义项",
  context_reading_gap: "尚无专注",
  historical_sense_comparison: "古义比较",
  historical_sense_only: "古义参考",
  historical_character_summary: "字头音韵",
  contextual_interpretation: "语境解释",
};
const status: Record<string, string> = {
  source_attested: "有来源",
  conflicting: "来源有分歧",
  disputed: "观点有分歧",
  unavailable: "尚缺依据",
};

export function ResearchNotes({
  text,
  data,
}: {
  text: string;
  data?: ResearchResponse;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{
    text: string;
    data?: ResearchResponse;
    error?: string;
  } | null>(null);
  const current = data ?? (loaded?.text === text ? loaded.data : undefined);
  const error = loaded?.text === text ? loaded.error : undefined;
  useEffect(() => {
    if (!open || data || loaded?.text === text) return;
    const controller = new AbortController();
    const { baseUrl } = resolveApiConfig(readWebEnv());
    void (async () => {
      try {
        const response = await fetch(`${baseUrl}/api/v1/research`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (!response.ok) throw new Error("参考暂不可用。");
        const value = ResearchResponseSchema.parse(await response.json());
        if (value.inputHash !== (await digest(text)))
          throw new Error("参考与当前正文不一致。");
        if (!controller.signal.aborted) setLoaded({ text, data: value });
      } catch {
        if (!controller.signal.aborted)
          setLoaded({ text, error: "参考暂不可用，可继续阅读原诗。" });
      }
    })();
    return () => controller.abort();
  }, [open, text, data, loaded]);
  const sources = new Map(current?.sources.map((s) => [s.id, s]) ?? []);
  const cite = (id: string) => {
    const s = sources.get(id);
    return s ? (
      <a href={s.url} target="_blank" rel="noreferrer">
        {s.title}
      </a>
    ) : (
      <span>来源暂缺</span>
    );
  };
  const readingCount = current
    ? current.readings.length +
      (current.corpus ?? []).reduce(
        (n, work) => n + work.coverage.directContextCount,
        0,
      )
    : 0;
  const count = !current
    ? error
      ? "暂未取得资料，可重试"
      : "查看出处与异文"
    : current.state === "unavailable"
      ? "资料暂不可用"
      : !current.readings.length &&
          !current.works.length &&
          !current.corpus?.length
        ? "暂无本诗专门资料，可查通用依据"
        : [
            readingCount > 0 ? `${readingCount}条参考` : null,
            current.works.length > 0 ? `${current.works.length}个底本` : null,
            current.corpus?.length
              ? `${current.corpus.length}篇逐字资料`
              : null,
          ]
            .filter(Boolean)
            .join(" · ");
  return (
    <details
      className="pc-research"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        读音与版本 <span>{count}</span>
      </summary>
      {open && (
        <div className="pc-research__body">
          {current?.state === "available" && (
            <p className="pc-research__intro">
              对照来源原文与注音；“异文”指不同版本之间的文字差异。
            </p>
          )}
          {!current && <p role="status">{error ?? "正在查阅…"}</p>}
          {!current && error && (
            <button
              type="button"
              className="pc-studio-action"
              onClick={() => {
                setLoaded(null);
              }}
            >
              重新查阅出处
            </button>
          )}
          {current?.state === "unavailable" && (
            <p role="status">{current.notice}</p>
          )}
          {current?.state === "available" && (
            <>
              {!current.readings.length &&
                !current.works.length &&
                !current.corpus?.length && (
                  <p>
                    这首诗暂未收录专门的注音与版本资料。下方可查阅通用格律依据。
                  </p>
                )}
              {current.corpus?.map((work) => (
                <CorpusNotes key={work.id} work={work} cite={cite} />
              ))}
              {current.readings.length > 0 && (
                <section aria-label="语境读音">
                  <h3>语境读音</h3>
                  {current.readings.map((r) => (
                    <article key={r.id}>
                      <p>
                        <strong>
                          {r.line === null
                            ? `标题「${r.target}」`
                            : `「${r.target}」`}
                        </strong>{" "}
                        {[r.modernReading, r.historicalTone]
                          .filter(Boolean)
                          .join(" · ") || "未取得专门读音"}
                        <small>
                          {status[r.status]} · {scope[r.scope] ?? "参考解释"}
                          {r.match === "related_glyphs"
                            ? " · 关联字形版本"
                            : ""}
                        </small>
                      </p>
                      <details>
                        <summary>依据</summary>
                        <p>{r.meaning}</p>
                        <p className="pc-research__original">
                          底本：{r.lineText || r.title}
                        </p>
                        {r.quote && <blockquote>{r.quote}</blockquote>}
                        <p>
                          {cite(r.sourceId)} · {r.locator}
                        </p>
                      </details>
                    </article>
                  ))}
                </section>
              )}
              {current.works.length > 0 && (
                <section aria-label="版本与注释">
                  <h3>版本与注释</h3>
                  {current.works.map((w) => (
                    <article key={w.id}>
                      <p>
                        <strong>{w.title}</strong> · {w.author}
                        <small>
                          {w.edition} ·{" "}
                          {w.match === "exact"
                            ? "正文汉字一致"
                            : "关联字形版本"}
                        </small>
                      </p>
                      {w.genre && <p>底本所列体式：{w.genre}</p>}
                      <p>
                        {w.sourceIds.map((id, i) => (
                          <span key={id}>
                            {i ? " · " : ""}
                            {cite(id)}
                          </span>
                        ))}
                      </p>
                      <details>
                        <summary>底本原文、异文与注释</summary>
                        <p className="pc-research__original">{w.text}</p>
                        {w.variants.map((v, i) => (
                          <p key={`v${i}`}>
                            异文：{v.original} / {v.variant}。{cite(v.sourceId)}{" "}
                            · {v.locator}
                            <br />
                            原引：{v.quote}
                          </p>
                        ))}
                        {w.notes.map((n, i) => (
                          <div key={`n${i}`}>
                            <p>
                              整理释义 · {n.term}：{n.meaning}
                            </p>
                            <blockquote>{n.quote}</blockquote>
                            <p>
                              {cite(n.sourceId)} · {n.locator}
                            </p>
                          </div>
                        ))}
                        {w.limitations.map((l, i) => (
                          <p key={`l${i}`}>{l}</p>
                        ))}
                      </details>
                    </article>
                  ))}
                </section>
              )}
              <details>
                <summary>格律依据与适用范围</summary>
                {current.rules.map((r) => (
                  <article key={r.id}>
                    <p>
                      <strong>{r.topic}</strong>
                      <small>{status[r.status]}</small>
                    </p>
                    <p>{r.claim}</p>
                    {r.preconditions.length > 0 && (
                      <p>适用前提：{r.preconditions.join("；")}</p>
                    )}
                    {r.doesNotApplyTo.length > 0 && (
                      <p>适用边界：{r.doesNotApplyTo.join("；")}</p>
                    )}
                    {r.disagreements.map((d, i) => (
                      <p key={i}>{d}</p>
                    ))}
                    {r.quotes.map((q, i) => (
                      <div key={i}>
                        <blockquote>{q.quote}</blockquote>
                        <p>
                          {cite(q.sourceId)} · {q.locator}
                        </p>
                      </div>
                    ))}
                  </article>
                ))}
              </details>
              <details>
                <summary>来源与整理说明</summary>
                {current.sources.map((s) => (
                  <p key={s.id}>
                    {cite(s.id)} · {s.credit}
                    <br />
                    {s.license}
                    <br />
                    {s.limitations}
                    {s.accessedAt && (
                      <small>
                        快照时间：{s.accessedAt} ·{" "}
                        {s.rawSha256 ? `SHA-256 ${s.rawSha256}` : "无原始快照"}
                      </small>
                    )}
                  </p>
                ))}
              </details>
              <p className="pc-research__notice">{current.notice}</p>
            </>
          )}
        </div>
      )}
    </details>
  );
}
