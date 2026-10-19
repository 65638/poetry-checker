import { describe, expect, it } from "vitest";
import type { AnnotatedPoem, AnnotatedToken, Tone } from "@poetry/contracts";
import {
  FROZEN_RULE_IDS,
  checkReportClosure,
  evaluateProsody,
  matchTemplates,
} from "../../src/index.js";
import { makeCodePoem } from "./fixtures.js";

// D3 已审特例独立验收（C 独立预期，不从实现输出反推）。
// 依据：docs/reviews/13_J03三首核心诗逐字人审_第二批.md 第 8 条 + 第六节：
//   《黄鹤楼》「空悠悠」三平尾成立，作古风式律诗特征保留，不判近体出律、不作 error。
// 范围：只裁该作品该字位（平水、已审固定正文），不扩成全诗免责；不新增 ruleId、不改契约。
// 现状（main f42172f）：core 仍报 TAIL.SANPING=fail/error（红），待 Codex reviewed-exceptions 落地后转绿。

const HH_ROWS: ReadonlyArray<readonly [string, string, "P" | "Z", string]> = [
  ["l1c1", "昔", "Z", "pingshui:昔:ru:入声十一陌"],
  ["l1c2", "人", "P", "pingshui:人:ping:十一真"],
  ["l1c3", "已", "Z", "pingshui:已:shang:四纸"],
  ["l1c4", "乘", "P", "pingshui:乘:ping:十蒸"],
  ["l1c5", "黄", "P", "pingshui:黄:ping:七阳"],
  ["l1c6", "鹤", "Z", "pingshui:鹤:ru:入声十药"],
  ["l1c7", "去", "Z", "pingshui:去:qu:六御"],
  ["l2c1", "此", "Z", "pingshui:此:shang:四纸"],
  ["l2c2", "地", "Z", "pingshui:地:qu:四寘"],
  ["l2c3", "空", "P", "pingshui:空:ping:一东"],
  ["l2c4", "余", "P", "pingshui:余:ping:六鱼"],
  ["l2c5", "黄", "P", "pingshui:黄:ping:七阳"],
  ["l2c6", "鹤", "Z", "pingshui:鹤:ru:入声十药"],
  ["l2c7", "楼", "P", "pingshui:楼:ping:十一尤"],
  ["l3c1", "黄", "P", "pingshui:黄:ping:七阳"],
  ["l3c2", "鹤", "Z", "pingshui:鹤:ru:入声十药"],
  ["l3c3", "一", "Z", "pingshui:一:ru:入声四质"],
  ["l3c4", "去", "Z", "pingshui:去:qu:六御"],
  ["l3c5", "不", "Z", "pingshui:不:ru:入声五物"],
  ["l3c6", "复", "Z", "pingshui:复:qu:二十六宥"],
  ["l3c7", "返", "Z", "pingshui:返:shang:十三阮"],
  ["l4c1", "白", "Z", "pingshui:白:ru:入声十一陌"],
  ["l4c2", "云", "P", "pingshui:云:ping:十二文"],
  ["l4c3", "千", "P", "pingshui:千:ping:一先"],
  ["l4c4", "载", "Z", "pingshui:载:qu:十一队"],
  ["l4c5", "空", "P", "pingshui:空:ping:一东"],
  ["l4c6", "悠", "P", "pingshui:悠:ping:十一尤"],
  ["l4c7", "悠", "P", "pingshui:悠:ping:十一尤"],
  ["l5c1", "晴", "P", "pingshui:晴:ping:八庚"],
  ["l5c2", "川", "P", "pingshui:川:ping:一先"],
  ["l5c3", "历", "Z", "pingshui:历:ru:入声十二锡"],
  ["l5c4", "历", "Z", "pingshui:历:ru:入声十二锡"],
  ["l5c5", "汉", "Z", "pingshui:汉:qu:十五翰"],
  ["l5c6", "阳", "P", "pingshui:阳:ping:七阳"],
  ["l5c7", "树", "Z", "pingshui:树:qu:七遇"],
  ["l6c1", "芳", "P", "pingshui:芳:ping:七阳"],
  ["l6c2", "草", "Z", "pingshui:草:shang:十九皓"],
  ["l6c3", "萋", "P", "pingshui:萋:ping:八齐"],
  ["l6c4", "萋", "P", "pingshui:萋:ping:八齐"],
  ["l6c5", "鹦", "P", "pingshui:鹦:ping:八庚"],
  ["l6c6", "鹉", "Z", "pingshui:鹉:shang:七麌"],
  ["l6c7", "洲", "P", "pingshui:洲:ping:十一尤"],
  ["l7c1", "日", "Z", "pingshui:日:ru:入声四质"],
  ["l7c2", "暮", "Z", "pingshui:暮:qu:七遇"],
  ["l7c3", "乡", "P", "pingshui:乡:ping:七阳"],
  ["l7c4", "关", "P", "pingshui:关:ping:十五删"],
  ["l7c5", "何", "P", "pingshui:何:ping:五歌"],
  ["l7c6", "处", "Z", "pingshui:处:qu:六御"],
  ["l7c7", "是", "Z", "pingshui:是:shang:四纸"],
  ["l8c1", "烟", "P", "pingshui:烟:ping:一先"],
  ["l8c2", "波", "P", "pingshui:波:ping:五歌"],
  ["l8c3", "江", "P", "pingshui:江:ping:三江"],
  ["l8c4", "上", "Z", "pingshui:上:qu:二十三漾"],
  ["l8c5", "使", "Z", "pingshui:使:qu:四寘"],
  ["l8c6", "人", "P", "pingshui:人:ping:十一真"],
  ["l8c7", "愁", "P", "pingshui:愁:ping:十一尤"],
];

