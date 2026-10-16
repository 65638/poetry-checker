# Codex 任务书：公共契约、格律核心与疑难修复

执行者：Codex，作为组长直接使用的 AI 实现协作者；不计为第七名学生。组长保留接口冻结、事实审核、合入和发布决定。周期对应团队 D1–D5，按可验收的小批次交付。

## 可直接发送给 AI 的启动指令

> 请在共享诗格律检查器仓库直接实现你负责的代码。先读 README、HANDOFF、docs/ownership.md、公共契约及本任务书，检查 Git 状态和已有实现。你负责 packages/contracts 的 Schema 源与生成物、packages/prosody/src/core、核心测试、rules/templates 与 rules/exceptions；队员 C 负责公共入口、报告包装、规则卡与独立验收；本地 GLM 负责 API、根配置、依赖、CI 和集成。复用已有代码，不另起平行实现。先定位当前缺口，完成一个可运行、可复验的批次，再交接。读音不确定时传播不确定性，不为了合律选音，不编造韵书条目、反切或文献页码。跨成员目录修复须先记录具体路径交接。运行真实检查，说明通过、失败和未执行项，不把基础模板匹配宣称为完整格律判定。

## 1. 项目上下文与目标

6 人使用 AI 编码，在 5 天内开发商业级工程质量的课程 Web 应用。采用 TypeScript、pnpm 单仓库、Fastify、React/Vite、Zod、Vitest；韵书数据用版本化 JSON/SQLite，运行时不依赖模型。P0 包含三韵书、逐字平仄、押韵与粘对、常见拗救、体裁适用性、多音证据、人工选音、报告与验证。

Codex 优先承担容易使多个模块同时返工的契约和核心算法。C 独立验证算法与规则依据，GLM 串联 API，成员模块仍由各自负责人掌握。新增 Codex 不扩大 P0；动画仍是全 P0 通过后的 P1。

分工 v1.3 补充：Claude 接入后负责视觉和展示组件，Codex 复核语义准确性并担任候补；Claude 当前尚未接入。不同时写另一套前端。候补启用后按《03_前端设计与协作约定.md》的既定基线和 CheckerViewProps 实现，避免影响核心算法排期。

## 2. 独占目录与交接

| 路径 | 写入责任 | 配合方 |
|---|---|---|
| packages/contracts/src、tests | Codex | 组长冻结；各成员提最小反例 |
| scripts/generate-contracts.ts、artifacts/openapi.json、fixtures/contracts | Codex | GLM 运行生成与检查；D 使用 fixture |
| packages/prosody/src/core、tests/core | Codex | C 用独立用例验收 |
| rules/templates、rules/exceptions | Codex | C 核对来源，组长裁决 |
| packages/prosody/src/index.ts、adapters、report、tests/acceptance、rules/cards | C | Codex 提供稳定 core 导出 |
| 根配置、包清单、lockfile、API、CI | GLM/组长 | 首批骨架由 Codex 创建后交接 |
| web/src/presentation、public/design、docs/design | Claude；Codex 仅在候补接管后写入 | D 接容器，E 回归；组长核定视觉 |

跨模块修复应记录路径、当前分支/提交、复现、接管人、暂停写入者和归还条件。保留已有实现；不要让两个智能体同时改同一文件。需依赖升级时给组长具体清单，由 GLM 安装和锁定。

前端候补不改 D 的请求/选音/导出或根配置；先交首版展示切片，D 独立推进业务。资源冲突时冻结已给定视觉规格，由 D 在明确交接后机械落地，Codex 做集中视觉修正；不新增设计探索或动画主线。

## 3. 第一批已有底座与首个两小时

启动仓库已交付 Schema、生成器、合成报告 fixture、基础模板、三值平仄与公共韵部判断。完整判定仍待实现；以仓库 HANDOFF 的实际状态为准。

