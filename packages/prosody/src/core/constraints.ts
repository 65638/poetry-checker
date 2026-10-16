import type { CheckStatus, Tone } from "@poetry/contracts";

export function checkTonePossibilities(
  actual: readonly Tone[],
  allowed: readonly Tone[],
  hasUnknown = false,
): CheckStatus {
  if (allowed.length === 0) throw new Error("规则允许集合不能为空");
  if (hasUnknown || actual.length === 0) return "uncertain";
  const matches = [...new Set(actual)].map((tone) => allowed.includes(tone));
  if (matches.every(Boolean)) return "pass";
  if (matches.every((value) => !value)) return "fail";
  return "uncertain";
}

export interface RhymeDomain {
  options: ReadonlyArray<{ tone: Tone | null; groupIds: readonly string[] }>;
  hasUnknown: boolean;
}
export interface CommonRhymeResult {
  status: CheckStatus;
  possibleCommonGroupIds: string[];
  reason:
    | "all_readings_match"
    | "no_common_group"
    | "reading_dependent"
    | "unknown"
    | "candidate_limit"
    | "no_endings";
}

// 每个 options 元素是一条完整读音，不能拼接两条读音的声调与韵部。
// 传播不同“交集状态”并去重，避免枚举整首诗的全部读音。
export function checkCommonRhyme(
  domains: readonly RhymeDomain[],
  stateLimit = 512,
): CommonRhymeResult {
  if (!Number.isSafeInteger(stateLimit) || stateLimit < 1)
    throw new Error("状态上限必须为正整数");
  if (domains.length === 0)
    return {
      status: "not_applicable",
      possibleCommonGroupIds: [],
      reason: "no_endings",
    };
  if (
    domains.some(
      (domain) =>
        domain.hasUnknown ||
        domain.options.length === 0 ||
        domain.options.some(
          (option) =>
            option.tone === null ||
            (option.tone === "P" && option.groupIds.length === 0),
        ),
    )
  ) {
    return {
      status: "uncertain",
      possibleCommonGroupIds: [],
      reason: "unknown",
    };
  }
  let states: Array<Set<string> | null> = [null];
  for (const domain of domains) {
    const next = new Map<string, Set<string>>();
    for (const state of states) {
      for (const option of domain.options) {
        const groups =
          option.tone === "P" ? new Set(option.groupIds) : new Set<string>();
        const common =
          state === null
            ? groups
            : new Set([...state].filter((group) => groups.has(group)));
        const key = JSON.stringify([...common].sort());
        next.set(key, common);
        if (next.size > stateLimit)
          return {
            status: "uncertain",
            possibleCommonGroupIds: [],
            reason: "candidate_limit",
          };
      }
    }
    states = [...next.values()];
  }
  const viable = states.filter(
    (state): state is Set<string> => state !== null && state.size > 0,
  );
  const possibleCommonGroupIds = [
    ...new Set(viable.flatMap((state) => [...state])),
  ].sort();
  if (viable.length === 0)
    return {
      status: "fail",
      possibleCommonGroupIds,
      reason: "no_common_group",
    };
  if (viable.length < states.length)
    return {
      status: "uncertain",
      possibleCommonGroupIds,
      reason: "reading_dependent",
    };
  return {
    status: "pass",
    possibleCommonGroupIds,
    reason: "all_readings_match",
  };
}
