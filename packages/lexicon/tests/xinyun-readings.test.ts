import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assignYun, deserializeSnapshot, parsePinyin } from "../src/index.js";

const bytes = (rel: string) =>
  readFileSync(new URL(`../../../${rel}`, import.meta.url));
const json = (rel: string) => JSON.parse(bytes(rel).toString("utf8"));
const old = deserializeSnapshot(json("data/normalized/xinyun.full-d2.json"));
const current = deserializeSnapshot(
  json("data/normalized/xinyun.full-readings-v2.json"),
);
const hash = (rel: string) =>
  createHash("sha256").update(bytes(rel)).digest("hex");

describe("新韵同部多读音完整性", () => {
  it("preserves yu2, xu2, tu2 and yu4 as separate candidates for 余", () => {
    expect(
      current.candidates
        .filter((c) => c.character === "余")
        .map((c) => `${c.modernReading!.pinyin}${c.modernReading!.toneNumber}`)
        .sort(),
    ).toEqual(["tu2", "xu2", "yu2", "yu4"]);
    expect(
      current.candidates.find(
        (c) => c.id === "xinyun:余:yangping:十二齐·阳平:yu2",
      )?.modernReading,
    ).toMatchObject({ pinyin: "yu", toneNumber: 2 });
  });
  it("retains every mapped, non-neutral source reading, including same-group competitors", () => {
    const expected = new Set<string>();
    for (const line of bytes("data/raw/pinyin-data/pinyin.txt")
      .toString("utf8")
      .split(/\r?\n/u)) {
      const row = /^U\+([0-9A-Fa-f]+):\s*([^#]+)/u.exec(line);
      if (!row) continue;
      const character = String.fromCodePoint(Number.parseInt(row[1]!, 16));
      for (const raw of row[2]!.split(",")) {
        const parsed = parsePinyin(raw.normalize("NFC"));
        if (!parsed.ok) continue;
        const assignment = assignYun(parsed.syllable);
        if (!assignment.ok || assignment.assignment.toneClass === "neutral")
          continue;
        const s = parsed.syllable;
        expected.add(`${character}:${s.initial}:${s.final}:${s.toneNumber}`);
      }
    }
    const actual = new Set(
      current.candidates.map((c) => {
        const parsed = parsePinyin(c.modernReading!.pinyin);
        if (!parsed.ok) throw new Error(c.id);
        return `${c.character}:${parsed.syllable.initial}:${parsed.syllable.final}:${c.modernReading!.toneNumber}`;
      }),
    );
    expect(actual).toEqual(expected);
    expect(current.candidates).toHaveLength(actual.size);
  });
  it("preserves all legacy identities and records actual bytes and additions in the migration", () => {
    const byId = new Map(current.candidates.map((c) => [c.id, c]));
    for (const c of old.candidates) expect(byId.get(c.id)).toEqual(c);
    const record = json("data/reviews/xinyun-readings-v2.json");
    expect(record.before.sha256).toBe(hash(record.before.path));
    expect(record.after.sha256).toBe(hash(record.after.path));
    expect(record.source.sha256).toBe(hash(record.source.path));
    expect(record.after.dataVersion).toBe(current.dataVersion);
    const legacyIds = new Set(old.candidates.map((c) => c.id));
    expect(record.addedCandidateIds).toEqual(
      current.candidates.filter((c) => !legacyIds.has(c.id)).map((c) => c.id),
    );
    expect(record.removedCandidateIds).toEqual([]);
    expect(record.collisionGroups).toBe(1508);
    expect(current.groups).toEqual(old.groups);
    expect(current.evidence).toEqual(old.evidence);
    expect(current.sources).toEqual(old.sources);
    expect(current.reviewStatus).toBe("unverified");
  });
});
