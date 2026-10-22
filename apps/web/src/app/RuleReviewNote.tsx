import type { Critique } from "@poetry/contracts";

export function RuleReviewNote({ review }: { review: Critique["ruleReview"] }) {
  if (!review) return null;
  return (
    <aside className="pc-rule-review-note" aria-label="本次评议的格律依据">
      <p className="pc-studio-meta">{review.summary}</p>
      {review.checks.length > 0 && (
        <details>
          <summary>展开 {review.checks.length} 项格律依据</summary>
          {review.reference && (
            <p className="pc-studio-meta">参考格式：{review.reference}</p>
          )}
          <ul>
            {review.checks.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
