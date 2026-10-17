# @poetry/lexicon 交接（D1）

本文件给 B（文本与读音）与 GLM（配置接线）看。根 `HANDOFF.md` 保留全项目总览，本包的接口细节写在这里，减少多方同改根文件的冲突。

## 1. 公共入口（已冻结，不加第四个参数）

```ts
import { lookupCharacters } from "@poetry/lexicon";

const result = await lookupCharacters({
  characters: ["更", "白", "一", "流", "楼"],
  rhymeBook: "pingshui",
  dataVersion: "sample-pingshui-cwr-ff0e9c1-d1",
});
```

- `characters`：单码点汉字数组。重复输入自动去重，输出按**码位升序**稳定排列；输入数组不被修改。
- `rhymeBook`：`"pingshui" | "cilin" | "xinyun"`。
- `dataVersion`：必须**显式注册**过；未注册直接抛错，**不回退、不返回空成功**。
- 返回值恒为 `LookupResult`，返回前用 `LookupResultSchema`（`@poetry/contracts`）校验。

## 2. 快照注册方式

快照由工厂定义后注册，模块内部不读磁盘、不联网：

```ts
import { registerSnapshot, registerSnapshots, dataVersions, deserializeSnapshot } from "@poetry/lexicon";

// 方式 A：从 data/normalized、data/releases 的 JSON 装载
registerSnapshot(deserializeSnapshot(require("./pingshui.sample-d1.json")));

// 方式 B：直接给结构化输入（测试用）
registerSnapshot({ dataVersion, book, reviewStatus, notice, candidates, groups, evidence, sources });

// 一次注册多个
registerSnapshots([...]);

// 查看已注册版本
dataVersions();
```

- 同一 `dataVersion` 重复注册 → `LEXICON_DUPLICATE_ID`，**不静默覆盖**。
- 快照内 `candidates → groups → evidence → sources` 引用必须闭合，否则注册时被拒（`LEXICON_REFERENCE_UNRESOLVED`）。
- `deserializeSnapshot` 只做结构守卫（字段类型、book 枚举、reviewStatus 枚举），**不做内容审核**；审核身份由 `reviewStatus` 字段携带。

## 3. 错误码与触发条件

| code | 触发条件 |
|---|---|
| `LEXICON_VERSION_NOT_FOUND` | `dataVersion` 未注册 |
| `LEXICON_BOOK_MISMATCH` | 请求的 `rhymeBook` 与快照 `book` 不一致 |
| `LEXICON_DUPLICATE_ID` | 同一 `dataVersion` 重复注册 |
| `LEXICON_INVALID_INPUT` | 非单码点、空输入、快照缺字段、未知韵书/审核状态 |
| `LEXICON_REFERENCE_UNRESOLVED` | 候选/韵部/证据/来源引用悬空 |
| `LEXICON_INVALID_RESULT` | 结果未通过 `LookupResultSchema`（内部一致性故障） |

判定错误用 `isLexiconError(e)` 收窄，`LexiconError` 与 `isLexiconError` 均从包入口导出。

## 4. 当前可用 dataVersion

| dataVersion | 身份 | 能否用于正式解析 |
|---|---|---|
| `sample-pingshui-cwr-ff0e9c1-d1` | 七字真实小样本（白/一/更/流/楼/雪/物），`reviewStatus: unverified` | ❌ 不能 |
| `fixture-lexicon-d1` | 平水合成 fixture | ❌ 仅测试 |
| `fixture-lexicon-xinyun-d1` | 新韵合成 fixture | ❌ 仅测试 |

**没有任何 `approved` 版本。** 三库发布级数据未达门槛，不得进 `data/releases`。

## 5. 事实边界（B 必读）

1. 七字样本取自 `chinese_word_rhyme` 固定提交 `ff0e9c13…` 的**真实原表**，但 `reviewStatus: unverified`，**evidence 未审核，不能支撑正式解析结论**。
2. 合成 fixture 的来源 ID 前缀为 `src-synthetic-*`、`reviewStatus: fixture`，**不得进入任何真实分析路径**。真实来源 ID 前缀为 `src:`。
3. 所有候选的 `fanqie` / `gloss` / `modernReading` 为 `null`：**缺证不等于无此读法**，不要据此判定"该字无某读音"。
4. `candidates` 保留全部多读多部。同一字可能平仄并存（例：「更」= `pingshui:更:ping:八庚` + `pingshui:更:qu:二十四敬`），**必须按语境消歧，lexicon 不替你选**。
5. 不按诗句是否合律选读音；出律不得反推改判平仄。
6. `missing` 只列未收录字，**不会补默认平仄或拼音**。
7. 不要为了"跑通接口"绕过 `releaseGatePassed`：数据未达门槛时 API 应保持 503。

