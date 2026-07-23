"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const stages = [
  { id: "new", label: "点单送达", note: "阿德已经收到你的心愿" },
  { id: "confirmed", label: "饭局确认", note: "日期和菜单已经留好" },
  { id: "shopping", label: "正在买菜", note: "新鲜食材正在赶来" },
  { id: "preparing", label: "厨房开火", note: "锅里已经热闹起来了" },
  { id: "done", label: "开饭啦", note: "请带着好胃口来" },
] as const;

const statusNotices: Record<string, { mark: string; title: string; description: string; action: string }> = {
  confirmed: { mark: "✓", title: "饭局确认好啦", description: "主厨已经接下这顿饭，会按约定认真准备。", action: "知道啦" },
  shopping: { mark: "篮", title: "正在为你买菜", description: "新鲜食材正在赶来，带着好胃口等一等。", action: "收到" },
  preparing: { mark: "火", title: "厨房已经开火", description: "锅里开始热闹起来，香味正在慢慢靠近。", action: "好期待" },
  done: { mark: "铃", title: "开饭啦！", description: "菜已经准备好了，快来吃饭，别让热气等太久。", action: "马上来吃" },
  cancelled: { mark: "约", title: "这场饭局先暂停", description: "计划有一点变化，等下次再重新约一顿好饭。", action: "我知道了" },
};

type StatusData = {
  order: { customerName: string; mealDate: string; guestCount: number; status: string; progressNote: string; statusUpdatedAt: string; publishedMenuUpdatedAt: string; publishedMenu?: { title: string; date: string; message: string; template: string; templateName: string; subtitle: string; occasion: string; courses: Array<{ id: string; label: string; english: string; dishes: Array<{ name: string; description: string }> }> } | null; dishSnapshot: Array<{ name: string }> };
  invite?: { title: string; message: string; theme: string } | null;
  journal?: { title: string; note: string; imageUrls: string[] } | null;
};

const templateMarks: Record<string, string> = { home: "家", romance: "♡", fine: "FD", spring: "春", midautumn: "月", birthday: "★", housewarming: "宅", summer: "夏", christmas: "✦", brunch: "☀" };