1. 运行 `pnpm install --frozen-lockfile`、`pnpm verify`，检查当前 diff、契约版本和 C 的反例；不要覆盖未提交改动。
2. 阅读 `matchTemplatesCore` 与 `evaluateProsodyCore`，确认哪些是基础实现、哪些仍抛出未实现错误。
3. 和 C 使用相同规则 ID，优先用合成 P/Z 输入实现确定性平仄、对/粘、押韵报告；不先等真实字表。
4. 为未知、歧义、公共韵部空集及单个读音内部关联写有效测试。随后用 C 的独立反例校验。
5. 交付可执行批次与 HANDOFF，明确还不能用于发布的部分；不得返回“全部合律”的占位结果。

## 4. 接口约定

公共类型全部从 `@poetry/contracts` 导入，不在核心复制一套。对外 API 与末尾公共契约一致。

```ts
matchTemplatesCore(input: MatchInput): TemplateCandidate[]
evaluateProsodyCore(input: EvaluateInput): ProsodyReport
```

`MatchInput` 含 poem、formHint、ruleSet；`EvaluateInput` 另含 candidates、selectedTemplateId 和 applicability。核心纯函数：不得读数据库、网络、环境变量或系统时间，不得修改输入。API 在调用前装配已标注的候选、规则版本与体裁结果。

现有辅助接口 `checkTonePossibilities`、`checkCommonRhyme` 供核心内部使用，不另建 HTTP 路径。C 通过公共 `matchTemplates`、`evaluateProsody` 调用核心，不能在包装层重新判定或将 uncertain 改为 pass。

运行状态：未实现规则应可识别为 unsupported 或未就绪；开发底座目前使用明确的 `PROSODY_EVALUATION_PENDING` 异常。GLM 不得将此捕获后变成成功空报告。完整发布版本必须真正完成 P0 判断与状态映射。

## 5. 分批实现规则

### 批次一：契约与基础结构

Zod 是类型与 OpenAPI 的唯一源；五种报告状态 fixture 明确标注“合成”。实现 16 套整诗模板、稳定 ID、五/七言平起仄起、首句入韵/不入韵与偶句韵脚。基本允许集合不是完整免责表。

### 批次二：平仄、押韵、粘对

- 对每个规则枚举有效读音可能性：全部满足才 pass，全部不满足才 fail，混合或信息缺失为 uncertain。算法不能挑选最有利的读音。
- 押韵需要全部必押韵脚的公共归部；一条候选的平仄与归部绑定，不能从不同候选各取一半拼出通过。候选状态爆炸时有上限并返回待复核。
- 对：1–2、3–4 等联内；粘：2–3、4–5、6–7 等联间。先以第二字判别，结合模板关键节奏位和已识别变格。边界索引与原文位置保持一致。
- 平仄、关系、押韵特征按冻结权重形成最终 score；缺对仗特征重新归一化。可判关键位不足 80% 时 E 不能作高把握判别。
- 输出 expected、observed、字位、ruleId、证据 ID、关联诊断和稳定排序；不能只返回一个分数。

### 批次三：孤平、尾式与三类常见拗救

实现窄义 B 型孤平、三平尾、默认 warning 的三仄尾、常见孤平自救、特拗与对句相救。精确位置和口径先读 C 任务书及审核规则卡；未经核定的古例不作为自动免责依据。识别认可救法后用 resolvedBy/relatedFindingIds 关联原偏离，防止重复硬报错。

不支持的罕见救法留出复核说明；首句借邻韵没有已审核邻韵表时不能放行。不得用“一三五不论”无条件通配。

### 批次四：跨模块疑难与发布复核

优先修错误绿灯、错误选音、体裁免责、来源断链和 Unicode 定位；然后处理性能与显示。给出最小复现和原负责人可理解的交接。审查金标准的来源与独立性，AI 不能自己造真值再验证自己。

## 6. 必须通过的验收用例

