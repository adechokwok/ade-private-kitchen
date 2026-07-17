"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const stages = [
  { id: "new", label: "点单送达", note: "阿德已经收到你的心愿" },
  { id: "confirmed", label: "饭局确认", note: "日期和菜单已经留好" },
  { id: "shopping", label: "正在买菜", note: "新鲜食材正在赶来" },
  { id: "preparing", label: "厨房开火", note: "锅里已经热闹起来了" },
  { id: "done", label: "开饭啦", note: "请带着好胃口来" },
] as const;

type StatusData = {
  order: { customerName: string; mealDate: string; guestCount: number; status: string; progressNote: string; dishSnapshot: Array<{ name: string }> };
  invite?: { title: string; message: string; theme: string } | null;
  journal?: { title: string; note: string; imageUrls: string[] } | null;
};

export default function OrderStatusClient({ token }: { token: string }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const load = () => fetch(`/api/order-status/${token}`, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as StatusData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "进度加载失败");
      setData(payload); setError("");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "进度加载失败"));
    load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer);
  }, [token]);
  if (error) return <main className="status-page"><section className="status-card"><span>阿德小厨房</span><h1>这张进度卡走丢了</h1><p>{error}</p><Link href="/">回到点菜页</Link></section></main>;
  if (!data) return <main className="status-page"><section className="status-card"><p>正在看看厨房里忙到哪一步了…</p></section></main>;
  const activeIndex = stages.findIndex((stage) => stage.id === data.order.status);
  return <main className={`status-page status-${data.invite?.theme || "warm"}`}>
    <section className="status-card">
      <span>PRIVATE DINNER · 实时进度</span>
      <h1>{data.invite?.title || `${data.order.customerName}的这顿饭`}</h1>
      <p>{data.invite?.message || "慢慢等，好好吃，厨房正在认真准备。"}</p>
      <div className="status-meta"><strong>{data.order.mealDate}</strong><small>{data.order.guestCount} 位 · {data.order.dishSnapshot.length} 道菜</small></div>
      {data.order.status === "cancelled" ? <div className="status-cancelled">这场饭局暂时取消了，等我们下次再好好约。</div> : <ol className="status-timeline">{stages.map((stage, index) => <li className={index <= activeIndex ? "active" : ""} key={stage.id}><i>{index < activeIndex ? "✓" : index + 1}</i><div><strong>{stage.label}</strong><small>{stage.note}</small></div></li>)}</ol>}
      {data.order.progressNote && <blockquote>“{data.order.progressNote}”<small>— 主厨留言</small></blockquote>}
      <div className="status-dishes"><small>今晚菜单</small><p>{data.order.dishSnapshot.map((dish) => dish.name).join(" · ")}</p></div>
      {data.journal && <section className="guest-journal"><span>AFTER DINNER</span><h2>{data.journal.title}</h2><p>{data.journal.note}</p>{data.journal.imageUrls.length > 0 && <div>{data.journal.imageUrls.map((url, index) => <img src={url} alt={`饭局照片 ${index + 1}`} key={url} />)}</div>}</section>}
      <button onClick={() => window.location.reload()}>刷新厨房进度</button>
    </section>
  </main>;
}
