"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { MenuFont } from "../menu-fonts-shared";

export function MenuFontLibrary({ fonts, selectedId, onFontsChange, onSelect }: {
  fonts: MenuFont[];
  selectedId: string;
  onFontsChange: (fonts: MenuFont[]) => void;
  onSelect: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!files.length) return;
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/menu-fonts", { method: "POST", body: form });
      const payload = await response.json() as { fonts?: MenuFont[]; error?: string };
      if (!response.ok || !payload.fonts) throw new Error(payload.error || "字体导入失败");
      onFontsChange(payload.fonts);
      setMessage(`已导入 ${files.length} 款字体`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "字体导入失败"); }
    finally { setBusy(false); }
  };

  const remove = async (font: MenuFont) => {
    const question = font.kind === "custom"
      ? `确定永久删除“${font.name}”字体文件吗？`
      : `将“${font.name}”从字体库中移除？你之后可以恢复内置字体。`;
    if (!window.confirm(question)) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/menu-fonts/${encodeURIComponent(font.id)}`, { method: "DELETE" });
      const payload = await response.json() as { fonts?: MenuFont[]; error?: string };
      if (!response.ok || !payload.fonts) throw new Error(payload.error || "移除字体失败");
      onFontsChange(payload.fonts);
      if (selectedId === font.id) onSelect("system-serif");
      setMessage(font.kind === "custom" ? "字体文件已删除" : "内置字体已从列表移除");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "移除字体失败"); }
    finally { setBusy(false); }
  };

  const restore = async () => {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/menu-fonts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "restore-builtins" }) });
      const payload = await response.json() as { fonts?: MenuFont[]; error?: string };
      if (!response.ok || !payload.fonts) throw new Error(payload.error || "恢复内置字体失败");
      onFontsChange(payload.fonts);
      setMessage("内置字体已恢复");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "恢复内置字体失败"); }
    finally { setBusy(false); }
  };

  return <section className="menu-font-library" aria-label="字体库管理">
    <div className="menu-font-library-heading">
      <div><strong>字体库</strong><small>可导入 TTF、OTF、WOFF 或 WOFF2 文件，支持一次多选</small></div>
      <button type="button" className="menu-font-upload" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "正在处理…" : "＋ 导入字体"}</button>
      <input ref={inputRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" multiple hidden onChange={(event) => void upload(event)} />
    </div>
    <div className="menu-font-library-list">
      {fonts.map((font) => <article className={selectedId === font.id ? "menu-font-library-item selected" : "menu-font-library-item"} key={font.id}>
        <button type="button" className={`menu-font-library-choice menu-font-${font.id}`} onClick={() => onSelect(font.id)} disabled={busy}>
          <strong>{font.name}</strong><small>{font.style}</small>
        </button>
        <span className={`menu-font-kind menu-font-kind-${font.kind}`}>{font.kind === "custom" ? "已导入" : font.kind === "builtin" ? "内置" : "系统"}</span>
        {font.kind !== "system" && <button type="button" className="menu-font-remove" onClick={() => void remove(font)} disabled={busy} aria-label={`移除${font.name}`}>移除</button>}
      </article>)}
    </div>
    <div className="menu-font-library-foot"><span>内置字体移除后可恢复；已导入字体删除后会从本机字体库清除。</span><button type="button" onClick={() => void restore()} disabled={busy}>恢复内置字体</button></div>
    {message && <p className="menu-font-library-message" role="status">{message}</p>}
    {error && <p className="menu-font-library-error" role="alert">{error}</p>}
  </section>;
}