| ID | 输入/动作 | 预期 |
|---|---|---|
| X01 | 四种体式 × 两种起式 × 首句押韵与否 | 16 套 ID 唯一、整诗序列正确；五七言起式不混淆 |
| X02 | 同一字位有效候选 P/P、P/Z、unknown | 分别得到确定平、条件不确定、信息不足，不偷选 |
| X03 | 韵脚集合 {A,B}、{B,C}、{A,C} | 两两相交仍整体 fail |
| X04 | 某字一候选为 P/甲部，另一候选为 Z/乙部 | 不能将 P 与乙部组合判通过 |
| X05 | 固定模板改第二字 | 定位平仄及对应粘对偏离；不得靠换模板或古体免责 |
| X06 | 窄义孤平及其已认可自救的正反例 | 救法关联原偏离；不将所有单平句都判孤平 |
| X07 | 三平尾与三仄尾 | 前者 error，后者默认 warning；不自动把 warning 汇总为 fail |
| X08 | 特拗/对句相救及差一个关键位置的反例 | 只放行已声明模式，未满足条件仍提示 |
| X09 | 相同输入重复运行、冻结输入对象 | 结果稳定、输入不变、无时间戳随机 ID |
| X10 | 已审核登鹳雀楼、平水韵 | 五绝合律；流/楼同尤部，白/一为古入声 |
| X11 | 已审核静夜思、黄鹤楼 | 前者古绝不强套；后者保留七律及特殊性，不改判古体 |
| X12 | 未知、模板并列、未支持形式 | 不输出错误绿灯；与 summary 规则兼容 |
| X13 | Schema/OpenAPI/fixture 更新 | 同批生成并通过 check:generated；无手工漂移 |

X10–X11 依赖 A/B/E 的真实数据和人工核定；未接入前标“待运行”，不能拿合成数据充数。X05–X08 的语文学预期由 C/组长核定，合成输入用于验证算法。

## 7. 每日交付与退出条件

| 日期 | Codex 交付 | 验收人 |
|---|---|---|
| D1 | 契约源、OpenAPI、fixture、基础模板、测试与交接记录 | 组长人工冻结；C 独立检查 |
| D2 | 整诗匹配、平仄/押韵/粘对、特征与解释结构 | C + GLM 接真实链路 |
| D3 | 孤平/尾式/常见拗救、不确定性贯通 | C 独立反例；E 系统回归 |
| D4 | 反例修复、疑难数据/读音技术复核、发布差异检查 | 组长与对应负责人 |
| D5 上午 | 最后阻断修复和实际验证记录 | 组长 |
| D5 下午 | 支持联调和彩排，不新增功能 | 全员 |

这是一份执行安排；不会让 Codex 在聊天结束后自动持续工作。后续批次需在同一仓库继续交办，并携带最新分支/提交、HANDOFF 与失败命令。

## 8. 每批 HANDOFF

```text
批次/当前分支与提交：
独占写入路径与归还路径：
已完成行为与仍未实现行为：
契约/数据/规则版本影响：
修改文件：
真实命令、通过数、失败项、未执行项：
C 的独立验收入口与最小反例：
待人工核实的事实/来源：
下一批可执行任务：
```

P0 主线未完成时，不启动词牌、语义改诗或动画扩展。不把“测试骨架已通过”写成“商业级产品已完成”。

---

> 以下为完整公共契约附录；本文件可单独发送，不依赖上一轮聊天。实际编码以组长记录的冻结版本为准。

> 附录基线 SHA-256：`6c640fc6c79d235b83287e527ca7066ede1f96928b430541f60d3fe0882b3987`。

## 公共接口与工程约定 v1.0

> 接口基线 v1.0；协作分工修订 v1.3。组长负责冻结接口；Codex 实现 Zod Schema、生成类型/OpenAPI 与 fixture，本地 GLM 接入构建与 API。Claude 拟负责前端视觉/展示组件，未接入时由 Codex 候补；D 负责前端业务工程。实现进度以启动仓库的状态记录为准，不将本方案全文视为已实现。成员不能自行修改公共字段；更新后的组长冻结版本与变更记录具有优先效力。

### 1. 技术栈与工程边界

