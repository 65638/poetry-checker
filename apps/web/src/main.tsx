import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("缺少 #root 挂载点");
}

createRoot(root).render(
  <StrictMode>
    <main>诗格律检查器：业务入口待队员 D 接管（见 docs/handoffs/0003-web-foundation.md）</main>
  </StrictMode>,
);