## 6. ID 规则（可直接用于稳定引用）

| 对象 | 格式 | 示例 |
|---|---|---|
| 候选 | `<book>:<字>:<声类>:<韵目>` | `pingshui:更:ping:八庚` |
| 韵部 | `group:<book>:<卷/部首>:<韵目>` | `group:pingshui:下平:八庚` |
| 证据 | `ev:<book>:<卷/部首>:<韵目>` | `ev:pingshui:下平:八庚` |
| 来源 | `src:<name>` / `src-synthetic-<name>` | `src:chinese_word_rhyme` |

候选 ID 由 `makeCandidateId` 生成，与上述格式一致。

## 7. 完整性检查器

```ts
import { checkCompleteness, PINGSHUI_GATE, CILIN_GATE, XINYUN_GATE } from "@poetry/lexicon";
```

| 韵书 | 门槛 |
|---|---|
| 平水 | 上平 15 / 下平 15 / 上 29 / 去 30 / 入 17 = **106** 部 |
| 词林 | 19 部 / 33 子卷 |
| 新韵 | 14 韵 / 56 子卷 |

检查项不止数量：韵目名逐字比对、声类比对、逐部非空、重复韵目、`reviewStatus === "approved"`。

**重要口径**：`checkCompleteness` **不抛异常**，它报告问题。`releaseGatePassed: false` 是**数据事实**，与"检查器测试通过"是两件事，报告里不能混。当前平水固定快照为 **105/106（缺上声三讲）**，所以发布门槛本就应失败。

## 8. 给 GLM 的接线清单

当前 `packages/lexicon/package.json` 只有 `name` / `version` / `private` / `type` 四个字段。需要补：

```jsonc
{
  "dependencies": { "@poetry/contracts": "workspace:*" },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "development": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run --root ../.. packages/lexicon/tests"
  }
}
```

另需新增 `packages/lexicon/tsconfig.build.json`（可参照 `packages/contracts`、`packages/prosody` 的同名文件）。

**现状与后果**：

- 值导入 `import { LookupResultSchema } from "@poetry/contracts"` 出现在 `src/lookup.ts`、`tests/fixture.test.ts`、`tests/real-sample.test.ts`；其余为 `import type`。
- 目前能解析，靠的是**仓库根** `node_modules/@poetry/contracts` 的 workspace 链接，所以**必须从仓库根目录运行**。
- 一旦单包发布/单包安装，或在非根目录运行，解析会失败。
- `pnpm --filter @poetry/lexicon test` 目前**还不存在**。
- 包清单、根配置、lockfile 由 GLM 写，A 不并行修改。

## 9. 运行命令

```powershell
# 测试（从仓库根目录）
pnpm exec vitest run packages/lexicon/tests

# 快照摘要复核
node scripts/data/fetch-sources.ts --check

# 数据脚本（需 tsx 或 Node 24 原生类型剥离，从仓库根目录执行）
node scripts/data/inspect.ts
node scripts/data/build-sample.ts
node scripts/data/rebuild-xinyun.ts
```

## 10. 已验证 / 未验证

**已验证**（2026-10-17，本机终端与本批执行环境分别实跑）：

- 包内测试 5 文件 / 66 项全通过，覆盖 A-D1-01～A-D1-10。
- `eslint .`、`tsc --noEmit`、`tsc --noEmit -p apps/web` 均 0 问题。
- `fetch-sources.ts --check` → 8/8 与 manifest 摘要一致。

**未验证**：

- 词林、新韵门槛从未在真实数据上跑过（仅合成数据验证常量形状）。
- 七字仅与搜韵网人工核对，未与《平水韻》权威文本逐字对照。
- 三讲补丁 `draft`/`unverified`，未生效；平水仍 105/106。
- 所有 evidence 未审核，`reviewStatus` 不为 `approved`。
