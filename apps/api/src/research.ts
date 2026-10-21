import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";
import {
  ResearchDatasetSchema,
  ResearchRequestSchema,
  ResearchResponseSchema,
  type ResearchDataset,
  type ResearchResponse,
} from "@poetry/contracts";
import { relatedCharacterGlyphs } from "./library.js";
import { corpusResearch } from "./corpus-research.js";

const han = (text: string) =>
  [...text].filter((c) => /\p{Script=Han}/u.test(c));
const notice =
  "注音与版本资料仅供参考；字形关联不等于同一底本，来源分歧保留。现代读音不直接决定古音与韵部。";
let dataset: ResearchDataset | undefined;
function load() {
  if (dataset) return dataset;
  const bytes = readFileSync(
    new URL(
      "../../../data/research/collected-v1/reference.json.gz",
      import.meta.url,
    ),
  );
  const audit = JSON.parse(
    readFileSync(
      new URL(
        "../../../data/research/collected-v1/audit.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { compiledSha256: string };
  if (createHash("sha256").update(bytes).digest("hex") !== audit.compiledSha256)
    throw new Error("Research snapshot checksum mismatch");
  dataset = ResearchDatasetSchema.parse(
    JSON.parse(gunzipSync(bytes).toString("utf8")),
  );
  return dataset;
}

// Compare every Han position. Punctuation is ignored for retrieval only.
// Title, first-line, edit-distance and subset matches cannot bind evidence.
export function researchMatch(
  input: string,
  source: string,
): "exact" | "related_glyphs" | null {
  const a = han(input),
    b = han(source);
  if (!a.length || a.length !== b.length) return null;
  if (a.every((c, i) => c === b[i])) return "exact";
  try {
    return a.every(
      (c, i) =>
        c === b[i] ||
        relatedCharacterGlyphs(c).includes(b[i]!) ||
        relatedCharacterGlyphs(b[i]!).includes(c),
    )
      ? "related_glyphs"
      : null;
  } catch {
    return null;
  }
}

function containsRelatedExcerpt(body: string[], excerpt: string) {
  const chars = han(excerpt);
  if (!chars.length || chars.length > body.length) return false;
  const wanted = chars.join("");
  if (body.join("").includes(wanted)) return true;
  for (let i = 0; i <= body.length - chars.length; i++) {
    if (researchMatch(body.slice(i, i + chars.length).join(""), wanted))
      return true;
  }
  return false;
}

export function poemResearch(text: string): ResearchResponse {
  const inputHash = createHash("sha256").update(text).digest("hex");
  const base = { version: "collected-v1", inputHash, notice };
  const corpus = corpusResearch(text);
  try {
    const data = load();
    const readings = data.readings.flatMap((r) => {
      const match = researchMatch(text, r.text);
      return match ? [{ ...r, match }] : [];
    });
    const works = data.works.flatMap((w) => {
      const match = !w.compilation && researchMatch(text, w.text);
      return match ? [{ ...w, match }] : [];
    });
    // Source claims stay references, not executable exceptions or approvals.
    const general = new Set(["VR01", "VR07", "VR09", "VR10", "VR31"]);
    const knownTitles = [
      ...works.map((w) => w.title),
      ...readings.map((r) => r.title),
    ];
    const body = han(text);
    const rules = data.rules.filter(
      (r) =>
        general.has(r.id) ||
        r.examples.some(
          (e) =>
            researchMatch(text, e.text) ||
            (knownTitles.some((title) => researchMatch(title, e.title)) &&
              containsRelatedExcerpt(body, e.text)),
        ),
    );
    const used = new Set([
      ...readings.map((r) => r.sourceId),
      ...works.flatMap((w) => [
        ...w.sourceIds,
        ...w.notes.map((n) => n.sourceId),
        ...w.variants.map((v) => v.sourceId),
      ]),
      ...rules.flatMap((r) => [
        ...r.sourceIds,
        ...r.quotes.map((q) => q.sourceId),
      ]),
    ]);
    return ResearchResponseSchema.parse({
      ...base,
      state: "available",
      readings,
      works,
      rules,
      sources: [
        ...data.sources.filter((s) => used.has(s.id)),
        ...corpus.sources,
      ],
      corpus: corpus.works,
    });
  } catch {
    return {
      ...base,
      state: corpus.available ? "available" : "unavailable",
      readings: [],
      works: [],
      rules: [],
      sources: corpus.sources,
      corpus: corpus.works,
      notice: corpus.available
        ? notice
        : "补采参考暂不可用；基础查字与分析仍可使用。",
    };
  }
}

export function modelResearch(text: string, targetHanOffsets?: number[]) {
  const research = poemResearch(text);
  const targets = targetHanOffsets ? new Set(targetHanOffsets) : null;
  return {
    notice: research.notice,
    readings: research.readings,
    corpusReferences: research.corpus?.map((w) => ({
      title: w.title,
      author: w.author,
      textHash: w.textHash,
      binding:
        "full_han_sequence_only; hanOffset indexes source Han characters; no glyph conversion",
      coverage: w.coverage,
      omittedReadings:
        w.readings.length -
        (targets
          ? w.readings.filter((r) => targets.has(r.hanOffset)).length
          : Math.min(w.readings.length, 160)),
      readings: (targets
        ? w.readings.filter((r) => targets.has(r.hanOffset))
        : w.readings.slice(0, 160)
      ).map((r) => ({
        hanOffset: r.hanOffset,
        character: r.character,
        status: r.status,
        evidenceScope: r.evidenceScope,
        modernReading: r.modernReading,
        candidates: r.candidates.map((c) => ({
          modernReading: c.modernReading,
          historicalTone: c.historicalTone,
          rhymeGroup: c.rhymeGroup,
          evidenceScope: c.evidenceScope,
          sourceIds: c.sourceIds,
          quote: c.quote,
        })),
      })),
      notes: w.notes.slice(0, 40),
      omittedNotes: Math.max(0, w.notes.length - 40),
      limitations:
        "同站聚合注音不代表独立核验；来源体式摘录可能涉及他篇，不能直接判定当前诗体。分歧不裁决，缺失不猜。",
    })),
    versions: research.works.map(
      ({
        title,
        author,
        text,
        match,
        genre,
        notes,
        variants,
        status,
        limitations,
      }) => ({
        title,
        author,
        text,
        match,
        genre,
        notes,
        variants,
        status,
        limitations,
      }),
    ),
    rules: research.rules.map(
      ({
        id,
        claim,
        status,
        appliesTo,
        doesNotApplyTo,
        preconditions,
        disagreements,
      }) => ({
        id,
        claim,
        status,
        appliesTo,
        doesNotApplyTo,
        preconditions,
        disagreements,
      }),
    ),
    sources: research.sources.map(({ id, title, url }) => ({ id, title, url })),
  };
}

export function registerResearch(app: FastifyInstance) {
  app.post("/api/v1/research", async (request, reply) => {
    const parsed = ResearchRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(422).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请提供要查阅的诗文。",
          fieldErrors: [],
        },
      });
    return poemResearch(parsed.data.text);
  });
}