- TypeScript 单仓库；pnpm workspace；React + Vite；Fastify；Vitest；Playwright；MSW。
- Node.js 采用组长在 D1 锁定的可用 LTS 版本，写入仓库版本文件；提交 lockfile。
- 韵书发布为版本化 JSONL/JSON 和 SQLite；SQLite 驱动安装阻塞超过 2 小时可使用同一数据的只读内存索引，查询契约不变。
- 运行时不得调用大模型产生最终字音或格律结论。模型用于编码、评审和离线辅助整理；未经人工审核的语言学事实不能发布。
- 不做账号、支付、社区、微服务、向量库。词牌、语义改诗和完整语义对仗属于 P1。
- 所有运行时源码按下表指定唯一写入方；组长拥有公共契约的决策权，并负责根依赖、CI 和 API 的集成。
- 核心计算使用纯函数；字表查询采用可替换适配器；前端不得另写格律判断。

#### 1.1 Codex 接管与写入分界

六名真人的责任保持可追踪；Codex 是组长可直接分配实现任务的 AI 协作者，不计作第七名课程成员。

| 目录/工作 | 默认代码写入方 | 人工负责人 |
|---|---|---|
| `packages/contracts/src/`、生成类型/OpenAPI、`fixtures/contracts/` | Codex | 组长冻结与验收 |
| contracts 包清单/编译配置、根依赖、lockfile、API、CI | 组长的本地 GLM；首批骨架由 Codex 交接 | 组长 |
| `packages/prosody/src/core/`、`tests/core/` | Codex | C 独立验收，组长裁决 |
| `rules/templates/`、`rules/exceptions/` | Codex | C 核对，组长核定口径 |
| `packages/prosody/src/index.ts`、`src/adapters/`、`src/report/` | C 的 DeepSeek；首批导出由 Codex交接 | C |
| `packages/prosody/tests/acceptance/`、`rules/cards/`、规则文档 | C 的 DeepSeek | C；关键事实仍需人工核查 |
| lexicon、readings、genre 与各自数据 | A、B、E 的 DeepSeek | 对应成员 |
| `apps/web/src/presentation/`、`public/design/`、`docs/design/` | Claude（接入后）；Codex 候补，同一时刻一名写入方 | D 验证交互；组长定视觉方向 |
| Web 的 view-contract、app/api/features/hooks、入口、mock、业务测试 | D 的 DeepSeek | D；E 做系统回归 |

M3 的公共接口不变。Codex 核心导出 `matchTemplatesCore` 与 `evaluateProsodyCore`，输入输出分别与公共 `matchTemplates`、`evaluateProsody` 相同；C 负责导出、适配与报告封装，不能在封装里重判格律、改等级或把 uncertain 改成 pass。未实现入口须明确报未实现，不能用空结果装成通过。C 可补规则卡引用与结构校验，核心缺陷以最小复现交 Codex 修复。

Codex 还负责数据疑点、消歧/体裁误判的技术复核及跨模块疑难修复。接管正在开发的路径时，在 `docs/ownership.md`、`docs/handoffs/` 记录当前分支/提交、具体路径、写入方、验收人和退出条件；原写入方暂停同路径写入，其余目录继续工作。

接管保留已有实现，从当前提交继续，不默认重写模块。各成员通过共享 Git 与 HANDOFF 交接，不假设不同电脑的智能体自动共享上下文。Codex 首批骨架完成后，以仓库状态记录区分“已实现并验证”和“待开发”。

前端按 `CheckerViewProps` 拆为展示层与业务容器，约定见《03_前端设计与协作约定.md》，D 和 Claude 的任务书均含对应说明。D 在 D1 首小时落地并冻结内部接口；展示层不发请求、不重判格律。Claude 尚未接入，试接入约 1 小时不可用就启用候补，D 同步用 fixture 推进业务。该调整不改变 HTTP 契约；动画仍属于全部 P0 通过后的 P1。

### 2. 术语、索引和状态

