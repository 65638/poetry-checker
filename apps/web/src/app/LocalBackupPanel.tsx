import { useRef, useState } from "react";
import type { InputDraft } from "../view-contract";
import { downloadJson } from "./library";
import {
  applyLocalRestore,
  BACKUP_BYTES,
  browserBackupPort,
  makeLocalBackup,
  parseLocalBackup,
  planLocalRestore,
  type LocalBackup,
  type RestorePlan,
} from "./localBackup";
import "./local-backup.css";

export function LocalBackupPanel({
  getDraft,
  onRestored,
  disabled = false,
}: {
  getDraft: () => InputDraft;
  onRestored: (draft?: InputDraft) => void;
  disabled?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<LocalBackup | null>(null);
  const [filename, setFilename] = useState("");
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const draftAtPreview = useRef("");
  const [restoreDraft, setRestoreDraft] = useState(false);
  const [restorePreferences, setRestorePreferences] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function perform(task: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作未完成，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="pc-backup-panel">
      <summary>本机备份与恢复</summary>
      <p>
        带走当前草稿、稿匣、导入诗库、收藏、摘句、字笺、推敲笺和阅读偏好。换电脑或换网站地址后，可在这里合并恢复。
      </p>
      <div className="pc-studio-actions">
        <button
          type="button"
          className="pc-studio-action"
          disabled={busy || disabled}
          onClick={() =>
            void perform(async () => {
              const value = await makeLocalBackup(
                browserBackupPort(),
                getDraft(),
              );
              downloadJson(
                `诗词书笺备份-${new Date().toISOString().slice(0, 10)}.json`,
                value,
              );
              setMessage(
                "备份已生成，请在浏览器下载中保存。文件包含自己的诗文和笺记。",
              );
            })
          }
        >
          导出完整备份
        </button>
        <button
          type="button"
          className="pc-studio-action"
          disabled={busy || disabled}
          onClick={() => fileInput.current?.click()}
        >
          选择备份文件
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label="选择完整备份"
          hidden
          disabled={busy || disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setBackup(null);
            setPlan(null);
            setFilename("");
            void perform(async () => {
              if (file.size > BACKUP_BYTES)
                throw new Error("备份文件超过20MB，请使用分项导入。");
              const value = await parseLocalBackup(await file.text());
              setBackup(value);
              setFilename(file.name);
              setMessage("文件校验通过，尚未修改本机数据。请先预览合并结果。");
            });
          }}
        />
      </div>
      {backup && (
        <div className="pc-backup-preview">
          <p>
            {filename} ·{" "}
            {new Date(backup.createdAt).toLocaleString("zh-CN", {
              hour12: false,
            })}
          </p>
          <div className="pc-studio-actions">
            <label>
              <input
                type="checkbox"
                checked={restoreDraft}
                disabled={busy || disabled}
                onChange={(e) => {
                  setRestoreDraft(e.target.checked);
                  setPlan(null);
                }}
              />
              同时恢复备份草稿（替换当前输入）
            </label>
            <label>
              <input
                type="checkbox"
                checked={restorePreferences}
                disabled={busy || disabled}
                onChange={(e) => {
                  setRestorePreferences(e.target.checked);
                  setPlan(null);
                }}
              />
              采用备份中的阅读设置
            </label>
            <button
              type="button"
              className="pc-studio-action"
              disabled={busy || disabled}
              onClick={() =>
                void perform(async () => {
                  setPlan(null);
                  const currentDraft = JSON.stringify(getDraft());
                  const next = await planLocalRestore(
                    browserBackupPort(),
                    backup,
                    { draft: restoreDraft, preferences: restorePreferences },
                  );
                  draftAtPreview.current = currentDraft;
                  setPlan(next);
                })
              }
            >
              预览合并
            </button>
          </div>
          {plan && (
            <div aria-label="备份合并预览">
              <p>
                将新增 {plan.added.works} 篇本机诗文、{plan.added.notes}{" "}
                条笺记、{plan.added.favorites} 首收藏、{plan.added.characters}{" "}
                个收藏字、{plan.added.excerpts} 条摘句、{plan.added.drafts}{" "}
                篇存稿。
              </p>
              <p>
                {plan.draft
                  ? "当前输入将换为备份草稿；可用推敲台的撤销返回。"
                  : "当前草稿保留。"}
                已有相同记录会自动去重，阅读历史保留最近12篇。
              </p>
              <button
                type="button"
                className="pc-studio-action"
                disabled={busy || disabled}
                onClick={() =>
                  void perform(async () => {
                    if (JSON.stringify(getDraft()) !== draftAtPreview.current) {
                      setPlan(null);
                      throw new Error("当前草稿已变化，请重新预览后再合并。");
                    }
                    await applyLocalRestore(browserBackupPort(), plan);
                    onRestored(plan.draft);
                    setPlan(null);
                    setBackup(null);
                    setMessage("合并完成，收藏与笺记已在本页更新。");
                  })
                }
              >
                确认合并
              </button>
            </div>
          )}
        </div>
      )}
      {busy && <p role="status">正在处理本机资料…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
