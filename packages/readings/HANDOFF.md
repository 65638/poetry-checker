# @poetry/readings HANDOFF（D1 批次）

日期：2026-10-17。执行者：队员 B / DeepSeek harness。分支：`feat/b-d1-readings`（基线 `e549194`，`contract-v1` = `9b27322`）；PR #3。
状态：**D1 范围内的两个函数已实现并有实际测试通过**；真实字表、生产语境规则、覆盖率评测未做（见第 5 节）。

## 1. 变更文件

| 路径                                      | 内容                                                              |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `packages/readings/src/parse.ts`          | `parseText`：分句、码点遍历、UTF-16 区间、SHA-256、notice、白名单 |
| `packages/readings/src/resolve.ts`        | `resolveReadings`：候选传播、覆盖校验、语境规则、平仄推导         |
| `packages/readings/src/errors.ts`         | `ReadingsError` 与 13 个稳定错误码                                |
| `packages/readings/src/index.ts`          | 公共导出                                                          |
| `packages/readings/tests/fixtures.ts`     | 合成 `LookupResult`/证据/规则（全部标 synthetic）                 |
| `packages/readings/tests/parse.test.ts`   | 解析与位置用例（10 个）                                           |
| `packages/readings/tests/resolve.test.ts` | 候选传播与覆盖用例（21 个）                                       |
| `packages/readings/README.md`             | 调用方式与边界                                                    |
| `packages/readings/HANDOFF.md`            | 本文件                                                            |
| `data/context/README.md`                  | 规则格式、匹配口径、待审队列用法                                  |
| `data/context/review-queue.json`          | 更/重/长/行 4 条待审核语境（无候选 ID、无来源）                   |
| `docs/readings.md`                        | 解析政策、选音优先级、错误码提案、实现边界                        |
| `HANDOFF.md`（根）                        | 追加 B/D1 小节                                                    |

**未改动**：`packages/readings/package.json`、根配置、lockfile、`packages/contracts/**`、其它包的源码与配置
（这些属于组长/GLM 或其它成员的写入路径）。

## 2. 完成用例（对照 `13_发给B` 的 B-D1 表）

| ID      | 覆盖测试                                                                                                                        | 结果                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| B-D1-01 | `parse.test.ts`「登鹳雀楼标点版与四行版…」                                                                                      | 通过：同样四句五字，逐字位置各自切回原文，两个 hash 不同                                                              |
| B-D1-02 | 「CRLF、空行、连续边界都不生成空诗句」                                                                                          | 通过：CRLF 归一，`，，，\n\n` 不生成空句，偏移 10/11/12… 正确                                                         |
| B-D1-03 | 「补充平面汉字不拆代理对」                                                                                                      | 通过：`𠀀白，日` → `[0,2) [2,3) [4,5)`，tokenId `l1c1/l1c2/l2c1`                                                      |
| B-D1-04 | 「非汉字内容保留原文…后续偏移仍准确」                                                                                           | 通过：`白A日，黄🙂河` 两条 notice，偏移 0/2/4/7，`quality=needs_review`                                               |
| B-D1-05 | 「标题原样保留并提示，不按字数硬断长串」                                                                                        | 通过：标题行保留 + `PARSE_SUSPECTED_TITLE`；13 字无边界长串只提示不切分                                               |
| B-D1-06 | 六条状态用例（无候选/唯一/P+Z/Z+Z/P+未知/缺字）                                                                                 | 通过：与文档状态表逐字段一致                                                                                          |
| B-D1-07 | 「合法覆盖只改有效候选与 selectionMethod」                                                                                      | 通过：候选全保留，`method=user`，证据不被用户选择改写                                                                 |
| B-D1-08 | 「外字、不存在、越界与重复覆盖」、「别书候选…」                                                                                 | 通过：`OVERRIDE_READING_UNKNOWN`/`OVERRIDE_TOKEN_UNKNOWN`/`OVERRIDE_DUPLICATE_TOKEN`/`LOOKUP_CANDIDATE_BOOK_MISMATCH` |
| B-D1-09 | 「unverified 规则不参与自动确定」、「approved 规则按最长…」、「同优先级冲突…」、「用户覆盖优先…」、「规则失效…」、「规则结构…」 | 通过：未审核不生效且留 notice；最长优先；冲突保留歧义；用户优先；`CONTEXT_RULE_STALE`/`CONTEXT_RULE_INVALID`          |
| B-D1-10 | 「不修改输入、重复调用结果一致、输出通过公共 Schema」、「句子末位不能成为额外选音证据」                                         | 通过：深冻结入参可运行、两次结果 JSON 相同、`AnnotatedPoemSchema` 通过                                                |

