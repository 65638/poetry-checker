import { describe, expect, it } from "vitest";
import type { LibraryWork } from "@poetry/contracts";
import {
  applyLocalRestore,
  FAVORITE_POEMS_KEY,
  makeLocalBackup,
  parseLocalBackup,
  planLocalRestore,
  type BackupPort,
} from "../src/app/localBackup";
import { DRAFT_KEY, EMPTY_DRAFT } from "../src/app/draftPersistence";
import { NOTEBOOK_KEY } from "../src/app/notebook";
import { SHELF_KEY } from "../src/app/dictionaryShelf";
import { READING_JOURNAL_KEY } from "../src/app/readingJournal";
import {
  EXCERPTS_KEY,
  addExcerpt,
  excerptArchive,
  parseExcerpts,
} from "../src/app/excerpts";
const work: LibraryWork = {
  id: "mine",
  title: "测试自存稿",
  author: "我",
  dynasty: "",
  paragraphs: ["月落山空夜未央。"],
  source: "本机写作",
  sourceUrl: null,
  tags: [],
};
const draft = { ...EMPTY_DRAFT, text: "春风又绿江南岸。" };
const entry = {
  id: "note1",
  at: "2026-10-23T01:00:00Z",
  before: draft,
  after: draft,
  note: "存稿",
};
const options = { draft: false, preferences: false };
function memory(
  initial: Record<string, string> = {},
  initialWorks: LibraryWork[] = [],
) {
  const local = new Map(Object.entries(initial));
  let works = structuredClone(initialWorks);
  const port: BackupPort = {
    storage: {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => {
        local.set(key, value);
      },
      removeItem: (key) => {
        local.delete(key);
      },
    },
    readWorks: async () => structuredClone(works),
    writeWorks: async (value) => {
      works = structuredClone(value);
    },
  };
  return { local, port };
}
describe("portable local backups", () => {
  it("roundtrips excerpts with notes and merges repeated restores without duplication", async () => {
    const saved = addExcerpt([], work, 0, "excerpt-one").map((e) => ({
      ...e,
      note: "带到新电脑的感想",
    }));
    const source = memory({
      [EXCERPTS_KEY]: JSON.stringify(excerptArchive(saved)),
    });
    const target = memory();
    const incoming = await parseLocalBackup(
      JSON.stringify(await makeLocalBackup(source.port)),
    );
    const plan = await planLocalRestore(target.port, incoming, options);
    expect(plan.added.excerpts).toBe(1);
    await applyLocalRestore(target.port, plan);
    expect(parseExcerpts(target.local.get(EXCERPTS_KEY)!)).toEqual(saved);
    expect(
      (await planLocalRestore(target.port, incoming, options)).added.excerpts,
    ).toBe(0);
    const conflict = memory({
      [EXCERPTS_KEY]: JSON.stringify(
        excerptArchive(saved.map((e) => ({ ...e, note: "另一份笔记" }))),
      ),
    });
    await expect(
      planLocalRestore(conflict.port, incoming, options),
    ).rejects.toThrow("笔记或内容不同");
    expect(parseExcerpts(conflict.local.get(EXCERPTS_KEY)!)[0]?.note).toBe(
      "另一份笔记",
    );
  });
  it("exports only known app records and preserves imported work IDs", async () => {
    const { port } = memory(
      {
        [DRAFT_KEY]: JSON.stringify(draft),
        [NOTEBOOK_KEY]: JSON.stringify({ version: 1, entries: [entry] }),
        DEEPSEEK_API_KEY: "must-not-export",
      },
      [work],
    );
    const backup = await makeLocalBackup(port);
    const raw = JSON.stringify(backup);
    expect(raw).not.toContain("must-not-export");
    const parsed = await parseLocalBackup(raw);
    expect(parsed.works[0]).toEqual(work);
    expect(parsed.local[DRAFT_KEY]).toBe(JSON.stringify(draft));
  });
  it("exports the current input even before the delayed draft save", async () => {
    const { port } = memory({ [DRAFT_KEY]: JSON.stringify(EMPTY_DRAFT) });
    expect((await makeLocalBackup(port, draft)).local[DRAFT_KEY]).toBe(
      JSON.stringify(draft),
    );
    expect(port.storage.getItem(DRAFT_KEY)).toBe(JSON.stringify(EMPTY_DRAFT));
  });
  it("rejects damaged and unknown-format files before restoration", async () => {
    const { port } = memory({}, [work]);
    const backup = await makeLocalBackup(port);
    await expect(
      parseLocalBackup(
        JSON.stringify({ ...backup, createdAt: "2025-01-01T00:00:00Z" }),
      ),
    ).rejects.toThrow("备份校验不符");
    await expect(parseLocalBackup("{")).rejects.toThrow("无法读取");
    await expect(
      parseLocalBackup(
        JSON.stringify({ ...backup, local: { API_KEY: "bad" } }),
      ),
    ).rejects.toThrow("无法读取");
    await expect(
      parseLocalBackup(JSON.stringify({ ...backup, version: 2 })),
    ).rejects.toThrow("无法读取");
  });
  it("merges rather than replacing notes, poem favorites, and dictionary favorites", async () => {
    const source = memory(
      {
        [NOTEBOOK_KEY]: JSON.stringify({ version: 1, entries: [entry] }),
        [FAVORITE_POEMS_KEY]: JSON.stringify(["mine"]),
        [SHELF_KEY]: JSON.stringify({
          favorites: [{ character: "月", book: "pingshui" }],
          recent: [],
        }),
      },
      [work],
    );
    const target = memory({
      [NOTEBOOK_KEY]: JSON.stringify({
        version: 1,
        entries: [{ ...entry, id: "note2", note: "已有记录" }],
      }),
      [FAVORITE_POEMS_KEY]: JSON.stringify(["existing"]),
      [SHELF_KEY]: JSON.stringify({
        favorites: [{ character: "山", book: "pingshui" }],
        recent: [],
      }),
    });
    const plan = await planLocalRestore(
      target.port,
      await makeLocalBackup(source.port),
      options,
    );
    expect(plan.added).toEqual({
      works: 1,
      notes: 1,
      favorites: 1,
      characters: 1,
      excerpts: 0,
    });
    expect(target.local.get(FAVORITE_POEMS_KEY)).toBe('["existing"]');
    await applyLocalRestore(target.port, plan);
    expect(JSON.parse(target.local.get(FAVORITE_POEMS_KEY)!)).toEqual([
      "existing",
      "mine",
    ]);
    expect((await target.port.readWorks())[0]?.id).toBe("mine");
    const repeated = await planLocalRestore(
      target.port,
      await makeLocalBackup(source.port),
      options,
    );
    expect(repeated.added).toEqual({
      works: 0,
      notes: 0,
      favorites: 0,
      characters: 0,
      excerpts: 0,
    });
  });
  it("keeps the draft/preferences unless explicitly selected", async () => {
    const source = memory({
      [DRAFT_KEY]: JSON.stringify(draft),
      "poetry-reading-size": "2",
    });
    const target = memory({
      [DRAFT_KEY]: JSON.stringify(EMPTY_DRAFT),
      "poetry-reading-size": "0",
    });
    const incoming = await makeLocalBackup(source.port);
    const keep = await planLocalRestore(target.port, incoming, options);
    expect(keep.draft).toBeUndefined();
    expect(keep.after.local[DRAFT_KEY]).toBe(JSON.stringify(EMPTY_DRAFT));
    expect(keep.after.local["poetry-reading-size"]).toBe("0");
    const restore = await planLocalRestore(target.port, incoming, {
      draft: true,
      preferences: true,
    });
    expect(restore.draft).toEqual(draft);
    expect(restore.after.local["poetry-reading-size"]).toBe("2");
  });
  it("rejects conflicting IDs instead of overwriting versions", async () => {
    const source = memory(
      { [NOTEBOOK_KEY]: JSON.stringify({ version: 1, entries: [entry] }) },
      [work],
    );
    const backup = await makeLocalBackup(source.port);
    const target = memory({}, [{ ...work, title: "另一版" }]);
    await expect(
      planLocalRestore(target.port, backup, options),
    ).rejects.toThrow("相同编号");
    const targetNotes = memory({
      [NOTEBOOK_KEY]: JSON.stringify({
        version: 1,
        entries: [{ ...entry, note: "另一笺" }],
      }),
    });
    await expect(
      planLocalRestore(targetNotes.port, backup, options),
    ).rejects.toThrow("编号相同");
  });
  it("refuses a merge exceeding the notebook limit", async () => {
    const source = memory({
      [NOTEBOOK_KEY]: JSON.stringify({ version: 1, entries: [entry] }),
    });
    const target = memory({
      [NOTEBOOK_KEY]: JSON.stringify({
        version: 1,
        entries: Array.from({ length: 80 }, (_, i) => ({
          ...entry,
          id: `old-${i}`,
        })),
      }),
    });
    await expect(
      planLocalRestore(
        target.port,
        await makeLocalBackup(source.port),
        options,
      ),
    ).rejects.toThrow("超过80笺");
  });
  it("combines history by recency and retains distinct edition IDs", async () => {
    const source = memory({
      [READING_JOURNAL_KEY]: JSON.stringify([
        { id: "a", at: "2026-10-23T02:00:00Z" },
      ]),
    });
    const target = memory({
      [READING_JOURNAL_KEY]: JSON.stringify([
        { id: "b", at: "2026-10-23T03:00:00Z" },
        { id: "a", at: "2026-10-23T01:00:00Z" },
      ]),
    });
    const plan = await planLocalRestore(
      target.port,
      await makeLocalBackup(source.port),
      options,
    );
    expect(JSON.parse(plan.after.local[READING_JOURNAL_KEY]!)).toEqual([
      { id: "b", at: "2026-10-23T03:00:00Z" },
      { id: "a", at: "2026-10-23T02:00:00Z" },
    ]);
  });
  it("rejects a stale preview when data changes in another tab", async () => {
    const source = memory({ [FAVORITE_POEMS_KEY]: '["incoming"]' });
    const target = memory();
    const plan = await planLocalRestore(
      target.port,
      await makeLocalBackup(source.port),
      options,
    );
    target.local.set(FAVORITE_POEMS_KEY, '["newer"]');
    await expect(applyLocalRestore(target.port, plan)).rejects.toThrow(
      "预览后发生了变化",
    );
    expect(target.local.get(FAVORITE_POEMS_KEY)).toBe('["newer"]');
  });
  it("rolls local records back when the corpus transaction fails", async () => {
    const source = memory({ [FAVORITE_POEMS_KEY]: '["incoming"]' }, [work]);
    const target = memory({ [FAVORITE_POEMS_KEY]: '["old"]' });
    const plan = await planLocalRestore(
      target.port,
      await makeLocalBackup(source.port),
      options,
    );
    target.port.writeWorks = async () => {
      throw new Error("IDB quota");
    };
    await expect(applyLocalRestore(target.port, plan)).rejects.toThrow(
      "已回退本次写入",
    );
    expect(target.local.get(FAVORITE_POEMS_KEY)).toBe('["old"]');
    expect(await target.port.readWorks()).toEqual([]);
  });
  it("rolls back earlier local writes when storage quota is reached", async () => {
    const source = memory({
      [DRAFT_KEY]: JSON.stringify(draft),
      [FAVORITE_POEMS_KEY]: '["incoming"]',
    });
    const target = memory({ [DRAFT_KEY]: JSON.stringify(EMPTY_DRAFT) });
    const plan = await planLocalRestore(
      target.port,
      await makeLocalBackup(source.port),
      { draft: true, preferences: false },
    );
    const originalSet = target.port.storage.setItem;
    target.port.storage.setItem = (key, value) => {
      if (key === FAVORITE_POEMS_KEY) throw new Error("quota");
      originalSet(key, value);
    };
    await expect(applyLocalRestore(target.port, plan)).rejects.toThrow(
      "已回退本次写入",
    );
    expect(target.local.get(DRAFT_KEY)).toBe(JSON.stringify(EMPTY_DRAFT));
  });
  it("does not overwrite a concurrent change while rolling back", async () => {
    const source = memory({ [FAVORITE_POEMS_KEY]: '["incoming"]' }, [work]);
    const target = memory();
    const plan = await planLocalRestore(
      target.port,
      await makeLocalBackup(source.port),
      options,
    );
    target.port.writeWorks = async () => {
      target.local.set(FAVORITE_POEMS_KEY, '["another-tab"]');
      throw new Error("IDB failed");
    };
    await expect(applyLocalRestore(target.port, plan)).rejects.toThrow(
      "已回退",
    );
    expect(target.local.get(FAVORITE_POEMS_KEY)).toBe('["another-tab"]');
  });
});
