# data/normalized：规范化中间物（开发/待审核）

这里的文件是**规范化样本与重建表草稿**，身份明确为开发/待审核，不是发布数据。

| 文件                              | 内容                                                               | 身份                                                                      |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `pingshui.sample-d1.json`         | 真实七字小样本（白、一、更、流、楼、雪、物），平水归部与声类       | `reviewStatus: unverified`，`dataVersion: sample-pingshui-cwr-ff0e9c1-d1` |
| `xinyun.rebuild.dev.json`（可选） | 中华新韵重建表全量（`scripts/data/rebuild-xinyun.ts --full` 生成） | 项目重建表，非官方原始字表；不入库默认提交                                |

## 生成

```powershell
node --conditions=development scripts/data/build-sample.ts       # 七字小样本
node --conditions=development scripts/data/rebuild-xinyun.ts     # 重建覆盖/未映射/冲突报告
node --conditions=development scripts/data/rebuild-xinyun.ts --full   # 另存重建全表
```

同一输入重复生成得到同一业务内容摘要（`retrievedAt` 等时间字段不入摘要）：

```text
pingshui.sample-d1.json  业务内容摘要 1ec8732914b980ccb3033eabcb7e6d2611eee0691fd909c6cb12375212617ab8
xinyun rebuild           业务内容摘要 5e9bbd0a3647113efb6778e85d60c4604514033c029d87044fbdd48c67b2ce84
```

## 快照字段

文件就是一个快照对象：`dataVersion / book / reviewStatus / notice / candidates / groups / evidence / sources`。
`packages/lexicon` 的 `deserializeSnapshot()` 可直接装载，`lookupCharacters()` 用同样的 `dataVersion` 查询。

反切、义项、今读：源表不含，保持 `null`，不补造。