- `P` 表示平，`Z` 表示仄；未知不是第三种实际声调。
- `line`、`column` 从 1 开始，按诗句和汉字计数；`startUtf16/endUtf16` 是原始字符串中的半开区间。
- `tokenId` 为 `l{line}c{column}`，例如 `l4c1`。标点不占格律字位。
- `inputHash` 为原始输入 UTF-8 文本的 SHA-256 小写十六进制值。人工选音仅对该原文有效。
- 简繁和异体对应只生成候选，不覆盖原文；不得把“发”无条件合并到“發”或“髮”。
- `resolved/ambiguous/unknown` 分别表示读音确定、有多个合理候选、没有可用候选。
- 规则状态为 `pass/fail/uncertain/not_applicable/unsupported`。
- `not_applicable` 表示规则不适用；`unsupported` 表示形式或规则尚未实现；不得混用。
- `error/warning/info` 是问题等级，与规则状态独立。三仄尾默认 warning；其出现不自动使全篇 fail。
- 判定为 pass 不等于文学评价优秀，也不保证未实现的规则通过。

### 3. 权威类型草案

以下类型定义名称和含义。Zod 为代码中的唯一权威源；不要分别手写两份可漂移的类型与 Schema。所有公共函数的输入输出均须可 JSON 序列化。

