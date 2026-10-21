import assert from "node:assert/strict";

// Independent acceptance assertions; do not import the application's export builder.
export function assertSummaryExport(text, report, request) {
  assert.equal(typeof text, "string", "剪贴板内容不可读");
  assert(text.trim().length > 0, "剪贴板为空，不能跳过内容验收");
  // Windows clipboard exposes CRLF; compare textual lines without treating that as corruption.
  text = text.replace(/\r\n/g, "\n");
  const book = { pingshui: "平水韵", cilin: "词林正韵", xinyun: "中华新韵" }[
    report.policy.rhymeBook
  ];
  const evenFeet = report.poem.lines
    .filter((line) => line.line % 2 === 0)
    .map((line) =>
      report.poem.tokens.find((t) => t.tokenId === line.tokenIds.at(-1)),
    );
  const outsideBasicRhyme =
    report.prosody.format &&
    report.genre.applicability === "uncertain" &&
    evenFeet.length > 0 &&
    evenFeet.every((t) => t?.toneStatus === "resolved" && t.tone === "Z");
  const status = outsideBasicRhyme
    ? "当前仅作逐字平仄参考，不据平韵基本谱判定合律。"
    : {
        pass: "已实现的必检项均通过。",
        fail: "按当前参考格式，发现格律问题。",
        needs_review: "暂不作合律结论。",
        not_applicable: "不按近体格律评判。",
        unsupported: "当前规则尚不能完整评判此体式。",
      }[report.summary.status];
  for (const [label, expected] of [
    ["标题", "诗词格律简评"],
    ["评语", `评语：${status}`],
    ["韵书", `依据：${book}`],
    ["原文", `\n${report.poem.originalText.replace(/\r\n/g, "\n")}\n`],
  ])
    assert(text.includes(expected), `复制内容 ${label} 与当前报告不一致`);
  const names = { wujue: "五绝", qijue: "七绝", wulv: "五律", qilv: "七律" };
  if (report.prosody.format) {
    const format = report.prosody.format;
    const start =
      format.start.value === "ping"
        ? "平起"
        : format.start.value === "ze"
          ? "仄起"
          : "起式未定";
    assert(
      text.includes(`格式：${names[format.shape.formId]}形制 · ${start}`),
      "分享格式与分项识别不一致",
    );
  } else if (report.genre.formId)
    assert(
      text.includes(`参考形制：${names[report.genre.formId]}`),
      "分享形制不一致",
    );
  assert.equal(
    report.poem.originalText,
    request.text,
    "分享必须属于本次成功请求",
  );
  assert(!text.includes(report.inputHash), "分享不应包含原文哈希");
  assert(
    !/请求快照：|规则版本：|数据版本：|结论：needs_review/.test(text),
    "分享混入调试信息",
  );
  if (report.summary.status !== "pass")
    assert(!text.includes("必检项均通过"), "未通过报告不得宣称通过");
}

export function assertReportExport(downloaded, report, request) {
  assert.deepEqual(
    downloaded.report,
    report,
    "导出完整报告与当前 API 响应不一致",
  );
  assert.deepEqual(downloaded.request, request, "导出完整请求快照不一致");
  assert.equal(
    downloaded.originalText,
    report.poem.originalText,
    "导出原文不一致",
  );
  assert.equal(downloaded.inputHash, report.inputHash, "导出 inputHash 不一致");
  assert.deepEqual(
    downloaded.exportedAtVersion,
    {
      schemaVersion: report.schemaVersion,
      versions: report.versions,
    },
    "导出版本元数据不一致",
  );
  assert.deepEqual(
    downloaded.readingOverrides,
    request.readingOverrides,
    "导出选音覆盖不一致",
  );
}
