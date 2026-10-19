"""历史脚本（D1 mock 阶段）。**不要用它对真实模式做验收**。
真实九格验收见 d3-acceptance-api.mjs。
"""

"""D1 系统验收：API 层实测（E，D1 收口）。

覆盖：healthz / readyz / rhyme-books / 五种报告状态 / 422 / 413 / 503 x3。
所有断言只看契约里的 ASCII 枚举与计数，避免控制台编码干扰中文输出。
"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPO = r"C:\study\w1\poetry-checker"
BASE = "http://127.0.0.1:3000"
NODE = r"C:\agent\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
TSX = os.path.join(REPO, "node_modules", "tsx", "dist", "cli.mjs")


def post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BASE + path, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8")
        try:
            return err.code, json.loads(body)
        except json.JSONDecodeError:
            return err.code, {"raw": body[:120]}


def get(path):
    req = urllib.request.Request(BASE + path)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8")
        try:
            return err.code, json.loads(body)
        except json.JSONDecodeError:
            return err.code, {"raw": body[:120]}


def fixtures():
    out = {}
    base = os.path.join(REPO, "fixtures", "contracts")
    for name in ("pass", "fail", "needs_review", "not_applicable", "unsupported"):
        with open(os.path.join(base, name + ".json"), encoding="utf-8") as handle:
            out[name] = json.load(handle)
    return out


def summarize(label, status, body):
    if not isinstance(body, dict):
        body = {"raw": str(body)[:120]}
    if "summary" in body:
        notice = (body.get("policy") or {}).get("notice") or ""
        prov = body.get("provenance") or {}
        print(
            "CASE|%-16s|http=%s|summary=%-14s|applicability=%-14s|"
            "genre_basis=%-16s|evidence=%d|rules=%d|sources=%d|notice_len=%d"
            % (
                label,
                status,
                body["summary"].get("status"),
                (body.get("genre") or {}).get("applicability"),
                (body.get("genre") or {}).get("basisType"),
                len(prov.get("evidence") or []),
                len(prov.get("rules") or []),
                len(prov.get("sources") or []),
                len(notice),
            )
        )
    else:
        err = body.get("error")
        if not isinstance(err, dict):
            err = {}
        print(
            "CASE|%-16s|http=%s|error_code=%-20s|fieldErrors=%d"
            % (label, status, err.get("code"), len(err.get("fieldErrors") or []))
        )


def main():
    server = subprocess.Popen(
        [NODE, TSX, "apps/api/src/server.ts"],
        cwd=REPO,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        ready = False
        for _ in range(40):
            time.sleep(0.5)
            try:
                if get("/healthz")[0] == 200:
                    ready = True
                    break
            except Exception:
                pass
        if not ready:
            print("SERVER_NOT_READY")
            return 1

        status, body = get("/healthz")
        print("CASE|healthz|http=%s|status=%s" % (status, body.get("status")))
        status, body = get("/readyz")
        print(
            "CASE|readyz|http=%s|status=%s|has_versions=%s"
            % (status, body.get("status"), bool(body.get("versions")))
        )
        status, body = get("/api/v1/rhyme-books")
        books = body.get("books") or []
        print(
            "CASE|rhyme-books|http=%s|books=%d|groupCounts=%s"
            % (status, len(books), [b.get("groupCount") for b in books])
        )

        f = fixtures()
        for name, doc in f.items():
            text = doc["poem"]["originalText"]
            req = {
                "text": text,
                "rhymeBook": "pingshui",
                "genreHint": "auto",
                "formHint": "auto",
                "ruleSet": "teaching-v1",
                "readingOverrides": [],
            }
            status, body = post("/api/v1/analyze", req)
            summarize("state:" + name, status, body)

        unknown = {
            "text": "山高月小水落石出",
            "rhymeBook": "pingshui",
            "genreHint": "auto",
            "formHint": "auto",
            "ruleSet": "teaching-v1",
            "readingOverrides": [],
        }
        status, body = post("/api/v1/analyze", unknown)
        summarize("state:default", status, body)

        # 前端本地拦截的另一半：后端 Schema 校验（422）
        bad = {
            "text": "字字字字字，字字字字字。",
            "rhymeBook": "pingshui",
            "genreHint": "ancient",
            "formHint": "wujue",
            "ruleSet": "teaching-v1",
            "readingOverrides": [],
        }
        status, body = post("/api/v1/analyze", bad)
        summarize("invalid:genre+form", status, body)

        bad2 = {"text": "字字字字字", "rhymeBook": "not-a-book", "genreHint": "auto"}
        status, body = post("/api/v1/analyze", bad2)
        summarize("invalid:rhymeBook", status, body)

        # 413：超 2000 码点
        big = {
            "text": "字" * 2001,
            "rhymeBook": "pingshui",
            "genreHint": "auto",
            "formHint": "auto",
            "ruleSet": "teaching-v1",
            "readingOverrides": [],
        }
        status, body = post("/api/v1/analyze", big)
        summarize("payload:2001cp", status, body)

        for path, label in (
            ("/api/v1/characters/%E5%AD%97", "notready:characters"),
            ("/api/v1/rules/METER.POSITION", "notready:rules"),
            ("/api/v1/sources/fixture:source", "notready:sources"),
        ):
            status, body = get(path)
            summarize(label, status, body)

        status, body = get("/api/v1/unknown-route")
        summarize("route:404", status, body)
        return 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
