import { ArrowRight } from "lucide-react";

export function RevisionSubstitution({
  original,
  replacement,
}: {
  original: string;
  replacement: string;
}) {
  return (
    <div
      className="pc-poetry-substitution"
      role="group"
      aria-label="原文与改字建议"
    >
      <div className="pc-revision-word">
        <span>原文</span>
        <del>{original}</del>
      </div>
      <ArrowRight size={20} aria-hidden="true" />
      <div className="pc-revision-word pc-revision-word--proposed">
        <span>建议改为</span>
        <ins>{replacement}</ins>
      </div>
    </div>
  );
}
