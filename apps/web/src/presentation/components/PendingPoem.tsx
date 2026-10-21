import { LoaderCircle, Pencil } from "lucide-react";
import type { BookId } from "@poetry/contracts";
import "../styles/pending-poem.css";

const BOOKS: Record<BookId, string> = {
  pingshui: "平水韵",
  cilin: "词林正韵",
  xinyun: "中华新韵",
};

export function PendingPoem({
  text,
  rhymeBook,
  active,
  onEdit,
}: {
  text: string;
  rhymeBook: BookId;
  active: boolean;
  onEdit: () => void;
}) {
  const lines = text
    .split(/(?<=[，。！？；,;!?])|\r\n|[\r\n]/u)
    .filter((line) => line.trim());
  return (
    <section className="pc-pending" aria-label="本次分析诗文">
      <header className="pc-pending__head">
        <div>
          <p className="pc-pending__status" role="status">
            {active && <LoaderCircle size={16} aria-hidden="true" />}
            {active ? "正在分析" : "诗文原稿"}
          </p>
          <p className="pc-pending__book">{BOOKS[rhymeBook]} · 本次原文</p>
        </div>
        <button
          type="button"
          className="pc-pending__edit"
          title="返回诗文编辑"
          aria-label="返回诗文编辑"
          onClick={onEdit}
        >
          <Pencil size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="pc-pending__verses">
        {lines.map((line, index) => (
          <p className="pc-pending__line" key={index}>
            <span className="pc-pending__number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{line}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
