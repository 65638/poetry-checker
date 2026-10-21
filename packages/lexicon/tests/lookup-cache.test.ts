import { describe, expect, it } from "vitest";
import { defineSnapshot, lookupInSnapshot } from "../src/index.js";
import { pingshuiFixture } from "./fixtures.js";

describe("cached lookup preserves snapshot isolation", () => {
  it("returned data can be edited without poisoning a later query or promoting unverified evidence", () => {
    const snapshot = defineSnapshot(pingshuiFixture());
    const request = {
      characters: ["更"],
      rhymeBook: snapshot.book,
      dataVersion: snapshot.dataVersion,
    };
    const first = lookupInSnapshot(snapshot, request);
    expect(() => {
      first.entries[0]!.candidates[0]!.character = "错";
    }).toThrow(TypeError);
    expect(() => {
      first.evidence[0]!.reviewStatus = "approved";
    }).toThrow(TypeError);
    first.entries[0]!.candidates.length = 0;
    first.evidence.length = 0;
    const second = lookupInSnapshot(snapshot, request);
    expect(
      second.entries[0]!.candidates.every((c) => c.character === "更"),
    ).toBe(true);
    expect(second.evidence.every((e) => e.reviewStatus === "unverified")).toBe(
      true,
    );
    expect(second.entries[0]!.candidates).toHaveLength(2);
  });
  it("independent snapshots with the same version never share cached content", () => {
    const one = pingshuiFixture();
    const two = pingshuiFixture();
    two.candidates = two.candidates.filter((c) => c.character !== "更");
    const a = defineSnapshot(one),
      b = defineSnapshot(two);
    const request = {
      characters: ["更"],
      rhymeBook: a.book,
      dataVersion: a.dataVersion,
    };
    expect(lookupInSnapshot(a, request).entries[0]?.candidates).toHaveLength(2);
    expect(lookupInSnapshot(b, request).missing).toEqual(["更"]);
  });
  it("mutable caller snapshots are re-read rather than cached", () => {
    const snapshot = { ...pingshuiFixture() };
    const request = {
      characters: ["更"],
      rhymeBook: snapshot.book,
      dataVersion: snapshot.dataVersion,
    };
    expect(
      lookupInSnapshot(snapshot, request).entries[0]?.candidates,
    ).toHaveLength(2);
    snapshot.candidates = snapshot.candidates.filter(
      (c) => c.character !== "更",
    );
    expect(lookupInSnapshot(snapshot, request).missing).toEqual(["更"]);
  });
  it("does not trust shallow-frozen inputs whose record keys can still change", () => {
    const input = pingshuiFixture();
    const snapshot = Object.freeze({
      ...input,
      candidates: Object.freeze([...input.candidates]),
      groups: Object.freeze([...input.groups]),
      evidence: Object.freeze([...input.evidence]),
      sources: Object.freeze([...input.sources]),
    });
    const request = {
      characters: ["更"],
      rhymeBook: snapshot.book,
      dataVersion: snapshot.dataVersion,
    };
    expect(
      lookupInSnapshot(snapshot, request).entries[0]?.candidates,
    ).toHaveLength(2);
    for (const candidate of snapshot.candidates)
      if (candidate.character === "更") candidate.character = "错";
    expect(lookupInSnapshot(snapshot, request).missing).toEqual(["更"]);
  });
});
