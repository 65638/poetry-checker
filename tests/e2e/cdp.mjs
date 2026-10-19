import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve, sep } from "node:path";
import { managedProcess, waitFor } from "../../scripts/acceptance-runtime.mjs";

function browserExecutable(override) {
  const candidates = [
    override,
    process.env.CHROME_BIN,
    ...[
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"],
      process.env.LOCALAPPDATA,
    ]
      .filter(Boolean)
      .flatMap((dir) => [
        join(dir, "Google/Chrome/Application/chrome.exe"),
        join(dir, "Microsoft/Edge/Application/msedge.exe"),
      ]),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ...(process.env.PATH ?? "")
      .split(delimiter)
      .flatMap((dir) =>
        ["google-chrome", "chromium", "chromium-browser"].map((name) =>
          join(dir, name),
        ),
      ),
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found)
    throw new Error(
      "未找到 Chrome/Edge：设置 CHROME_BIN 或传 --browser 可执行文件路径",
    );
  return found;
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("CDP WebSocket 连接失败")),
      { once: true },
    );
  });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener("message", ({ data }) => {
    const event = JSON.parse(String(data));
    if (event.id) {
      const waiter = pending.get(event.id);
      if (!waiter) return;
      pending.delete(event.id);
      clearTimeout(waiter.timer);
      if (event.error) waiter.reject(new Error(event.error.message));
      else waiter.resolve(event.result);
    } else {
      for (const fn of listeners.get(event.method) ?? []) fn(event.params);
    }
  });
  socket.addEventListener("close", () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("CDP 已断开"));
    }
    pending.clear();
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP 超时 ${method}`));
        }, 15000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, callback) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(callback);
    },
    close() {
      socket.close();
    },
  };
}

export async function launchBrowser(executable) {
  const profile = mkdtempSync(join(tmpdir(), "poetry-d3-browser-"));
  let proc, cdp;
  const stop = async () => {
    cdp?.close();
    await proc?.stop();
    // The only recursive removal is the isolated profile created above.
    if (!resolve(profile).startsWith(resolve(tmpdir()) + sep))
      throw new Error("浏览器临时目录越界");
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 200,
    });
  };
  try {
    proc = managedProcess(browserExecutable(executable), [
      "--headless=new",
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "about:blank",
    ]);
    const port = await waitFor(() => {
      proc.check();
      const file = join(profile, "DevToolsActivePort");
      return (
        existsSync(file) && Number(readFileSync(file, "utf8").split("\n")[0])
      );
    });
    const target = await waitFor(async () => {
      const list = await (
        await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(2000),
        })
      ).json();
      return list.find((t) => t.type === "page");
    });
    cdp = await connect(target.webSocketDebuggerUrl);
    for (const method of ["Page.enable", "Runtime.enable", "Network.enable"])
      await cdp.send(method);
    const evaluate = async (expression) => {
      const result = await cdp.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.text +
            ": " +
            result.exceptionDetails.exception?.description,
        );
      return result.result.value;
    };
    const click = async (selector) => {
      const point = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el || el.disabled) throw new Error('元素缺失或禁用');
        el.scrollIntoView({block:'center'});
        const r = el.getBoundingClientRect();
        return {x:r.x+r.width/2,y:r.y+r.height/2};
      })()`);
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        button: "left",
        clickCount: 1,
        ...point,
      });
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        button: "left",
        clickCount: 1,
        ...point,
      });
    };
    // text 用于 Enter/Space 等需要产生可编辑字符才对按钮生效的键；不传则与旧行为一致。
    const key = async (
      key,
      code,
      windowsVirtualKeyCode,
      modifiers = 0,
      text = undefined,
    ) => {
      const params = { key, code, windowsVirtualKeyCode, modifiers };
      if (text !== undefined) {
        params.text = text;
        params.unmodifiedText = text;
      }
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...params });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
    };
    return { cdp, evaluate, click, key, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}
