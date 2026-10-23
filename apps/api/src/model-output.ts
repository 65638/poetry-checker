export class ModelOutputError extends Error {}

/** Accept only one complete JSON value, optionally wrapped in a single Markdown code fence. */
export function parseModelOutput(envelope: unknown): unknown {
  if (!envelope || typeof envelope !== "object")
    throw new ModelOutputError("模型返回的消息不完整，请重试。");
  const choices = (envelope as { choices?: unknown }).choices;
  const choice = Array.isArray(choices) ? choices[0] : null;
  if (!choice || typeof choice !== "object")
    throw new ModelOutputError("模型未返回完整建议，请重试。");
  if (choice.finish_reason === "length")
    throw new ModelOutputError("本次生成达到长度上限，建议尚未完成，请重试。");
  if (choice.finish_reason === "content_filter")
    throw new ModelOutputError(
      "模型没有提供本次建议，可调整提问后重试；原文仍保留。",
    );
  const content: unknown = choice.message?.content;
  if (typeof content !== "string" || content.length > 40000)
    throw new ModelOutputError("模型未返回完整建议，请重试。");
  const trimmed = content.trim();
  const wrapped = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/iu.exec(trimmed);
  try {
    return JSON.parse(wrapped ? wrapped[1]! : trimmed);
  } catch {
    throw new ModelOutputError("模型建议格式异常，请重试。");
  }
}