```ts
export type BookId = 'pingshui' | 'cilin' | 'xinyun';
export type FormId = 'wujue' | 'qijue' | 'wulv' | 'qilv';
export type Tone = 'P' | 'Z';
export type CheckStatus =
  | 'pass' | 'fail' | 'uncertain' | 'not_applicable' | 'unsupported';
export type SummaryStatus =
  | 'pass' | 'fail' | 'needs_review' | 'not_applicable' | 'unsupported';

export interface Versions {
  data: string;
  rules: string;
  context: string;
  works: string;
}

export interface SourceRecord {
  id: string;
  title: string;
  edition: string | null;
  url: string | null;
  license: string;
  snapshotSha256: string | null;
  revision: string | null;
  retrievedAt: string | null;
}

export interface Evidence {
  id: string;
  sourceId: string;
  kind: 'rhyme_entry' | 'dictionary' | 'fanqie' | 'context' | 'work_metadata';
  locator: string;
  assertion: string;
  excerpt: string | null;
  reviewStatus: 'approved' | 'unverified';
}

export interface RuleCard {
  id: string;
  version: string;
  name: string;
  scope: string;
  statement: string;
  limitations: string[];
  evidenceIds: string[];
}

export interface ReadingCandidate {
  id: string;
  character: string;
  book: BookId;
  toneClass:
    | 'ping' | 'shang' | 'qu' | 'ru'
    | 'yinping' | 'yangping' | 'neutral' | 'ze_unspecified';
  tone: Tone | null;
  groupIds: string[];
  gloss: string | null;
  modernReading: null | {
    pinyin: string;
    toneNumber: 1 | 2 | 3 | 4 | 5;
    evidenceIds: string[];
  };
  fanqie: null | { text: string; evidenceIds: string[] };
  evidenceIds: string[];
}

export interface RhymeGroup {
  id: string;
  book: BookId;
  name: string;
  toneClass: string | null;
  evidenceIds: string[];
}

export interface LookupResult {
  book: BookId;
  dataVersion: string;
  entries: Array<{ character: string; candidates: ReadingCandidate[] }>;
  missing: string[];
  groups: RhymeGroup[];
  evidence: Evidence[];
  sources: SourceRecord[];
}

export interface ParsedToken {
  tokenId: string;
  text: string;
  line: number;
  column: number;
  startUtf16: number;
  endUtf16: number;
}

export interface ParseNotice {
  code: string;
  message: string;
  startUtf16: number;
  endUtf16: number;
}

export interface ParsedPoem {
  originalText: string;
  inputHash: string;
  lines: Array<{ line: number; text: string; tokenIds: string[] }>;
  tokens: ParsedToken[];
  quality: 'ok' | 'needs_review';
  notices: ParseNotice[];
}

export interface ReadingOverride {
  tokenId: string;
  readingId: string;
}

export interface ContextRule {
  id: string;
  target: string;
  exactPhrases: string[];
  targetOffset: number;
  sense: string;
  book: BookId;
  selectCandidateIds: string[];
  negativeExamples: string[];
  evidenceIds: string[];
  reviewStatus: 'approved' | 'unverified';
}

export interface AnnotatedToken extends ParsedToken {
  candidates: ReadingCandidate[];
  effectiveCandidateIds: string[];
  readingStatus: 'resolved' | 'ambiguous' | 'unknown';
  selectedReadingId: string | null;
  selectionMethod: 'unique' | 'context_rule' | 'user' | 'unresolved';
  possibleTones: Tone[];
  toneStatus: 'resolved' | 'ambiguous' | 'unknown';
  tone: Tone | null;
  reason: string;
  evidenceIds: string[];
}

export interface AnnotatedPoem extends Omit<ParsedPoem, 'tokens'> {
  book: BookId;
  tokens: AnnotatedToken[];
}

export interface TemplateCandidate {
  id: string;
  formId: FormId;
  lineTypes: Array<'A' | 'B' | 'C' | 'D'>;
  expectedTones: Tone[][][];
  requiredRhymeLines: number[];
  evaluatedKeyRate: number;
  features: {
    toneFit: number | null;
    relationFit: number | null;
    rhymeFit: number | null;
    parallelismFit: number | null;
  };
  score: number | null;
}

export interface WorkMetadata {
  id: string;
  title: string;
  author: string | null;
  approvedTextFingerprints: string[];
  formFamily: 'regulated' | 'ancient' | 'undetermined' | 'unsupported';
  formId: FormId | null;
  historicalTags: string[];
  evidenceIds: string[];
  reviewStatus: 'approved' | 'unverified';
}

export interface GenreDecision {
  formFamily: 'regulated' | 'ancient' | 'undetermined' | 'unsupported';
  formId: FormId | null;
  historicalTags: string[];
  applicability: 'applicable' | 'not_applicable' | 'uncertain' | 'unsupported';
  basisType: 'user' | 'reviewed_metadata' | 'heuristic';
  candidateTemplateIds: string[];
  selectedTemplateId: string | null;
  reasons: string[];
  evidenceIds: string[];
}

export interface Finding {
  id: string;
  ruleId: string;
  ruleVersion: string;
  status: CheckStatus;
  severity: 'error' | 'warning' | 'info';
  locations: Array<{ tokenId: string; line: number; column: number }>;
  expected: string[];
  observed: string[];
  message: string;
  templateId: string | null;
  evidenceIds: string[];
  resolvedBy: string | null;
  relatedFindingIds: string[];
}

export interface ProsodyReport {
  candidates: TemplateCandidate[];
  selectedTemplateId: string | null;
  checks: Finding[];
  rhyme: {
    status: CheckStatus;
    tokenIds: string[];
    commonGroupIds: string[];
  };
  relations: Array<{
    kind: 'nian' | 'dui';
    tokenIds: string[];
    status: CheckStatus;
    findingIds: string[];
  }>;
}

export interface AnalyzeRequest {
  text: string;
  rhymeBook: BookId;
  genreHint: 'auto' | 'regulated' | 'ancient';
  formHint: 'auto' | FormId;
  ruleSet: 'teaching-v1';
  inputHash?: string;
  readingOverrides: ReadingOverride[];
}

export interface AnalysisResponse {
  schemaVersion: '1.0';
  inputHash: string;
  versions: Versions;
  policy: {
    rhymeBook: BookId;
    toneBasis: 'historical' | 'mandarin_base';
    notice: string;
  };
  poem: AnnotatedPoem;
  genre: GenreDecision;
  prosody: ProsodyReport;
  provenance: {
    groups: RhymeGroup[];
    sources: SourceRecord[];
    evidence: Evidence[];
    rules: RuleCard[];
  };
  summary: { status: SummaryStatus; message: string };
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    fieldErrors: Array<{ path: string; message: string }>;
  };
}
```

补充约定：

