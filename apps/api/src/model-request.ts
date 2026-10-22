import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_RETRY_DELAY_MS = 350;
const MAX_RETRY_DELAY_MS = 2000;

/** Keep retries inside the original request's abort/deadline and never repeat a successful completion. */
export async function requestModel(
  fetcher: typeof fetch,
  endpoint: string,
  init: RequestInit & { signal: AbortSignal; body: string },
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    init.signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetcher(endpoint, init);
    } catch (cause) {
      if (attempt > 0 || init.signal.aborted || !(cause instanceof TypeError))
        throw cause;
      await delay(DEFAULT_RETRY_DELAY_MS, undefined, { signal: init.signal });
      continue;
    }
    if (init.signal.aborted) {
      await response.body?.cancel();
      init.signal.throwIfAborted();
    }
    if (attempt > 0 || ![429, 500, 502, 503, 504].includes(response.status))
      return response;
    const after = response.headers.get("Retry-After");
    // A bare 429 can be an exhausted balance: only retry a short, explicit wait.
    if (response.status === 429 && after === null) return response;
    const milliseconds =
      after === null
        ? DEFAULT_RETRY_DELAY_MS
        : /^\d+(?:\.\d+)?$/u.test(after.trim())
          ? Number(after) * 1000
          : Date.parse(after) - Date.now();
    if (!Number.isFinite(milliseconds) || milliseconds > MAX_RETRY_DELAY_MS)
      return response;
    await response.body?.cancel();
    await delay(Math.max(0, milliseconds), undefined, { signal: init.signal });
  }
}