function buildHuanghelou(): AnnotatedPoem {
  const tokens: AnnotatedToken[] = [];
  const lines: AnnotatedPoem["lines"] = [];
  let offset = 0;
  for (let line = 1; line <= 8; line += 1) {
    const ids: string[] = [];
    const texts: string[] = [];
    for (let column = 1; column <= 7; column += 1) {
      const row = HH_ROWS.find(([id]) => id === `l${line}c${column}`)!;
      const [, text, tone, candidateId] = row;
      const cls = candidateId.split(":")[2] as "ping" | "shang" | "qu" | "ru";
      const token: AnnotatedToken = {
        tokenId: row[0],
        text,
        line,
        column,
        startUtf16: offset,
        endUtf16: offset + 1,
        candidates: [
          {
            id: candidateId,
            character: text,
            book: "pingshui",
            toneClass: cls,
            tone: tone as Tone,
            groupIds: [],
            gloss: null,
            modernReading: null,
            fanqie: null,
            evidenceIds: [],
          },
        ],
        effectiveCandidateIds: [candidateId],
        readingStatus: "resolved",
        selectedReadingId: candidateId,
        selectionMethod: candidateId.includes("乘") || candidateId.includes("空") || candidateId.includes("不") || candidateId.includes("汉") || candidateId.includes("乡") ? "user" : "unique",
        possibleTones: [tone as Tone],
        toneStatus: "resolved",
        tone: tone as Tone,
        reason: "13_J03 第二批批准读音（人工裁定）；固定正文",
        evidenceIds: [],
      };
      tokens.push(token);
      ids.push(token.tokenId);
      texts.push(text);
      offset += 1;
    }
    lines.push({ line, text: texts.join(""), tokenIds: ids });
  }
  return {
    originalText: lines.map((l) => l.text).join(""),
    inputHash: "a".repeat(64),
    lines,
    tokens,
    quality: "ok",
    notices: [],
    book: "pingshui",
  };
}

function bestQilv(poem: AnnotatedPoem): string {
  const candidates = matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" });
  const qilv = candidates.filter((candidate) => String(candidate.formId).startsWith("qilv"));
  if (qilv.length === 0) throw new Error("未得到七律候选；输入或模板表异常");
  return [...qilv].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]!.id;
}

function analyze(poem: AnnotatedPoem, selectedTemplateId: string) {
  return evaluateProsody({
    poem,
    candidates: matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" }),
    selectedTemplateId,
    applicability: "applicable",
    ruleSet: "teaching-v1",
  });
}

const tailIds = (check: { locations: ReadonlyArray<{ tokenId: string }> }) =>
  check.locations.map((location) => location.tokenId).join(",");