1. `expectedTones[句序号-1][字序号-1]` 是允许平仄数组；它只是基础模板，不能替代孤平、尾式、变格约束。
2. `possibleTones` 由有效候选计算。任一有效候选声调未知时，`toneStatus` 为 unknown，不能用其他已知候选掩盖它；所有有效候选同为平或同为仄时，平仄可确定而读音仍可 ambiguous。
3. `ze_unspecified` 用于来源只提供“仄声”、不能进一步区分上去的记录，不补造细分类。
4. `neutral` 没有可靠本调时 `tone=null`；不得默认归平。
5. `ContextRule.targetOffset` 按短语 Unicode 码点从 0 计数；每条规则所有短语的目标偏移必须一致，否则拆成多条。
6. 上下文规则若同时选中多个相互冲突候选，不自动任选；退回 ambiguous 并记录冲突。
7. 来源和规则 ID 是稳定标识；报告中引用的每个 ID 必须能在 provenance 或相应查询接口中解析。
8. unverified 的证据只能出现在待核查材料中，不得支撑确定的发布结论。
9. 作品指纹按去除约定的标点与空白后、保留原字形和字序的正文计算 SHA-256。简繁及异文各自登记审核指纹，不自动互认。该指纹不同于原文 inputHash。

### 4. 模块接口

```ts
// M1 / A：异步 I/O 适配器
lookupCharacters(input: {
  characters: string[]; rhymeBook: BookId; dataVersion: string;
}): Promise<LookupResult>

// M2 / B：纯计算。规则和证据由 API 装载后注入。
parseText(input: { text: string }): ParsedPoem
resolveReadings(input: {
  poem: ParsedPoem;
  lookup: LookupResult;
  overrides: ReadingOverride[];
  contextRules: ContextRule[];
}): AnnotatedPoem

// M3 / C：先产出特征，供体裁模块消费；不要导入 M5。
matchTemplates(input: {
  poem: AnnotatedPoem; formHint: 'auto' | FormId; ruleSet: 'teaching-v1';
}): TemplateCandidate[]

evaluateProsody(input: {
  poem: AnnotatedPoem;
  candidates: TemplateCandidate[];
  selectedTemplateId: string | null;
  applicability: GenreDecision['applicability'];
  ruleSet: 'teaching-v1';
}): ProsodyReport

// M5 / E：不用标题独立认定作品，也不修改读音。
classifyGenre(input: {
  poem: AnnotatedPoem;
  candidates: TemplateCandidate[];
  metadata: WorkMetadata[];
  genreHint: AnalyzeRequest['genreHint'];
  formHint: AnalyzeRequest['formHint'];
}): GenreDecision
```

API 由组长依次调用：请求校验 → parseText → M1 查询 → resolveReadings → matchTemplates → classifyGenre → evaluateProsody → 证据汇总 → 汇总结论。

不得形成 `prosody → genre → prosody` 的运行时依赖。两个步骤都由 API 调度。

### 5. HTTP 契约

| 方法与路径 | 请求 | 成功响应 | 负责人 |
|---|---|---|---|
| POST `/api/v1/analyze` | AnalyzeRequest | AnalysisResponse | 组长 |
| GET `/api/v1/rhyme-books` | 无 | `{books:[{id,name,dataVersion,groupCount,coverageNotice}]}` | 组长接 A |
| GET `/api/v1/characters/{char}?book=...` | 单字和 BookId | LookupResult | 组长接 A |
| GET `/api/v1/rules/{ruleId}` | 规则 ID | `{rule,evidence,sources}` | 组长接 C |
| GET `/api/v1/sources/{sourceId}` | 来源 ID | `{source,evidence}` | 组长接 A/B/E |
| GET `/healthz` | 无 | `{status:"ok"}` | 组长 |
| GET `/readyz` | 无 | `{status:"ready",versions}` | 组长 |

分析请求示例：

```json
{
  "text": "白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。",
  "rhymeBook": "pingshui",
  "genreHint": "auto",
  "formHint": "auto",
  "ruleSet": "teaching-v1",
  "readingOverrides": []
}
```

人工覆盖是在上一次响应的原文、候选和 inputHash 基础上，将 `readingOverrides` 填为 `[{"tokenId":"l4c1","readingId":"实际候选ID"}]`。不能凭空提供读音。

规则输出片段（ID 为结构示意，发布时必须引用真实规则及证据）：