补充覆盖：`lookup` 未覆盖但未声明 missing 的字仍为 `unknown`；`poem` 自身区间不一致抛 `POEM_TOKEN_SLICE_MISMATCH`；
候选引用不存在证据抛 `LOOKUP_EVIDENCE_UNKNOWN`；非白名单符号（数字）逐字 notice 而不被吞掉；
`々`(U+3005)/`〻`/康熙部首不建字位（否则后续列整体错位），而 `〇`(U+3007) 仍是表意汉字、照常建字位。

## 3. 实际命令与结果

环境：Windows + 本机 Node **24.21.0**（仓库 `.node-version` 为 24.19.0，差一个补丁版本）、pnpm **11.25.0**（与 `packageManager` 一致）。

```text
$ pnpm verify
$ eslint .                        → 通过
$ tsc --noEmit && tsc --noEmit -p apps/web/tsconfig.json → 通过
$ vitest run                      → 6 个文件 / 67 个用例全通过（其中 readings 2 文件 / 31 用例）
$ pnpm build && tsx scripts/generate-contracts.ts --check → 通过（8 个契约/模板文件一致）
退出码 0
```

单独跑本模块：

```text
$ node node_modules/vitest/vitest.mjs run packages/readings/tests
 ✓ packages/readings/tests/parse.test.ts (10 tests)
 ✓ packages/readings/tests/resolve.test.ts (21 tests)
 Test Files 2 passed / Tests 31 passed
```

**未运行**：`pnpm --filter @poetry/readings test`（该脚本不存在，见第 6 节申请）；没有 `todo` 跳过的用例。

### 与干净环境的差异（复现必读）

1. **依赖安装**：pnpm 默认 isolated linker 在本机报 `ERR_PNPM_SYMLINK_FAILED … Maximum call stack size exceeded`，
   改用 `node-linker=hoisted` 完成安装；`CI=true` 让无 TTY 环境可以自动重装。
2. **生命周期脚本**：受限沙箱下 `spawn EPERM`，安装时用过 `--ignore-scripts`；`pnpm verify` 那次是在完整权限下跑通的（esbuild postinstall 正常执行）。
3. **Vite**：Windows 上 Vite 会 `exec("net use")` 探测网络驱动器，受限沙箱下报 `spawn EPERM`，因此测试与 `verify` 在完整权限下运行。
   **这不是代码问题**，是宿主沙箱与 Vite 的交互。
4. 用 `node node_modules/vitest/vitest.mjs` / `node_modules/typescript/bin/tsc` 直调可绕过 `pnpm exec` 的依赖状态检查。

## 4. 数据与规则版本

| 项目                         | 值                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 契约标签                     | `contract-v1` = `9b27322`（未改动契约）                                                                    |
| `lookup.dataVersion`（测试） | `synthetic-d1`（合成，非发布数据）                                                                         |
| 语境规则                     | **0 条生效**。`data/context/rules.approved.json` 未创建                                                    |
| 待审队列                     | `data/context/review-queue.json` 4 条（更/重/长/行），`reviewStatus=unverified`，`selectCandidateIds` 为空 |

合成 fixture 与真实语文学验证严格分开：

- 合成验证（已完成）：位置映射、状态传播、覆盖校验、规则最长匹配/冲突、Schema 一致性、不变性。
- 真实语文学验证（**未开始**）：没有任何真实韵书条目、反切、页码或人工审核参与 D1 的任何结论。

## 5. 未解决问题

1. **包不可被其它包导入**：`packages/readings/package.json` 没有 `exports`/`build`/`test`，属 GLM 写入路径，D1 未改。
   在补齐前 C/API 只能按相对路径引用，无法 `import ... from "@poetry/readings"`。
