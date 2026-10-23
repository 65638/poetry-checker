import { studyProse } from "./studyProseText";
import "./study-prose.css";

export function StudyProse({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <p className={`pc-study-prose ${className}`.trim()}>{studyProse(text)}</p>
  );
}
