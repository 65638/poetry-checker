export function LibraryQueryHelp({
  onApply,
}: {
  onApply: (query: string) => void;
}) {
  return (
    <details className="pc-library-query-help">
      <summary>检索用法：多词、作者与排除词</summary>
      <p className="pc-studio-meta">
        用空格分开多个词，会同时查找；用“作者:”“题名:”“朝代:”“正文:”“标签:”限定范围。
        词前加减号排除结果，双引号保留完整短语。检索保留原文的简繁字形。
      </p>
      <div className="pc-studio-actions">
        {["李白 明月", "作者:王维", "明月 -题名:静夜思"].map((query) => (
          <button
            key={query}
            type="button"
            className="pc-studio-action"
            onClick={() => onApply(query)}
          >
            {query}
          </button>
        ))}
      </div>
    </details>
  );
}
