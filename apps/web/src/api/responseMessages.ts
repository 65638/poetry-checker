/** Preserve useful server explanations, but keep gateway pages and debug dumps out of reading UI. */
export function responseMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || !("error" in body)) return fallback;
  const error = body.error;
  if (
    !error ||
    typeof error !== "object" ||
    !("message" in error) ||
    typeof error.message !== "string"
  )
    return fallback;
  const message = error.message.trim();
  if (
    !message ||
    message.length > 400 ||
    message.startsWith("[") ||
    message.startsWith("{") ||
    /<!doctype|<\/?[a-z][^>]*>|\bat\s+\S+\s*\([^\n]+:\d+:\d+\)/iu.test(message)
  )
    return fallback;
  return message;
}

/** Domain schemas remain the shared contract; only their user-facing failure wording is adapted here. */
export function parseApiResponse<T>(
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false; error: unknown };
  },
  value: unknown,
  message: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(message, { cause: result.error });
  return result.data;
}
