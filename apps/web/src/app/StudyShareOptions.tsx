import "./study-prose.css";
export function StudyShareOptions({
  includeHistory,
  onChange,
}: {
  includeHistory: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="pc-study-share-options">
      <input
        type="checkbox"
        checked={includeHistory}
        onChange={(event) => onChange(event.target.checked)}
      />
      分享时附上此前问答（收藏保留本次问答与引用背景）
    </label>
  );
}
