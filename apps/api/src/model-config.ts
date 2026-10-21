import { ModelProviderSchema, type ModelProvider } from "@poetry/contracts";

export const GLM_ENDPOINT =
  "https://open.bigmodel.cn/api/paas/v4/chat/completions";
export const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

// DeepSeek 的推理响应通常比 GLM 更慢；保留 GLM 的既有口径，按供应商只放宽默认值。
export const DEFAULT_MODEL_TIMEOUT_MS = {
  zhipu: 45_000,
  deepseek: 90_000,
} as const;
export const DEFAULT_ANALYSIS_TIMEOUT_MS = {
  zhipu: 20_000,
  deepseek: 90_000,
} as const;

export function resolveModelConfig(
  options: { provider?: ModelProvider; apiKey?: string; model?: string } = {},
  environment: NodeJS.ProcessEnv = process.env,
) {
  const provider = ModelProviderSchema.parse(
    options.provider ??
      (options.apiKey !== undefined
        ? "zhipu"
        : environment.POETRY_AI_PROVIDER ||
          (environment.DEEPSEEK_API_KEY?.trim() ? "deepseek" : "zhipu")),
  );
  const deepseek = provider === "deepseek";
  return {
    provider,
    name: deepseek ? "DeepSeek" : "GLM",
    endpoint: deepseek ? DEEPSEEK_ENDPOINT : GLM_ENDPOINT,
    apiKey: (
      options.apiKey ??
      (deepseek ? environment.DEEPSEEK_API_KEY : environment.ZHIPU_API_KEY) ??
      ""
    ).trim(),
    model:
      options.model ??
      (deepseek
        ? environment.DEEPSEEK_MODEL || "deepseek-flash"
        : environment.ZHIPU_MODEL || "glm-5.3-flash"),
  };
}
