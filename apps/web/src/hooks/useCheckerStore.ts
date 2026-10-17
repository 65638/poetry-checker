import { useSyncExternalStore } from "react";
import type { CheckerState, CheckerStore } from "../app/store";

/**
 * 把纯 TS 协调器接到 React：只做订阅，不在渲染里发请求或重判格律。
 * 用 useSyncExternalStore 避免并发模式下丢更新。
 */
export function useCheckerStore(store: CheckerStore): CheckerState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
