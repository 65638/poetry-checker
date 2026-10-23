import type { LibraryWork } from "@poetry/contracts";

// Retrieval clues only: a shared word does not certify a poem's subject or interpretation.
const WORDS = [
  "故乡",
  "故鄉",
  "故园",
  "故園",
  "乡关",
  "鄉關",
  "归来",
  "歸來",
  "相思",
  "故人",
  "送别",
  "送別",
  "明月",
  "月",
  "夜",
  "灯",
  "燈",
  "星",
  "日",
  "夕阳",
  "夕陽",
  "落日",
  "暮",
  "朝",
  "春风",
  "春風",
  "秋风",
  "秋風",
  "春",
  "秋",
  "雪",
  "霜",
  "雨",
  "风",
  "風",
  "江",
  "河",
  "海",
  "水",
  "波",
  "舟",
  "船",
  "帆",
  "山",
  "林",
  "松",
  "竹",
  "溪",
  "泉",
  "云",
  "雲",
  "梅",
  "柳",
  "桃",
  "花",
  "草",
  "莲",
  "蓮",
  "荷",
  "菊",
  "雁",
  "燕",
  "鸟",
  "鳥",
  "蝉",
  "蟬",
  "酒",
  "笛",
  "琴",
  "歌",
  "梦",
  "夢",
  "愁",
  "泪",
  "淚",
  "客",
  "孤",
  "独",
  "獨",
  "关山",
  "關山",
  "边塞",
  "邊塞",
  "烽火",
  "沙场",
  "沙場",
  "城",
  "马",
  "馬",
];
const normalizedBody = (work: LibraryWork) =>
  work.paragraphs.join("").replace(/[\p{P}\p{Z}\s]/gu, "");
interface IndexedWork {
  words: Set<string>;
  body: string;
  sentences: string[];
}
const documents = new WeakMap<LibraryWork, IndexedWork>();
function documentFor(work: LibraryWork): IndexedWork {
  const cached = documents.get(work);
  if (cached) return cached;
  const text = work.paragraphs.join("\n");
  const doc = {
    words: new Set(WORDS.filter((word) => text.includes(word))),
    body: normalizedBody(work),
    sentences: work.paragraphs.flatMap(
      (paragraph) => paragraph.match(/[^。！？\n]+[。！？]?/gu) ?? [paragraph],
    ),
  };
  documents.set(work, doc);
  return doc;
}
const knownAuthor = (author: string) =>
  !!author.trim() &&
  !/佚名|无名|無名|不详|不詳|未知|未载|未載/u.test(author.trim());
export interface RelatedReading {
  work: LibraryWork;
  excerpt: string;
  terms: string[];
  sameAuthor: boolean;
  score: number;
}
export function relatedReadings(
  selected: LibraryWork,
  works: LibraryWork[],
  mode: "words" | "author",
  favorites?: ReadonlySet<string>,
): RelatedReading[] {
  const source = documentFor(selected);
  const candidates = works.filter(
    (work) =>
      work.id !== selected.id &&
      work.kind !== "prose" &&
      (!favorites || favorites.has(work.id)),
  );
  const frequencies = new Map<string, number>();
  for (const work of candidates)
    for (const word of documentFor(work).words)
      frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  const seen = new Set([source.body]);
  return candidates
    .flatMap((work) => {
      const doc = documentFor(work);
      if (!doc.body || seen.has(doc.body)) return [];
      const sameAuthor =
        knownAuthor(selected.author) &&
        work.author.trim() === selected.author.trim() &&
        (!selected.dynasty ||
          !work.dynasty ||
          work.dynasty === selected.dynasty);
      const terms = [...source.words].filter((word) => doc.words.has(word));
      if (mode === "author" ? !sameAuthor : !terms.length) return [];
      seen.add(doc.body);
      const weight = (word: string) =>
        (word.length * word.length) / Math.sqrt(frequencies.get(word) ?? 1);
      terms.sort(
        (a, b) => weight(b) - weight(a) || a.localeCompare(b, "zh-CN"),
      );
      const independent = terms.filter(
        (word) =>
          !terms.some((other) => other !== word && other.includes(word)),
      );
      const score =
        independent.reduce((sum, word) => sum + weight(word), 0) +
        (sameAuthor ? 0.01 : 0);
      const lines = doc.sentences.map((excerpt, index) => ({
        excerpt,
        index,
        score: independent.reduce(
          (sum, word) => sum + (excerpt.includes(word) ? weight(word) : 0),
          0,
        ),
      }));
      lines.sort((a, b) => b.score - a.score || a.index - b.index);
      return [
        {
          work,
          excerpt: lines[0]?.excerpt ?? work.paragraphs[0] ?? "",
          terms: independent.slice(0, 4),
          sameAuthor,
          score,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.work.title.localeCompare(b.work.title, "zh-CN") ||
        a.work.id.localeCompare(b.work.id),
    )
    .slice(0, 24);
}
