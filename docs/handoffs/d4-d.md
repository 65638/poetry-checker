# D4 前端业务收口（队员 D）

## 基线与环境

| 项 | 值 |
| --- | --- |
| 任务卡 | D4 前端业务收口，不做视觉新设计 |
| base | `origin/integrate/d4` = **`898b1a0a26a5f6e8e79a0b2cb31848b24537a185`** |
| 分支 | `feat/d-d4-closeout` |
| head | 本文件随该提交入库；精确值用 `git rev-parse HEAD` 查（工作树 dirty=false） |
| Node / pnpm | 24.19.0 / 11.25.0 |
| 本机安装 | `pnpm install --frozen-lockfile --config.node-linker=hoisted`（本机符号链接权限受限，见 apps/web/README.md 第 2 节） |

> 未收到组长广播的 SHA 消息；此处记录的是 `git rev-parse origin/integrate/d4` 的实测值。
> 未使用 `origin/main@05e1acb` 作为基线。

## 改动文件（全部在 D4 允许范围内）

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `apps/web/src/app/store.ts` | 修改 | `abort()` 改为复用 `invalidateInFlight()`：递增请求身份再中止 |
| `apps/web/tests/closeout-d4.test.ts` | 新增 | 12 项：并发导出归属、编辑/换书、超时后导出资格、五类状态透传、取消后迟到成功 |
| `apps/web/README.md` | 重写 | 用户可执行的安装/启动/使用说明（环境、端口识别、`/` 与合成预览的区别、健康与就绪、选音重查导出、503 处置） |
| `docs/ui.md` | 增补 | D4-1 状态表、D4-2 对 D1 表述的更正、D4-3 验收事实与覆盖位置、D4-4 未运行项 |

未改：`apps/web/src/presentation/**`、`public/design/**`、`view-contract.ts`、
公共契约、`apps/api`、根配置/CI/lockfile、`tests/e2e`（E 单写）、金标准与审批原件。

## 本轮修复的产品缺陷

### `abort()` 只中止信号，不递增请求身份

- **现象**：调用 `store.abort()`（取消/卸载/切场景）后，若底层传输已经收到响应而忽略
  abort（缓冲、代理、已排队的响应），那次**迟到的成功**仍会通过身份守卫落地成当前报告，
  等于「取消无效」。编辑/换书走 `setDraft` 不受影响，因为它们本来就递增身份。
- **复现**：`unabortableTransport` 挂起 → `store.abort()` → 放行成功 → 旧实现 `report !== null`。
- **修复**：`abort()` 复用 `invalidateInFlight()`，与编辑失效同一语义：身份递增、信号中止、
  `busy` 立即结束、失败路径不产生错误。
- **验证**：新增用例「abort() 之后即使底层忽略信号，迟到成功也不得成为当前报告」通过；
  `timeout.test.ts`（取消与超时区分）、`concurrency.test.ts`、`store.test.ts` 全部仍通过。

其余五个验收事实在既有实现中已成立，本轮用测试**复核而非复述**，未发现新问题。

## 输入版本与依赖

- 判据版本来自真实 API：`data = pingshui-…-review3`、`rules = teaching-v1`、
  `context = context-rules:11`、`works = works:3`（基线自带，本轮未改数据）。
- 本轮不含新增依赖；`package.json` / `pnpm-lock.yaml` 未改。
- 合成 fixture 仅用于业务单测，主路径仍走真实 API。

## 命令与实测结果

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile --config.node-linker=hoisted` | 0 | 8 个 workspace 工程 |
| `pnpm verify`（基线 `898b1a0`，dirty=false） | 0 | lint / 双 tsconfig / 测试 / 构建 / 8 个生成物全部通过；**53 文件 / 733 项** |
| `pnpm exec vitest run apps/web/tests`（改动后） | 0 | 业务测试全绿 |
| `pnpm verify`（改动后，dirty=false） | 0 | 同上；**54 文件 / 745 项**（+12） |

计数口径：745 = 基线 733 + 本批 12，不重复计算既有用例。

## 给 E 的三个确定场景（可直接做成浏览器用例）

### 场景 1：慢 A 后快 B

- **输入**：进入正式 `/`，正文填《登鹳雀楼》已批正文，平水韵。
- **触发**：点「分析」（请求 A）→ 在 A 返回前修改正文一次并再次点「分析」（请求 B）；
  用受控拦截把 A 延迟 3s、B 立即放行。
- **应观察的请求**：两次 `POST /api/v1/analyze`；A 的 `inputHash` 对应旧正文，
  B 的对应新正文；A 的响应即使后到也必须被丢弃。
- **最终状态**：`busy=false`；页面结论、复制摘要、下载 JSON 全部对应 **B**；
  A 迟到成功不改变结论，A 迟到失败不产生错误条；`stale=false`。

### 场景 2：真实 30 秒客户端超时

- **输入**：正式 `/`，任意已批正文，平水韵。
- **触发**：点「分析」，同时用拦截让该请求**永不返回**；等待约 30s。
- **应观察的请求**：1 次 `POST`，无第二次自动重试。
- **最终状态**：约 30s 后 `busy=false`，错误条含「分析超时」与「未展示任何旧报告结论」；
  正文保留；若此前已有成功报告，它仍可查看但复制/导出被阻止；重试成功后可恢复导出。

### 场景 3：候选选音后换书清覆盖

- **输入**：填《登鹳雀楼》（含「更」字，平水韵有两个候选），分析成功。
- **触发**：点「更」字 → 抽屉内点「改用此读音」→ 等重查成功 → 切到「词林正韵」。
- **应观察的请求**：选音那次 `POST` 的 `readingOverrides` 含
  `{tokenId, readingId}` 且 `inputHash` 等于当时正文的 SHA-256；换书后**不产生**新请求。
- **最终状态**：换书后旧报告 `stale`、`overrides` 清空、候选选中标记消失；
  再点「分析」发出的 `POST` 中 `readingOverrides` 为 `[]`、`rhymeBook=cilin`。

## 未运行项（不声称通过）

- 浏览器端并发/键盘/移动端验收：由 E 用 `pnpm test:e2e` 单写，本批不代跑。
- 真实触屏手势：无真机，未运行；移动视口仿真不等于真机。
- 真实三库全量审核后的 `/readyz=200` 路径：数据未完成全量审核，仍 503。
- 本批未新增截图；无视觉改动。

## 发现但不属于本批范围（交 Codex）

1. 根 `README.md` 与根 `scripts/dev.mjs` 若有端口/命令表述与本批 `apps/web/README.md`
   不一致，以实际输出为准，请集成方核对（本批未改根文件）。
2. `/readyz` 503 与「可分析」的区分目前只在文档层面成立；若要在 UI 显示就绪状态，
   需要契约新增字段，属公共契约变更，本批不做。
