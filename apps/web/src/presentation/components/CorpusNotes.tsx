import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CorpusResearchWork } from "@poetry/contracts";

const label: Record<string, string> = {
  source_attested: "有来源",
  conflicting: "来源有分歧",
  unavailable: "尚缺注音",
  inferred: "推断参考",
};
const where = (value: string | Record<string, unknown> | null) =>
  value === null
    ? "来源未列定位"
    : typeof value === "string"
      ? value
      : [value.heading, value.xpath, value.line ? `第${value.line}条` : null]
          .filter(Boolean)
          .join(" · ");

export function CorpusNotes({
  work,
  cite,
}: {
  work: CorpusResearchWork;
  cite: (id: string) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const size = 80;
  const pages = Math.ceil(work.readings.length / size);
  const conflicts = work.readings.filter((r) => r.status === "conflicting");
  const missing = work.readings.filter(
    (r) => r.evidenceScope === "unavailable",
  );
  const reading = (r: CorpusResearchWork["readings"][number]) => (
    <details key={r.hanOffset} className="pc-corpus__reading">
      <summary>
        <strong>{r.character}</strong>
        <span>
          {r.modernReading ?? (r.status === "conflicting" ? "有分歧" : "待补")}
        </span>
      </summary>
      <p>
        原文第{r.paragraphNumber}段 · 第{r.codepointColumn}个字符 ·{" "}
        {label[r.status]}
      </p>
      {r.candidates.map((c, i) => (
        <div key={i}>
          <p>
            {c.modernReading ?? "未标今音"}
            {c.historicalTone ? ` · 古声参考：${c.historicalTone}` : ""}
          </p>
          {c.quote && <blockquote>{c.quote}</blockquote>}
          <p>
            {c.sourceIds.map((id) => (
              <span key={id}>{cite(id)} </span>
            ))}
          </p>
          <small>
            {c.evidenceScope === "direct_context" ? "本诗注音" : "字义参考"}
          </small>
          <details className="pc-corpus__locator">
            <summary>来源定位信息</summary>
            <p>{where(c.locator)}</p>
          </details>
        </div>
      ))}
      {!r.candidates.length && <p>本次未取得可绑定到该字位的注音出处。</p>}
    </details>
  );
  return (
    <section className="pc-corpus" aria-label={`${work.title}逐字出处`}>
      <h3>本篇注音出处</h3>
      <p>
        {work.coverage.directContextCount} / {work.coverage.hanCount}
        字有语境依据
        {conflicts.length > 0 ? ` · ${conflicts.length}处分歧` : ""}
        {missing.length > 0 ? ` · ${missing.length}字待补` : ""}
      </p>
      <small>
        网页注音供参考，独立注本尚待补充；现代读音不直接决定古平仄。字符位置包含标点。
      </small>
      {conflicts.length > 0 && (
        <details>
          <summary>读音分歧（{conflicts.length}处）</summary>
          {conflicts.map(reading)}
        </details>
      )}
      {missing.length > 0 && (
        <details>
          <summary>尚缺出处（{missing.length}字）</summary>
          <p>
            {missing
              .map(
                (r) =>
                  `${r.character}（第${r.paragraphNumber}段第${r.codepointColumn}字位）`,
              )
              .join("、")}
          </p>
        </details>
      )}
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>逐字注音与出处</summary>
        {expanded && (
          <>
            {pages > 1 && (
              <div className="pc-corpus__paging">
                <button
                  type="button"
                  title="上一页注音"
                  aria-label="上一页注音"
                  disabled={page === 0}
                  onClick={() => setPage((n) => n - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {page + 1} / {pages}
                </span>
                <button
                  type="button"
                  title="下一页注音"
                  aria-label="下一页注音"
                  disabled={page >= pages - 1}
                  onClick={() => setPage((n) => n + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
            <div className="pc-corpus__readings">
              {work.readings.slice(page * size, (page + 1) * size).map(reading)}
            </div>
          </>
        )}
      </details>
      {work.notes.length > 0 && (
        <details>
          <summary>字词注释（{work.notes.length}条）</summary>
          {work.notes.map((n, i) => (
            <article key={i}>
              <strong>{n.term ?? "注释原句"}</strong>
              <blockquote>{n.quote}</blockquote>
              <p>
                {n.sourceIds.map((id) => (
                  <span key={id}>{cite(id)} </span>
                ))}
              </p>
              <small>{where(n.locator)}</small>
            </article>
          ))}
        </details>
      )}
      {work.variants.length > 0 && (
        <details>
          <summary>来源正文差异（{work.variants.length}份）</summary>
          <small>包含网页括注及编者说明，不一定是古本异文。</small>
          {work.variants.map((v) => (
            <article key={v.variantId}>
              <p className="pc-research__original">{v.sourceText}</p>
              <p>
                {v.sourceIds.map((id) => (
                  <span key={id}>{cite(id)} </span>
                ))}
              </p>
            </article>
          ))}
        </details>
      )}
      {work.formClaims.length > 0 && (
        <details>
          <summary>体式相关摘录</summary>
          <small>摘录可能比较其他作品，不能直接用于判定本篇诗体。</small>
          {work.formClaims.map((f, i) => (
            <article key={i}>
              <blockquote>{f.quote}</blockquote>
              <p>
                {f.sourceIds.map((id) => (
                  <span key={id}>{cite(id)} </span>
                ))}
              </p>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