```json
{
  "id": "finding-l1c2-meter",
  "ruleId": "METER.POSITION",
  "ruleVersion": "1",
  "status": "fail",
  "severity": "error",
  "locations": [{"tokenId":"l1c2","line":1,"column":2}],
  "expected": ["Z"],
  "observed": ["P"],
  "message": "按所选模板，第一句第二字应仄，此处为平",
  "templateId": "实际模板ID",
  "evidenceIds": ["实际平声归属证据ID"],
  "resolvedBy": null,
  "relatedFindingIds": []
}
```

约束与错误：

- 请求不超过 2,000 个 Unicode 码点、100 个诗句；限额在后端执行。
- 没有汉字、枚举非法、指定 ancient 同时强选近体 form、覆盖读音无效：422。
- 有覆盖时 inputHash 必填并与当前原文一致；冲突为 422 `STALE_READING_OVERRIDE`。
- 请求过大：413；资源 ID 不存在：404；数据未就绪：503；未知程序错误：500，响应不泄露堆栈。
- 缺字、读音歧义、体裁待定属于正常分析结果，返回 200。
- 相同输入、数据版本、规则版本、上下文版本、作品版本和用户覆盖必须产生相同业务结果；数组稳定排序，业务响应不混入随机 ID 或时间戳。

### 6. 汇总状态算法（组长实现）

1. 有未被认可救法解决的 `severity=error && status=fail`，汇总 fail，同时保留不确定项。
2. 没有确定硬错误，但必检项 uncertain、解析质量 needs_review、影响结论的模板未确定，汇总 needs_review。
3. 已确认不适用近体规则，汇总 not_applicable；仍返回逐字标注和归部信息，不输出近体硬错误。
4. 形式或关键规则属于尚未支持范围，汇总 unsupported，不能显示通过。
5. 必检项均可确定通过，汇总 pass。非关键位置的读音歧义、三仄尾警告等仍展示，不隐去。

若同时出现“不适用/不支持”和参考检查结果，参考偏离必须是 info/warning，不作为上述第一步的硬错误。

### 7. 语言学口径

- 平水韵、词林正韵采用传统声类：平为 P，上、去、入为 Z。词林正韵来源仅给仄声时保留 ze_unspecified。
- 中华新韵采用普通话本调：一二声 P，三四声 Z；不把语流变调作为默认格律声调。
- 旧入声到新韵按具体字、读音、义项建立联系，不按旧韵部整体转换。
- 选择词林正韵只改变归部，不自动启用词牌，不自动允许近体模板平仄通押。
- P0 支持五绝、七绝、五律、七律；常见孤平自救、特拗、对句相救；其他救法明示待复核。
- 三仄尾默认警告；孤平采用声明过的窄义教学口径；不得将“一三五不论”做成无条件通配。
- 乐府是可与形式标签并存的历史标签。不能“乐府一律免检”，也不能“不合律就是古体”。
- 《静夜思》使用有来源的古绝案例标注；《黄鹤楼》保留七律形式和特殊拗律说明，不能改判古体免检。

### 8. 共同测试与交付要求

- 所有成员提交模块测试、README、限制说明和 `HANDOFF.md`。
- 有共享仓库时使用 `pnpm --filter <本人包名> test`；命令由组长根配置落地。没有公共骨架时先写本模块纯逻辑和 fixture，不伪称测试运行成功。
- 不修改金标准来迁就实现。语言学预期由组长与相应负责人审核。
- 真实来源用真实 ID；示例数据须标明 fixture，发布路径不得载入模拟字表。
- 首次提交必须小而可检查；每个子任务不超过 2 小时后再汇报可运行产物和失败项。
- `HANDOFF.md` 必含：变更文件、完成用例、执行命令及结果、未解决问题、数据/规则版本、集成方法。
- 自行检查 diff，禁止提交密钥、模型凭证和用户原文日志；文本按文本渲染。

### 9. D1 冻结检查表

组长在 `docs/contract-freeze.md` 记录：版本、提交号、上面全部类型/接口、位置单位、枚举、空值规则、错误格式、汇总算法、三库口径、四种展示状态的完整合法响应 fixture。

冻结后公共变化走独立 PR，更新 Schema、生成类型、OpenAPI、fixture 和受影响测试。成员只提出变更，不各自修改。
