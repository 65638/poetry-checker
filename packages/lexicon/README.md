# @poetry/lexicon

负责人：队员 A / DeepSeek。模块 M1：韵书查询、校验、来源与证据。
当前状态（D1）：**查询入口与检查器已实现并通过本机冒烟；三套韵书均未达到发布门槛**。

## 查询入口

签名与冻结契约一致（类型来自 `@poetry/contracts`，结果用 `LookupResultSchema` 校验）：

```ts
lookupCharacters(input: {
  characters: string[];
  rhymeBook: BookId;
  dataVersion: string;
}): Promise<LookupResult>
```

快照通过**显式注册**注入，公共函数不增加第四个参数：

```ts
import {
  createLexicon,
  deserializeSnapshot,
  lookupCharacters,
  registerSnapshot,
} from "@poetry/lexicon";
import { readFileSync } from "node:fs";

// 1) 进程级默认注册表，适合 API 启动时装载真实数据包
registerSnapshot(
  deserializeSnapshot(
    JSON.parse(readFileSync("data/normalized/pingshui.sample-d1.json", "utf8")),
  ),
);
const result = await lookupCharacters({
  characters: ["更", "白", "一", "流", "楼"],
  rhymeBook: "pingshui",
  dataVersion: "sample-pingshui-cwr-ff0e9c1-d1",
});

// 2) 独立实例（测试、多版本并行）
const lexicon = createLexicon([snapshotInput]);
await lexicon.lookupCharacters({
  characters: ["白"],
  rhymeBook: "pingshui",
  dataVersion: "…",
});
```

**当前可直接使用的 `dataVersion`**

| dataVersion                                        | 韵书              | 身份                                                             |
| -------------------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| `sample-pingshui-cwr-ff0e9c1-d1`                   | pingshui          | 真实七字小样本，`reviewStatus: unverified`，**不是全量发布数据** |
| `fixture-lexicon-d1` / `fixture-lexicon-xinyun-d1` | pingshui / xinyun | 测试专用合成快照，合成 ID，**不得作为判音依据**                  |

没有注册就直接查会得到 `LEXICON_VERSION_NOT_FOUND`，**不会**悄悄回退到其他版本，也不会返回空成功。

## 行为约定

- **去重且稳定**：重复输入只查一次；`entries` 按字符码位升序，`candidates` 按候选 ID 升序，`groups/evidence/sources` 按 ID 升序。
- **输入不变**：不改写调用方传入的数组或对象。
- **多候选保留**：同字多声多部全部返回（如“更”＝下平八庚 P ＋ 去声二十四敬 Z），不压成“字→单一平仄”。
- **缺字**：未收录字进 `missing`，不创建默认候选、不补默认声调或拼音。
- **缺失事实为 null**：无反切 → `fanqie: null`；无义项 → `gloss: null`；无今读证据 → `modernReading: null`。
- **引用可解析**：返回的每个 `evidenceIds` / `groupIds` / `sourceId` 都能在同一个 `LookupResult` 里查到。
- **审核状态不代表可用**：`unverified` 可以出现在结果里，但不得支撑发布结论。

错误码（`LexiconError.code`，由 API 映射 HTTP）：

| code                           | 场景                            |
| ------------------------------ | ------------------------------- |
| `LEXICON_INVALID_INPUT`        | 非法入参（非字符串、非单码点）  |
| `LEXICON_VERSION_NOT_FOUND`    | 未注册的 `dataVersion`          |
| `LEXICON_BOOK_MISMATCH`        | 快照韵书与 `rhymeBook` 不一致   |
| `LEXICON_DUPLICATE_ID`         | 同 `dataVersion` 重复注册       |
| `LEXICON_REFERENCE_UNRESOLVED` | 悬空 evidence / group / source  |
| `LEXICON_INVALID_RESULT`       | 结果不符合 `LookupResultSchema` |

## 完整性检查器

```ts
import {
  PINGSHUI_GATE,
  CILIN_GATE,
  XINYUN_GATE,
  checkCompleteness,
} from "@poetry/lexicon";

const report = checkCompleteness(snapshot, PINGSHUI_GATE);
// report.missingGroups / unexpectedGroups / emptyGroups / issues / releaseGatePassed
```

门槛按**逐字韵目集合**判定，不是只数 `groupCount`：

| 门槛            | 内容                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| `PINGSHUI_GATE` | 上平 15 ＋ 下平 15 ＋ 上 29 ＋ 去 30 ＋ 入 17 ＝ **106**，逐个韵目名比对 |
| `CILIN_GATE`    | 19 部 → 33 子卷（1–14 平/仄，15–19 入声）                                |
| `XINYUN_GATE`   | 14 韵 × 四声 ＝ 56 子卷                                                  |

检查器**不抛异常**：缺部会被“报告”，同时 `releaseGatePassed=false`。
“数据门槛失败”与“检查器测试通过”必须分开汇报。

## 中华新韵重建（十四韵，项目重建表）

- 规则：`src/xinyun/rules.ts`（`XINYUN_RULES_VERSION = "xinyun-14-rules-d1"`）；规则出处**待核实**
  （`XINYUN_RULE_PROVENANCE.status === "unverified"`），且与中华通韵（十六韵）不可互换。
- 正规化：`src/xinyun/pinyin.ts`，显式处理调号/调值、ü / v / u:、j/q/x 后 ü、y/w 零声母、
  iu / ui / un 省写、舌尖元音与普通 i；**不取拼音尾部字符串猜韵部**。
- 生成器：`scripts/data/rebuild-xinyun.ts`，输出覆盖 / 未映射 / 冲突报告；`--full` 另存全表。
- 任何对外文案都必须写“项目重建表，非官方原始字表”。

## 本机命令

```powershell
node --conditions=development scripts/data/inspect.ts        # 统计与缺口（只读）
node --conditions=development scripts/data/build-sample.ts    # 七字真实小样本
node --conditions=development scripts/data/rebuild-xinyun.ts  # 新韵重建报告
node scripts/data/fetch-sources.ts --check                   # 来源摘要复核
```

测试文件在 `packages/lexicon/tests/`，覆盖 A-D1-01～A-D1-10：

```powershell
pnpm exec vitest run packages/lexicon/tests
```

实测（2026-10-17，vitest 5.0.5）：**5 个测试文件、66 项全部通过**（通过 66 / 失败 0 / 未运行 0）。

> `pnpm --filter @poetry/lexicon test` 目前**还不存在**；包清单与脚本需 GLM 补，见仓库根 `HANDOFF.md`。

## 依赖与限制

- 运行期只用 Node 内置模块 ＋ `@poetry/contracts`（复用 `LookupResultSchema`，不另建公共类型）。
- **已知缺口**：`packages/lexicon/package.json` 还没有 `dependencies`（`@poetry/contracts`）、`exports`、
  `build`/`test` 脚本与 `tsconfig.build.json`。因此 `import "@poetry/contracts"` 现在只能在**仓库根目录**运行时解析
  （靠根 `node_modules` 的 workspace 链接），包单独安装会解析失败。需 GLM 接线。
- 不用 SQLite：这个数据量用只读 JSON ＋ 内存索引就够，避免驱动安装阻塞查询验证。
