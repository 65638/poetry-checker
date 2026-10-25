import { createServer, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHARACTER_LOOKUP_TIMEOUT_MS,
  createCharacterLookup,
} from "../src/api/characters";

const missing = {
  book: "pingshui",
  dataVersion: "controlled-test",
  entries: [],
  missing: ["月"],
  groups: [],
  evidence: [],
  sources: [],
};

async function hangingServer(write: (reply: ServerResponse) => void) {
  let started!: () => void;
  const received = new Promise<void>((resolve) => {
    started = resolve;
  });
  const server = createServer((_request, reply) => {
    write(reply);
    started();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    received,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

afterEach(() => vi.useRealTimers());

describe("查字网络期限与取消", () => {
  it("普通查字15秒截止，与模型研读预算分开", () => {
    expect(CHARACTER_LOOKUP_TIMEOUT_MS).toBe(15_000);
  });

  it.each(["headers", "body"] as const)(
    "真实HTTP在%s阶段不结束时，超时可重试且不误报未收录",
    async (phase) => {
      let requests = 0;
      const server = await hangingServer((reply) => {
        if (++requests > 1) {
          reply.end(JSON.stringify(missing));
          return;
        }
        if (phase === "body") {
          reply.writeHead(200, { "Content-Type": "application/json" });
          reply.write('{"book":"pingshui",');
        }
      });
      try {
        const signal = new AbortController().signal;
        const lookup = createCharacterLookup(server.url, fetch, 300);
        await expect(lookup("月", "pingshui", signal)).rejects.toThrow(
          "查字等候超时，请重试",
        );
        await server.received;
        expect(signal.aborted).toBe(false);
        await expect(lookup("月", "pingshui", signal)).resolves.toEqual(
          missing,
        );
      } finally {
        await server.close();
      }
    },
  );

  it("读取真实未结束正文时，主动取消保留AbortError并立即退出", async () => {
    const server = await hangingServer((reply) => {
      reply.writeHead(200, { "Content-Type": "application/json" });
      reply.write('{"book":"pingshui",');
    });
    try {
      const controller = new AbortController();
      const pending = createCharacterLookup(server.url)(
        "月",
        "pingshui",
        controller.signal,
      );
      const rejected = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });
      await server.received;
      controller.abort();
      await rejected;
    } finally {
      await server.close();
    }
  });

  it("预先取消不发请求，也不建立定时器", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>();
    const signal = AbortSignal.abort();
    await expect(
      createCharacterLookup("", fetcher)("月", "pingshui", signal),
    ).rejects.toBe(signal.reason);
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("成功与普通失败均清理截止定时器；下一次请求仍可正常查询", async () => {
    vi.useFakeTimers();
    let fail = true;
    const fetcher: typeof fetch = async () => {
      if (fail) throw new TypeError("Controlled offline");
      return new Response(JSON.stringify(missing));
    };
    const lookup = createCharacterLookup("", fetcher);
    await expect(
      lookup("月", "pingshui", new AbortController().signal),
    ).rejects.toThrow("连接不上查字服务");
    expect(vi.getTimerCount()).toBe(0);
    fail = false;
    await expect(
      lookup("月", "pingshui", new AbortController().signal),
    ).resolves.toEqual(missing);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("主动取消清理定时器，并拒绝忽略取消后迟到的成功正文", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher: typeof fetch = async () => {
      controller.abort();
      return new Response(JSON.stringify(missing));
    };
    await expect(
      createCharacterLookup("", fetcher)("月", "pingshui", controller.signal),
    ).rejects.toBe(controller.signal.reason);
    expect(vi.getTimerCount()).toBe(0);
  });
});
