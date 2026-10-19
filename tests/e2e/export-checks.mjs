import assert from "node:assert/strict";

// Independent acceptance assertions; do not import the application's export builder.
export function assertSummaryExport(text, report, request) {
  assert.equal(typeof text, "string", "剪贴板内容不可读");
  assert(text.trim().length > 0, "剪贴板为空，不能跳过内容验收");
  // Windows clipboard exposes CRLF; compare textual lines without treating that as corruption.
  text = text.replace(/\r\n/g, "\n");
  const form = report.genre.formId ? ` / ${report.genre.formId}` : "";
  for (const [label, expected] of [
    ["结论", `结论：${report.summary.status} — ${report.summary.message}`],
    ["韵书", `韵书：${report.policy.rhymeBook}（${report.policy.toneBasis}）`],
    [
      "体式",
      `体式：${report.genre.formFamily}${form}（适用性：${report.genre.applicability}）`,
    ],
    ["规则版本", `规则版本：${report.versions.rules}`],
    ["数据版本", `数据版本：${report.versions.data}`],
    ["inputHash", `原文摘要：${report.inputHash}`],
    ["原文", `原文：\n${report.poem.originalText.replace(/\r\n/g, "\n")}\n`],
  ])
    assert(text.includes(expected), `复制内容 ${label} 与当前报告不一致`);
  const snapshot = text
    .split("\n")
    .find((line) => line.startsWith("请求快照："));
  assert(snapshot, "复制内容缺少请求快照");
  assert.deepEqual(
    JSON.parse(snapshot.slice("请求快照：".length)),
    request,
    "复制请求快照不一致",
  );
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
