# data/raw：原始快照（不改写）

本目录只放**上游原样字节**，不编辑、不清洗、不合并。所有统计与导入都从这里的字节出发。

2026-10-21新增`deepseek/`：用户提供的2022篇诗文、注音、字典及广韵表等共七份原始文件，以gzip保存原样字节。各文件解压摘要、压缩摘要与取得范围见`deepseek/manifest.json`；派生库在`data/library/deepseek-v1/`，不改原三书证据。复现及权利边界见`docs/features/deepseek-corpus.md`。

| 文件                                                     | 上游                                                                    | 固定引用                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `chinese_word_rhyme/Pingshui_Rhyme.json`                 | [chinese_word_rhyme](https://github.com/charlesix59/chinese_word_rhyme) | 提交 `ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18`                  |
| `chinese_word_rhyme/Cilin_Rhyme.json`                    | 同上                                                                    | 同上                                                             |
| `chinese_word_rhyme/Xinyun_Rhyme.json`                   | 同上                                                                    | 同上                                                             |
| `chinese_word_rhyme/Xinyun_Rhyme_FourRhyme_Edition.json` | 同上                                                                    | 同上                                                             |
| `chinese_word_rhyme/LICENSE`、`README.md`                | 同上                                                                    | 同上                                                             |
| `pinyin-data/pinyin.txt`、`LICENSE`                      | [pinyin-data](https://github.com/mozillazg/pinyin-data)                 | 标签 `v0.15.0` → 提交 `fa9761fff402f8560196b1ba085c437c52b56d7c` |
| `wikisource/PingshuiYun-8264804.wikitext` | 维基文库《平水韻》 | oldid `8264804`；37,073 字节 |
| `wikisource/CilinZhengyun-2123337.wikitext` | 维基文库《詞林正韻》 | oldid `2123337`；27,665 字节 |

## 复现

```powershell
node scripts/data/fetch-sources.ts          # 首次下载，按 manifest 登记的路径与摘要写入
node scripts/data/fetch-sources.ts --check  # 只校验，不写入；摘要不符即退出码 1
```

下载与导入是分开的两步：本目录只有下载器产物，解析/统计在 `scripts/data/inspect.ts`，
规范化与重建在 `scripts/data/build-sample.ts`、`scripts/data/rebuild-xinyun.ts`。

## 授权

`chinese_word_rhyme` 与 `pinyin-data` 各自声明 MIT，已连同 LICENSE 一并快照；但**上游转载字表的授权链未核实**，
详见 `data/sources/manifest.json` 的 `upstreamRightsTodo` 与 `docs/data-provenance.md`。未经核实不对外称可商用。

维基文库《平水韻》《詞林正韻》固定修订正文均已留存在 `wikisource/`，实际路径、SHA-256、获取方式与许可说明见 `data/sources/manifest.json`。D1 页面不可达的记录属于历史环境；D4 已取得《詞林正韻》。留存字节不等于全库内容审核或转载授权完备，剩余缺口见 `docs/data-quality.md`。