export default function OrderStatusClient({ token }: { token: string }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return window.localStorage.getItem(`ade-order-update:${token}`) || ""; } catch { return ""; }
  });
  const [dismissedMenuUpdate, setDismissedMenuUpdate] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return window.localStorage.getItem(`ade-order-menu-update:${token}`) || ""; } catch { return ""; }
  });

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/order-status/${token}`, { cache: "no-store" });
      const payload = await response.json() as StatusData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "进度加载失败");
      setData(payload);
      setUpdatedAt(new Date());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "进度加载失败");
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [load]);
  const currentUpdateKey = data?.order.statusUpdatedAt || "";
  const currentStatus = data?.order.status || "";
  const currentNotice = currentStatus ? statusNotices[currentStatus] : undefined;
  const showUpdateAlert = Boolean(currentNotice && currentUpdateKey && dismissedUpdate !== currentUpdateKey);
  const currentMenuUpdateKey = data?.order.publishedMenuUpdatedAt || "";
  const showMenuAlert = Boolean(!showUpdateAlert && data?.order.publishedMenu && currentMenuUpdateKey && dismissedMenuUpdate !== currentMenuUpdateKey);

  useEffect(() => {
    if ((!showUpdateAlert || !currentStatus) && !showMenuAlert) return;
    const previousTitle = document.title;
    const timer = window.setTimeout(() => {
      document.title = showMenuAlert ? "📜 今晚菜单已送达｜阿德小厨房" : currentStatus === "done" ? "🔔 开饭啦｜阿德小厨房" : "🔔 厨房有新进度｜阿德小厨房";
      if (typeof navigator.vibrate === "function") navigator.vibrate(currentStatus === "done" ? [250, 120, 250, 120, 400] : [160, 80, 160]);
    }, 0);
    return () => { window.clearTimeout(timer); document.title = previousTitle; };
  }, [showUpdateAlert, showMenuAlert, currentUpdateKey, currentMenuUpdateKey, currentStatus]);

  const acknowledgeUpdate = () => {
    if (!currentUpdateKey) return;
    try { window.localStorage.setItem(`ade-order-update:${token}`, currentUpdateKey); } catch { /* 无痕模式下仍可在本次访问关闭 */ }
    setDismissedUpdate(currentUpdateKey);
  };

  const acknowledgeMenuUpdate = () => {
    if (!currentMenuUpdateKey) return;
    try { window.localStorage.setItem(`ade-order-menu-update:${token}`, currentMenuUpdateKey); } catch { /* 无痕模式下仍可在本次访问关闭 */ }
    setDismissedMenuUpdate(currentMenuUpdateKey);
    window.setTimeout(() => document.getElementById("published-menu")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  if (error && !data) return <main className="status-page"><section className="status-card"><span>阿德小厨房</span><h1>这张进度卡走丢了</h1><p>{error}</p><button onClick={() => void load()} disabled={refreshing}>{refreshing ? "正在重试…" : "重新加载进度"}</button><Link href="/">回到点菜页</Link></section></main>;
  if (!data) return <main className="status-page"><section className="status-card"><p>正在看看厨房里忙到哪一步了…</p></section></main>;
  const activeIndex = stages.findIndex((stage) => stage.id === data.order.status);
  return <main className={`status-page status-${data.invite?.theme || "warm"}`}>
    {showUpdateAlert && currentNotice && <div className={`status-update-modal status-update-${data.order.status}`} role="alertdialog" aria-modal="true" aria-labelledby="status-update-title">
      <section>
        <div className="status-update-mark" aria-hidden="true">{currentNotice.mark}</div>
        <span>KITCHEN UPDATE · 强提醒</span>
        <h2 id="status-update-title">{currentNotice.title}</h2>
        <p>{data.order.progressNote || currentNotice.description}</p>
        <button type="button" onClick={acknowledgeUpdate}>{currentNotice.action}</button>
        <small>这条提醒确认后不会重复弹出</small>
      </section>
    </div>}
    {showMenuAlert && data.order.publishedMenu && <div className="status-update-modal status-update-menu" role="alertdialog" aria-modal="true" aria-labelledby="menu-update-title">
      <section>
        <div className="status-update-mark" aria-hidden="true">单</div>
        <span>CHEF&apos;S MENU · 新菜单</span>
        <h2 id="menu-update-title">阿德把正式菜单排好啦</h2>
        <p>{data.order.publishedMenu.message || "今晚吃什么已经认真排好，随时可以回来翻菜单。"}</p>
        <button type="button" onClick={acknowledgeMenuUpdate}>打开今晚菜单</button>
        <small>菜单之后有调整，也会在这里自动更新</small>
      </section>
    </div>}
    <section className="status-card">
      <span>PRIVATE DINNER · 实时进度</span>
      <h1>{data.invite?.title || `${data.order.customerName}的这顿饭`}</h1>
      <p>{data.invite?.message || "慢慢等，好好吃，厨房正在认真准备。"}</p>
      <div className="status-live"><span><i />实时同步中</span><small>{updatedAt ? `最近更新 ${updatedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "正在获取最新状态"} · 每 15 秒自动更新 · 新进度弹窗提醒</small></div>
      {error && <div className="status-sync-warning">这次同步没有成功：{error}。已有进度仍然保留，可以稍后重试。</div>}
      <div className="status-meta"><strong>{data.order.mealDate}</strong><small>{data.order.guestCount} 位 · {data.order.dishSnapshot.length} 道菜</small></div>
      {data.order.status === "cancelled" ? <div className="status-cancelled">这场饭局暂时取消了，等我们下次再好好约。</div> : <ol className="status-timeline">{stages.map((stage, index) => <li className={index <= activeIndex ? "active" : ""} key={stage.id}><i>{index < activeIndex ? "✓" : index + 1}</i><div><strong>{stage.label}</strong><small>{stage.note}</small></div></li>)}</ol>}
      {data.order.progressNote && <blockquote>“{data.order.progressNote}”<small>— 主厨留言</small></blockquote>}
      {data.order.publishedMenu && <section id="published-menu" className={`banquet-preview guest-published-menu template-${data.order.publishedMenu.template}`}>
        <div className="menu-card-ornament" aria-hidden="true"><span>{templateMarks[data.order.publishedMenu.template] || "宴"}</span></div>
        <div className="menu-card-header"><small>{data.order.publishedMenu.subtitle || "CHEF'S PRIVATE MENU"}</small><h2>{data.order.publishedMenu.title}</h2><p>{data.order.publishedMenu.templateName || "阿德私房菜单"}</p><div><span>{data.order.publishedMenu.date || data.order.mealDate}</span><span>{data.order.publishedMenu.occasion || "今晚相聚"}</span><span>{data.order.guestCount} 位宾客</span></div></div>
        <div className="menu-card-courses">{data.order.publishedMenu.courses.map((course) => course.dishes.length ? <section key={course.id}><h3><span>{course.label}</span><small>{course.english}</small></h3><div>{course.dishes.map((dish, index) => <article key={`${course.id}-${dish.name}-${index}`}><strong>{dish.name}</strong><span>{dish.description}</span></article>)}</div></section> : null)}</div>
        <div className="menu-card-footer"><span>—</span><p>{data.order.publishedMenu.message}</p><small>CHEF&apos;S TABLE · 阿德私房呈献</small></div>
        <div className="guest-menu-updated">菜单会随主厨调整自动更新 · {data.order.publishedMenuUpdatedAt ? new Date(data.order.publishedMenuUpdatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "刚刚送达"}</div>
      </section>}
      <div className="status-dishes"><small>今晚菜单</small><p>{data.order.dishSnapshot.map((dish) => dish.name).join(" · ")}</p></div>
      {data.journal && <section className="guest-journal"><span>AFTER DINNER</span><h2>{data.journal.title}</h2><p>{data.journal.note}</p>{data.journal.imageUrls.length > 0 && <div>{data.journal.imageUrls.map((url, index) => <img src={url} alt={`饭局照片 ${index + 1}`} key={url} />)}</div>}</section>}
      <button onClick={() => void load()} disabled={refreshing}>{refreshing ? "正在同步厨房进度…" : "立即刷新厨房进度"}</button>
    </section>
  </main>;
}