2. **缺少真实字表**：所有候选来自合成 fixture；真实覆盖情况未知。
3. **语境规则无一条生效**：缺 A 的稳定候选 ID、缺可定位来源、缺人工审核。队列里 4 条只能算问题清单。
4. **`unverified` 证据与“唯一候选”的契约张力**：单候选且证据未审核时，Schema 没有“待核实”状态位，
   目前用 `reason` 明确标注 + `evidenceIds` 为空表达，并已在 `docs/readings.md` 第 6 节提出可选契约变更。
5. **未做跨句/分词匹配**：只有同句内精确短语。
6. **未做覆盖率/准确率**：没有留出验证，不报百分比。
7. **Node 补丁版本差异**：本机 24.21.0 而仓库锁 24.19.0，未观察到差异，正式验收建议在 24.19.0 复核。

## 6. 给 GLM 的配置与错误码申请

**配置申请**（我不改这些文件）：

```jsonc
// packages/readings/package.json —— 与 @poetry/contracts / @poetry/prosody 同构
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "development": "./src/index.ts",
      "import": "./dist/index.js",
    },
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run --root ../.. packages/readings/tests",
  },
  "dependencies": { "@poetry/contracts": "workspace:*" },
}
```

外加 `packages/readings/tsconfig.build.json`（`rootDir: src`、`outDir: dist`、include `src/**/*.ts`）。
在补齐前请勿在根 `build` 里对 readings 做 `--if-present` 之外的假设。

**错误码映射申请**（详见 `docs/readings.md` 第 5 节）：

- `OVERRIDE_*` → 422；`CONTEXT_RULE_INVALID`/`CONTEXT_RULE_STALE`/`LOOKUP_*` → 503；
  `POEM_TOKEN_*` → 500（服务端自身 bug）。
- `CONTEXT_RULES_PENDING` 是保留码：若将来关闭规则执行，遇到 approved 规则必须显式抛此码，
  **不能**被 API 转成 200。

## 7. 集成方法（给业务编排）

```ts
const poem = parseText({ text: request.text });
if (request.inputHash !== undefined && request.inputHash !== poem.inputHash) {
  // 由 API 返回 STALE_READING_OVERRIDE（本模块签名里没有请求 hash，做不了这件事）
}
const lookup = await lookupCharacters({ characters, rhymeBook, dataVersion });
const annotated = resolveReadings({
  poem,
  lookup,
  overrides: request.readingOverrides,
  contextRules,
});
```

- `inputHash` 与当前原文一致性由 API 校验；`resolveReadings` 只校验 `tokenId`/`readingId` 是否合法。
- 无汉字输入由 `AnalyzeRequestSchema` 拒绝；`parseText` 对空文本只返回空 `lines`/`tokens` + notice。
- 数据类异常请映射为“数据未就绪”，不要静默降级成成功响应。

## 8. 给 A / C / E

- **A**：需要稳定 `dataVersion`、不可变候选 ID、候选必须带正确 `book`、`evidenceIds` 能在 `lookup.evidence` 中解析、
  未收录字显式进 `missing`。`unverified` 证据可以给，我按状态过滤，不会进入结论。
- **C / E**：三种读音状态 + 三种平仄状态；「读音歧义但平仄确定」是正常输出；存在未知候选时 `toneStatus=unknown`，
  不能用已知候选顶替；字位区间永远可切回原文；`lines[].text` 是汉字序列（不含标点）。

## 9. 与其它 D1 分支的交界（2026-10-17 核对 `origin`）

只读核对，未修改对方分支。

- **`lines[].text` 口径已与 C 对齐**：`origin/feat/c-d1-acceptance` 的
  `packages/prosody/tests/acceptance/fixtures.ts` 里，行文本正是 `specs.map((spec) => spec.text).join("")`，
  即“汉字序列、不含标点”，与本模块一致；C 的 `makeAnnotatedPoem` 也按行间换行占 1 个 UTF-16 单元累计偏移。
- **文件重叠只有根 `HANDOFF.md`**：C 分支改动 22 个文件、D 分支改动 24 个文件，与本分支（13 个文件）唯一的交集是
  根 `HANDOFF.md`，双方都是追加段落 —— 先合的一方无冲突，后合的一方需保留两段。
- **请 GLM 注意**：核对时 `git diff origin/main origin/feat/c-d1-acceptance -- HANDOFF.md` 显示 C 分支**删除了**
  main 末尾的“GLM 交付：Web 基础环境（2026-10-17）”整段。若非有意，合并前请确认，避免该记录丢失。
  本分支未改动那段内容。
