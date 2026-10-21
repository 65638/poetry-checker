// Execute each real generator twice, serially. No approval or runtime version edits.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outputIndex = process.argv.indexOf("--output-dir");
const outputRelative =
  outputIndex < 0 ? "data/reviews/d4/a" : process.argv[outputIndex + 1];
assert(outputRelative, "--output-dir requires a value");
const out = path.resolve(root, outputRelative);
const allowed = path.resolve(root, "data/reviews/d4/a");
assert(
  out === allowed || out.startsWith(`${allowed}${path.sep}`),
  "output must stay in A's evidence directory",
);
const sha = (relative) =>
  createHash("sha256")
    .update(readFileSync(path.join(root, relative)))
    .digest("hex");
const files = [
  "data/normalized/pingshui.full-d2.json",
  "data/normalized/pingshui.full-d2-patched.json",
  "data/normalized/cilin.full-d2.json",
  "data/normalized/xinyun.full-d2.json",
  "data/patches/xinyun-reading-collisions.dev.json",
];
const hashes = () => Object.fromEntries(files.map((file) => [file, sha(file)]));
const record = {
  runSha: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  dirty:
    execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim().length > 0,
  startedAt: new Date().toISOString(),
  mode: "real-local-data-build",
  node: process.version,
  before: hashes(),
  rounds: [],
};
mkdirSync(path.join(out, "rebuild-logs"), { recursive: true });
for (let round = 1; round <= 2; round += 1) {
  const commands = [];
  for (const book of ["pingshui", "cilin", "xinyun"]) {
    const script = `scripts/data/build-${book}.ts`;
    const args = ["node_modules/tsx/dist/cli.mjs", script];
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const log = `${outputRelative}/rebuild-logs/round-${round}-${book}.txt`;
    writeFileSync(
      path.join(root, log),
      `${result.stdout ?? ""}${result.stderr ?? ""}`,
      "utf8",
    );
    commands.push({
      command: ["node", ...args],
      generatorSha256: sha(script),
      exitCode: result.status,
      error: result.error?.message ?? null,
      log,
      logSha256: sha(log),
    });
    console.log(`round ${round} ${book}: exit ${result.status}`);
    if (result.status !== 0 || result.error) break;
  }
  record.rounds.push({ round, commands, hashes: hashes() });
  if (
    commands.length !== 3 ||
    commands.some((c) => c.exitCode !== 0 || c.error)
  )
    break;
}
record.completedAt = new Date().toISOString();
record.byteIdenticalToBefore =
  record.rounds.length === 2 &&
  record.rounds.every(
    (r) => JSON.stringify(r.hashes) === JSON.stringify(record.before),
  );
record.allCommandsSucceeded =
  record.rounds.length === 2 &&
  record.rounds.every(
    (r) =>
      r.commands.length === 3 &&
      r.commands.every((c) => c.exitCode === 0 && !c.error),
  );
record.scope =
  "两轮实际生成器进程；四份快照与多读音伴随清单字节逐轮比较。不新增审批、不把JSON.parse当重建。";
writeFileSync(
  path.join(out, "rebuild-verification.json"),
  `${JSON.stringify(record, null, 2)}\n`,
  "utf8",
);
assert(
  record.allCommandsSucceeded && record.byteIdenticalToBefore,
  "generator failure or unexpected data drift; inspect recorded results and diff",
);
console.log(
  "Two real build rounds passed; output bytes equal the initial snapshots.",
);
