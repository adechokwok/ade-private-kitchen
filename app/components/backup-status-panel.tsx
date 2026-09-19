"use client";

import { useCallback, useEffect, useState } from "react";

type BackupVersion = { name: string; completedAt: string; databaseBytes: number; hasUploads: boolean; current: boolean };
type BackupStatus = { healthy: boolean; lastSuccess: string; recoveryRequired: boolean; versions: BackupVersion[] };

function readableSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function BackupStatusPanel() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/backups", { cache: "no-store" });
      const data = await response.json() as BackupStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "备份状态读取失败");
      setStatus(data); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "备份状态读取失败"); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  return <section className="backup-status panel">
    <div className="panel-title"><div><span>SERVER SNAPSHOTS</span><h2>服务器自动备份</h2></div><button type="button" className="shopping-reset" onClick={() => void load()}>刷新状态</button></div>
    {error ? <div className="backup-state warning"><strong>暂时无法读取备份目录</strong><span>{error}</span></div> : !status ? <div className="empty compact">正在读取备份状态…</div> : <>
      <div className={`backup-state ${status.healthy ? "healthy" : "warning"}`}><strong>{status.healthy ? "✓ 最近备份完整" : status.recoveryRequired ? "导入恢复需要人工检查" : "还没有可确认的完整备份"}</strong><span>{status.lastSuccess ? `最后成功：${new Date(status.lastSuccess).toLocaleString("zh-CN")}` : "备份容器首次成功运行后会出现在这里"}</span></div>
      <div className="backup-version-list">{status.versions.length ? status.versions.map((version) => <article key={version.name}><div><strong>{version.current ? "当前恢复点" : "历史恢复点"}</strong><span>{new Date(version.completedAt).toLocaleString("zh-CN")}</span></div><small>{readableSize(version.databaseBytes)} · {version.hasUploads ? "含照片" : "仅数据库"}</small><code>{version.name}</code></article>) : <p>暂无可恢复版本。</p>}</div>
      <p className="backup-guidance">恢复会替换当前数据库和照片，因此这里只核验并列出恢复点；实际恢复仍在服务器停机后操作，避免饭局进行中误覆盖数据。</p>
    </>}
  </section>;
}
