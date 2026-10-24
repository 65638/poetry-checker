import type { ReactNode } from "react";
import { sourceLinkUrl } from "../../utils/sourceLinks";

export function SourceLink({
  url,
  children,
}: {
  url: string | null;
  children: ReactNode;
}) {
  const href = sourceLinkUrl(url);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <span title="保留来源信息，站外跳转已关闭">{children}</span>
  );
}
