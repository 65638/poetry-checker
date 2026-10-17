/**
 * 来源快照下载器（下载与导入分开：本脚本只下载字节，不改写、不解析、不执行上游脚本）。
 *
 * 用法（在仓库根目录）：
 *   node scripts/data/fetch-sources.ts            # 下载到 data/raw/
 *   node scripts/data/fetch-sources.ts --check    # 只比对摘要，不写入
 *
 * 约定：
 * - 每个来源固定不可变引用（git 提交或标签），不使用浮动分支。
 * - 下载后计算 SHA-256，与 data/sources/manifest.json 登记的 snapshotSha256 比对；
 *   不一致即报错退出，避免“静默替换”。
 * - 本机到 github.com / raw.githubusercontent.com 的 TLS 链被中间人替换（直连校验失败），
 *   因此经 jsdelivr CDN（证书链有效）取同一提交/标签的同一文件；实际使用的 URL 写在
 *   data/sources/manifest.json 与 docs/data-provenance.md 中，不隐藏这一点。
 *
 * 不联网以外的副作用：不执行上游 crawler/*.py、Makefile；只取静态数据文件与许可文本。
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CDN = "https://cdn.jsdelivr.net";
const USER_AGENT =
  "poetry-checker-d1-data-engineering/0.1 (+source snapshot, read-only)";

/** 固定的不可变引用；改 pin 必须同时更新 manifest 与 docs/data-provenance.md。 */
const PINS = {
  cwr: {
    repo: "charlesix59/chinese_word_rhyme",
    rev: "ff0e9c13fb037c43e0eaa5dc929c0fe4fa2ffb18",
  },
  pinyinData: {
    repo: "mozillazg/pinyin-data",
    tag: "v0.15.0",
  },
} as const;

interface FetchEntry {
  file: string;
  url: string;
  upstream: string;
}

const FETCH_PLAN: readonly FetchEntry[] = [
  {
    file: "data/raw/chinese_word_rhyme/Pingshui_Rhyme.json",
    url: `${CDN}/gh/${PINS.cwr.repo}@${PINS.cwr.rev}/data/Pingshui_Rhyme.json`,
    upstream: `https://raw.githubusercontent.com/${PINS.cwr.repo}/${PINS.cwr.rev}/data/Pingshui_Rhyme.json`,
  },
  {
    file: "data/raw/chinese_word_rhyme/Cilin_Rhyme.json",
    url: `${CDN}/gh/${PINS.cwr.repo}@${PINS.cwr.rev}/data/Cilin_Rhyme.json`,
    upstream: `https://raw.githubusercontent.com/${PINS.cwr.repo}/${PINS.cwr.rev}/data/Cilin_Rhyme.json`,
  },
  {
    file: "data/raw/chinese_word_rhyme/Xinyun_Rhyme.json",
    url: `${CDN}/gh/${PINS.cwr.repo}@${PINS.cwr.rev}/data/Xinyun_Rhyme.json`,
    upstream: `https://raw.githubusercontent.com/${PINS.cwr.repo}/${PINS.cwr.rev}/data/Xinyun_Rhyme.json`,
  },
  {
    file: "data/raw/chinese_word_rhyme/Xinyun_Rhyme_FourRhyme_Edition.json",
    url: `${CDN}/gh/${PINS.cwr.repo}@${PINS.cwr.rev}/data/Xinyun_Rhyme_FourRhyme_Edition.json`,
    upstream: `https://raw.githubusercontent.com/${PINS.cwr.repo}/${PINS.cwr.rev}/data/Xinyun_Rhyme_FourRhyme_Edition.json`,
  },
  {
    file: "data/raw/chinese_word_rhyme/LICENSE",
    url: `${CDN}/gh/${PINS.cwr.repo}@${PINS.cwr.rev}/LICENSE`,
    upstream: `https://raw.githubusercontent.com/${PINS.cwr.repo}/${PINS.cwr.rev}/LICENSE`,
  },
  {
    file: "data/raw/chinese_word_rhyme/README.md",
    url: `${CDN}/gh/${PINS.cwr.repo}@${PINS.cwr.rev}/README.md`,
    upstream: `https://raw.githubusercontent.com/${PINS.cwr.repo}/${PINS.cwr.rev}/README.md`,
  },
  {
    file: "data/raw/pinyin-data/pinyin.txt",
    url: `${CDN}/gh/${PINS.pinyinData.repo}@${PINS.pinyinData.tag}/pinyin.txt`,
    upstream: `https://raw.githubusercontent.com/${PINS.pinyinData.repo}/${PINS.pinyinData.tag}/pinyin.txt`,
  },
  {
    file: "data/raw/pinyin-data/LICENSE",
    url: `${CDN}/gh/${PINS.pinyinData.repo}@${PINS.pinyinData.tag}/LICENSE`,
    upstream: `https://raw.githubusercontent.com/${PINS.pinyinData.repo}/${PINS.pinyinData.tag}/LICENSE`,
  },
];

const MANIFEST = "data/sources/manifest.json";

interface ManifestFile {
  path: string;
  snapshotSha256?: string | null;
}

interface ManifestSource {
  files?: ManifestFile[];
}

interface Manifest {
  sources?: ManifestSource[];
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function expectedHashes(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!existsSync(MANIFEST)) return map;
  const raw = JSON.parse(await readFile(MANIFEST, "utf8")) as Manifest;
  for (const source of raw.sources ?? []) {
    for (const file of source.files ?? []) {
      if (typeof file.snapshotSha256 === "string") {
        map.set(file.path, file.snapshotSha256);
      }
    }
  }
  return map;
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  const expected = await expectedHashes();
  let matched = 0;
  let created = 0;
  let mismatched = 0;
  let count = 0;

  for (const entry of FETCH_PLAN) {
    const response = await fetch(entry.url, {
      headers: { "user-agent": USER_AGENT, "accept-encoding": "identity" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`${entry.file}: HTTP ${response.status} ${entry.url}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = sha256(bytes);
    const want = expected.get(entry.file);
    const status =
      want === undefined ? "new" : want === digest ? "match" : "MISMATCH";

    count += 1;
    if (status === "match") matched += 1;
    if (status === "new") created += 1;
    if (status === "MISMATCH") mismatched += 1;

    if (!checkOnly && status !== "match") {
      const target = path.resolve(entry.file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    console.log(
      `${status.padEnd(8)} ${String(bytes.length).padStart(8)}  ${digest}  ${entry.file}`,
    );
  }

  console.log(
    `\n${count} 个来源文件；${matched} 与 manifest 摘要一致；${created} 为首次登记；${mismatched} 个不一致。`,
  );
  if (mismatched > 0) {
    console.error("摘要不一致：疑似上游内容变动或传输被替换，拒绝写入。");
    process.exitCode = 1;
  }
  if (checkOnly && created > 0) {
    console.error("存在未登记摘要的文件：请先补 manifest，再执行 --check。");
    process.exitCode = 1;
  }
}

await main();
