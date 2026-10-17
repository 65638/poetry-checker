import { useState } from "react";
import { DEV_SCENARIOS, type DevScenarioId } from "./devScenarios";

/**
 * 开发场景选择器（仅开发预览）。
 *
 * 单独成文件并由 `DevContainer` 动态 import，使生产 bundle 只保留
 * 一个 `React.lazy` 占位，不包含场景列表文案与 fixture 装载逻辑。
 */
export function DevScenarioSelector(props: {
  onLoad: (id: DevScenarioId) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const handle = (id: DevScenarioId) => {
    setError(null);
    try {
      props.onLoad(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "装载开发场景失败。");
    }
  };

  return (
    <p>
      <strong>开发合成场景</strong>（仅开发构建；不代表真实格律结论）：
      <br />
      {DEV_SCENARIOS.map((scenario) => (
        <button
          key={scenario.id}
          type="button"
          onClick={() => {
            handle(scenario.id);
          }}
        >
          {scenario.label}
        </button>
      ))}
      {error !== null ? <span role="alert"> {error}</span> : null}
    </p>
  );
}
