import { Component, lazy, Suspense, type ReactNode } from "react";

export const loadDictionarySection = () => import("./DictionaryContainer");
export const loadLibrarySection = () => import("./LibraryContainer");
export const LazyDictionary = lazy(() =>
  loadDictionarySection().then((module) => ({
    default: module.DictionaryContainer,
  })),
);
export const LazyLibrary = lazy(() =>
  loadLibrarySection().then((module) => ({ default: module.LibraryContainer })),
);

class SectionBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="pc-section-loading" role="alert">
        <p>{this.props.name}暂时未能打开。可能是连接中断，或网站刚刚更新。</p>
        <p>可以先返回校诗台继续编辑；联网后刷新页面再试。</p>
        <button type="button" onClick={() => window.location.reload()}>
          刷新重试
        </button>
      </div>
    );
  }
}
export function DeferredSection({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <SectionBoundary name={name}>
      <Suspense
        fallback={
          <div className="pc-section-loading" role="status" aria-live="polite">
            <p>正在展开{name}…</p>
            <p>首次打开需要载入，稍候片刻。</p>
          </div>
        }
      >
        {children}
      </Suspense>
    </SectionBoundary>
  );
}