describe("D3 已审特例：黄鹤楼三平尾（C01/C04/C08/C09/C10）", () => {
  it("[RED] C01 已审黄鹤楼 l4c5–7=PPP：应为 not_applicable/info 并保留七律身份", () => {
    const poem = buildHuanghelou();
    const templateId = bestQilv(poem);
    const report = analyze(poem, templateId);

    expect(report.selectedTemplateId).toBe(templateId);
    expect(report.selectedTemplateId!.startsWith("qilv")).toBe(true);

    const sanping = report.checks.find(
      (check) => check.ruleId === "TAIL.SANPING" && tailIds(check) === "l4c5,l4c6,l4c7",
    );
    expect(sanping, "黄鹤楼第四句应有三平尾检查项").toBeDefined();
    // 固定正文 + 已审读音下，观测必须是 PPP（「空」仍取平）
    expect(sanping!.observed).toEqual(["P", "P", "P"]);

    // 已审特例的目标形态：不是 pass、不是拗救，而是 not_applicable/info
    expect(sanping!.status).toBe("not_applicable");
    expect(sanping!.severity).toBe("info");
    expect(sanping!.resolvedBy).toBeNull();
  });

  it("C04a 普通五绝合成 PPP 尾：仍 fail/error（数据为合成 fixture，不混真实审批）", () => {
    const poem = makeCodePoem(["ZZPPZ", "PPZZP", "PPPZZ", "ZZPPP"]);
    const report = evaluateProsody({
      poem,
      candidates: matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" }),
      selectedTemplateId: "wujue-ze-unrhymed",
      applicability: "applicable",
      ruleSet: "teaching-v1",
    });
    const sanping = report.checks.find(
      (check) => check.ruleId === "TAIL.SANPING" && tailIds(check).includes("l4c5"),
    )!;
    expect(sanping.status).toBe("fail");
    expect(sanping.severity).toBe("error");
  });

  it("C04b 普通七律合成 PPP 尾：仍 fail/error", () => {
    const poem = makeCodePoem([
      "ZZPPPZZ",
      "PPZZZPP",
      "PPZZPPZ",
      "ZZPPPPP",
      "ZZPPPZZ",
      "PPZZZPP",
      "PPZZPPZ",
      "ZZPPPZP",
    ]);
    const report = evaluateProsody({
      poem,
      candidates: matchTemplates({ poem, formHint: "auto", ruleSet: "teaching-v1" }),
      selectedTemplateId: "qilv-ze-unrhymed",
      applicability: "applicable",
      ruleSet: "teaching-v1",
    });
    const sanping = report.checks.find(
      (check) => check.ruleId === "TAIL.SANPING" && tailIds(check) === "l4c5,l4c6,l4c7",
    )!;
    expect(sanping.status).toBe("fail");
    expect(sanping.severity).toBe("error");
  });

  it("C08 同诗其他字位真实偏离仍保留（不因特例清空报告）", () => {
    const poem = buildHuanghelou();
    const templateId = bestQilv(poem);
    const report = analyze(poem, templateId);
    const hardFails = report.checks.filter(
      (check) =>
        check.status === "fail" &&
        check.severity === "error" &&
        !tailIds(check).includes("l4c5,l4c6,l4c7"),
    );
    expect(report.selectedTemplateId).toBe(templateId);
    expect(hardFails.length).toBeGreaterThan(0);
  });

  it("C09 重复运行稳定：同一输入两次输出一致", () => {
    const poem = buildHuanghelou();
    const templateId = bestQilv(poem);
    const first = JSON.stringify(analyze(poem, templateId));
    const second = JSON.stringify(analyze(poem, templateId));
    expect(second).toBe(first);
  });

  it("C10 引用闭合：location/rule 可解析，resolvedBy 不伪填 RESCUE", () => {
    const poem = buildHuanghelou();
    const templateId = bestQilv(poem);
    const report = analyze(poem, templateId);

    expect(checkReportClosure(report, poem).ok).toBe(true);
    for (const check of report.checks) {
      expect(FROZEN_RULE_IDS).toContain(check.ruleId);
      expect(check.ruleVersion).toBe("1");
      if (check.resolvedBy !== null) {
        expect(["RESCUE.SELF", "RESCUE.TEAO", "RESCUE.DUIJU"]).toContain(check.resolvedBy);
      }
    }
  });

  // 以下各项依赖 Codex 的 reviewed-exceptions 接口（输入形状未交前不从实现反推）：
  it.todo("C02 仅改标点/换行（汉字序列相同）：指纹语义复用，仍定位正确");
  it.todo("C03 正文实质改一字 / 仅同题名或标签：不命中特例，不凭标签免责");
  it.todo("C05 同诗换词林/新韵且无对应批准：不套用平水特例");
  it.todo("C06 缺审批/unverified/来源断链/指纹不符：特例不生效，不产生假绿灯");
  it.todo("C07 选音不确定或用户覆盖改变有效音：不硬套特例，不改读音满足规则");
});
