# packages/genre

负责人：队员 E / DeepSeek。状态：**D1 最小分支已实现**，可被单测调用；尚未接入 API。

实现 `classifyGenre` 与适用性判定，不因出律改判古体。当前底座只有 `toneFit`，缺关键特征的候选一律判 `uncertain`。

## 调用入口

```ts
import { classifyGenre } from "@poetry/genre";
import type { ClassifyGenreInput } from "@poetry/genre";

const decision = classifyGenre({
  poem, // AnnotatedPoem（冻结契约）
  candidates, // TemplateCandidate[]（来自核心；本模块不重算 score）
  metadata, // WorkMetadata[]（D1 不参与判定）
  genreHint, // "auto" | "regulated" | "ancient"
  formHint, // "auto" | "wujue" | "qijue" | "wulv" | "qilv"
});
// → GenreDecision（字段与 GenreDecisionSchema 一致，strictObject）
```

纯函数：不查网络、不读文件、不调用模型、不改输入、不重算格律 score。

## 分支表（D1 实际行为）

| 输入                                             | 输出                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `genreHint=ancient` + `formHint=auto`            | ancient / not_applicable / basisType=user                                                    |
| 显式 `formHint=wujue\|qijue\|wulv\|qilv`         | regulated + 该 formId / basisType=user；形制不符 → applicability=uncertain 并在 reasons 说明 |
| `genreHint=regulated` + 形制可推                 | regulated + 推得的 formId / basisType=user；形制不可推 → undetermined/uncertain              |
| auto + 形制属四类 + 候选缺 relationFit/rhymeFit  | undetermined/uncertain，selectedTemplateId=null，保留候选                                    |
| auto + 关键可判率 <0.8 或 `quality=needs_review` | undetermined/uncertain                                                                       |
| auto + 并列（分差 <0.05）或低吻合（<0.75）       | undetermined/uncertain，保留全部候选 ID                                                      |
| auto + 高吻合（≥0.90）                           | **抛 `GENRE_BRANCH_PENDING`**（D2 实现）                                                     |
| auto + 形制超四类（含排律/长律）                 | unsupported / applicability=unsupported                                                      |
| 任何输入                                         | 不使用未审核元数据；不改 poem / candidates / metadata                                        |

## 错误码

`GENRE_ERROR_CODES = ["GENRE_BRANCH_PENDING", "GENRE_REQUEST_INVALID"]`，通过 `GenreError` 抛出，
`isGenreError()` 可用于守卫。未实现分支的 `branch` 字段当前为 `auto-high-confidence`。

## 命令（当前仓库实际可用）

```sh
pnpm exec vitest run packages/genre/tests   # 24 项
pnpm typecheck
pnpm exec eslint packages/genre
```

## 需要 GLM 补的包配置（本模块当前无法按包名被其它包导入）

1. `packages/genre/package.json`：补 `exports`（`types` / `development` / `import`）、`build`、`test` 脚本。
2. 补 `dependencies: { "@poetry/contracts": "workspace:*" }`（当前仅靠根 `package.json` 的链接与 `tsconfig` paths）。
3. 补 `tsconfig.build.json`（对齐其它包）。
4. 若要给本地格式加 Zod Schema，需显式加 `zod` 依赖；当前校验器为手写，不依赖传递依赖。

## D2 接线条件

- 核心给齐 relationFit / rhymeFit（及 parallelismFit）后才可按阈值给出近体候选结论。
- `approved` 元数据 + 精确正文指纹匹配（去标点/空白、保留字形字序）实现后，才能走 `basisType=reviewed_metadata`。
- API 侧需把 `GENRE_BRANCH_PENDING` 映射为明确的“功能未就绪”错误，**不得捕获为成功或静默降级为 uncertain**。
