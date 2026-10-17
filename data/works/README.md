# data/works

负责人：队员 E / DeepSeek。状态：D1 建立候选空间，**0 条 approved**。

本目录存放作品正文候选与来源定位线索，供后续“审核后元数据”使用。

## 当前内容

- `review-queue.json`：三首核心作品的候选登记与待审核事项。
- 尚未产生任何 `WorkMetadata`（`reviewStatus=approved` 的元数据需要人工审核者与可定位证据）。

## 使用边界

1. 本目录的数据**不加载为 approved 元数据**，也不进入体裁判定依据。
2. 正文来源与体裁/读音依据分别登记：诗词数据仓库提供原文 ≠ 提供语言学答案。
3. 找不准定位就写 `null` 或标为 `lead`（待查线索），**不写猜测 URL 或页码**。
4. 异文、简繁差异、首句不同版本都要另立条目，不合并、不悄悄转换。

## 下一步（D2 起）

- 为每首补齐可打开的权威出处（书名、卷次、版次、页码）后才可申请人工审核。
- 审核通过后生成 `WorkMetadata`（含 `approvedTextFingerprints` 与 `evidenceIds`），再接入 `classifyGenre` 的指纹匹配分支。
