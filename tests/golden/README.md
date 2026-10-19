# tests/golden

当前说明（D3，2026-10-19）：三份 `cases/*.json` 已按 J03/已有确认落库；approved **仅限 JSON 内列明的固定正文、作者和体裁等断言**，不批准全部逐字音韵或三库全量。审批与来源映射在 `data/works/review-closure.json`。任务书所称 canonical 金标准就是这三份文件，未另设 canonical 目录。D3 精确特例独立断言由九格 runner 和 C 用例补充，依据 13 号第 8 条，不能从 API 输出反抄真值。

以下保留 D1 初始建档说明，其中 pending/0次实跑是历史统计，不代表当前状态。

负责人：队员 E / DeepSeek。状态：D1 建立格式与审核门槛，**未运行真实分析**。

登记真实作品与语文学预期，区分 `approved` 与 `pending`。合成 P/Z 只验证算法，不计为作品金标准。

## 当前用例

| 文件                        | 作品     | 审核状态 | 说明                                    |
| --------------------------- | -------- | -------- | --------------------------------------- |
| `cases/dengguanquelou.json` | 登鹳雀楼 | pending  | 候选预期：五绝；尤部同韵；白/一为古入声 |
| `cases/jingyesi.json`       | 静夜思   | pending  | 本项目选取的古绝案例；异文另立版本      |
| `cases/huanghelou.json`     | 黄鹤楼   | pending  | 七律 + 特殊拗律；常格偏离须可见         |

## 两个数字必须分开报

- **结构校验通过：3/3**（字段、request 契约、审核门槛）
- **已人工审核：0/3；真实分析运行：0/3**

后者不能因为前者通过而变绿。

## 审核流程

1. 补齐正文权威出处（书名/卷次/版次/页码），来源类型只能是 `located`（可打开条目）或 `lead`（待查线索）。
2. 填写 `assertions`：只写真实学术预期与接口不变量，不快照随机 ID、不写非关键排序。
3. 至少一名人工审核者署名 + 至少一条可解析 `evidenceIds`，才允许把 `reviewStatus` 从 `pending` 改为 `approved`。
4. 改状态前重跑校验器；结构失败或门槛不全一律拒绝。

## 校验器与运行方式

校验器在 `packages/genre/src/golden-case.ts`（手写校验，不引入 zod 依赖）：

- `validateGoldenCase(raw)`：单条校验，含 `approved` 必须有审核人与证据的门槛。
- `validateGoldenCases(list)`：批量校验并拒绝重复 `id`。

执行（可执行测试放在 `packages/genre/tests`，根 `tests` 只放数据）：

```sh
pnpm exec vitest run packages/genre/tests
```

## 禁止事项

- 不凭标题、作者、首句或简繁转换匹配作品；精确正文指纹匹配属 D2。
- 不把 `pending` 当成语言学通过，也不把结构有效当成学术批准。
- 不编造审核人、证据 ID 或页码。
