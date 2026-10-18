# data/releases：发布包（当前为空）

**当前没有任何发布包，这是正确状态。**

三套韵书的发布门槛全部未达成：

| 韵书     | 门槛                                                         | 实际                                                  | 结论                                                    |
| -------- | ------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------- |
| 平水韵   | 上平 15 + 下平 15 + 上 29 + 去 30 + 入 17 = 106 部，逐部非空 | 105 部（缺上声三讲），其余分部齐全、无空部            | 未达门槛                                                |
| 词林正韵 | 19 部（33 子卷），逐卷非空                                   | 19 部 / 33 子卷齐全、无空卷                           | 内容齐，但仍是原表转载、证据 `unverified`、未经人工审核 |
| 中华新韵 | 14 韵 × 四声 = 56 子卷，逐卷非空                             | 项目重建表 56 子卷齐全（41,803 字形），规则出处待核实 | 未审核，不得发布                                        |

## 命名约定

- 已核对的真实小样本与全量发布包必须分开命名：
  - 样本：`<book>.sample-<来源>-<固定引用>.json`，放 `data/normalized/`；
  - 发布：`<book>.<semver>-<yyyymmdd>.json`，放本目录，且必须满足
    `checkCompleteness(...).releaseGatePassed === true`（含 `reviewStatus: approved`）。
- `reviewStatus` 不是 `approved` 的快照，**不得**放进本目录，也不得写进 `dataVersion` 对外宣称可用。
- 重建表必须在其 `notice`、来源标题与版本说明里写明“项目重建表，非官方原始字表”。

## 发布前检查（尚未接线到根命令）

`pnpm data:build` / `pnpm data:check` 还不存在（根配置由 GLM 维护）。当前可用的等价命令：

```powershell
node --conditions=development scripts/data/inspect.ts        # 统计与缺口
node --conditions=development scripts/data/build-sample.ts   # 小样本
node --conditions=development scripts/data/rebuild-xinyun.ts # 重建报告
```

把发布门槛接成根命令、并在 `readyz` 里反映真实装载状态，需 GLM 接线后才有意义。
