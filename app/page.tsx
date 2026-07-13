"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { categories, dishes, getDish } from "./menu";

type Cart = Record<string, number>;
type OrderItem = { dishId: string; quantity: number };
type Order = {
  id: string;
  customerName: string;
  mealDate: string;
  guestCount: number;
  note: string;
  dishes: string;
  status: "new" | "confirmed" | "done";
  createdAt: string;
};

const statusLabel = { new: "待确认", confirmed: "已确认", done: "已完成" };

function parseItems(order: Order): OrderItem[] {
  try {
    return JSON.parse(order.dishes) as OrderItem[];
  } catch {
    return [];
  }
}

function formatAmount(value: number, unit: string) {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  return `${rounded}${unit}`;
}

export default function Home() {
  const [mode, setMode] = useState<"menu" | "chef">("menu");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  const filteredDishes = activeCategory === "全部"
    ? dishes
    : dishes.filter((dish) => dish.category === activeCategory);

  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const cartItems = dishes
    .filter((dish) => cart[dish.id])
    .map((dish) => ({ ...dish, quantity: cart[dish.id] }));

  const updateQuantity = (dishId: string, change: number) => {
    setCart((current) => {
      const next = Math.max(0, (current[dishId] || 0) + change);
      const updated = { ...current, [dishId]: next };
      if (next === 0) delete updated[dishId];
      return updated;
    });
  };

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      const data = await response.json() as { orders?: Order[]; error?: string };
      if (!response.ok) throw new Error(data.error || "订单加载失败");
      setOrders(data.orders || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "订单加载失败");
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (mode === "chef") loadOrders();
  }, [mode]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const shoppingList = useMemo(() => {
    const totals = new Map<string, { name: string; amount: number; unit: string; type: string }>();
    orders.filter((order) => order.status !== "done").forEach((order) => {
      parseItems(order).forEach((item) => {
        const dish = getDish(item.dishId);
        dish?.ingredients.forEach((ingredient) => {
          const key = `${ingredient.name}-${ingredient.unit}`;
          const current = totals.get(key);
          totals.set(key, {
            ...ingredient,
            amount: (current?.amount || 0) + ingredient.amount * item.quantity,
          });
        });
      });
    });
    return Array.from(totals.values()).sort((a, b) => a.type.localeCompare(b.type, "zh-CN"));
  }, [orders]);

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: form.get("customerName"),
          mealDate: form.get("mealDate"),
          guestCount: Number(form.get("guestCount")),
          note: form.get("note"),
          dishes: cartItems.map((item) => ({ dishId: item.id, quantity: item.quantity })),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "提交失败，请再试一次");
      setCart({});
      setCheckoutOpen(false);
      setCartOpen(false);
      setNotice("点菜成功！我会尽快和你确认 🍽️");
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提交失败，请再试一次");
    } finally {
      setSubmitting(false);
    }
  };

  const updateOrderStatus = async (id: string, status: Order["status"]) => {
    try {
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) throw new Error("更新失败");
      setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    } catch {
      setNotice("状态更新失败，请稍后重试");
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => setMode("menu")} aria-label="回到菜单">
          <span className="brand-mark">好</span>
          <span><strong>好好吃饭</strong><small>私房菜单 · 用心下厨</small></span>
        </button>
        <nav className="mode-switch" aria-label="页面切换">
          <button className={mode === "menu" ? "active" : ""} onClick={() => setMode("menu")}>朋友点菜</button>
          <button className={mode === "chef" ? "active" : ""} onClick={() => setMode("chef")}>主厨工作台</button>
        </nav>
      </header>

      {mode === "menu" ? (
        <>
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">THIS WEEK&apos;S HOME MENU</span>
              <h1>今晚，来我家<br />好好吃顿饭吧。</h1>
              <p>没有预制菜，也没有外卖盒。选几道你想吃的，我来认真准备。</p>
              <div className="hero-note"><span>本周菜单</span><strong>每道菜约 3–4 人份</strong><span>提前 1 天点单</span></div>
            </div>
            <div className="hero-plate" aria-hidden="true">
              <div className="plate-rim"><span className="plate-food">🍲</span></div>
              <span className="leaf leaf-one">☘</span><span className="leaf leaf-two">🌿</span>
            </div>
          </section>

          <section className="menu-section">
            <div className="section-heading">
              <div><span className="eyebrow">CHOOSE YOUR FAVORITES</span><h2>想吃什么？</h2></div>
              <p>慢慢选，不着急。好吃的值得期待。</p>
            </div>
            <div className="category-tabs" role="tablist" aria-label="菜系分类">
              {["全部", ...categories].map((category) => (
                <button key={category} className={activeCategory === category ? "active" : ""} onClick={() => setActiveCategory(category)}>{category}</button>
              ))}
            </div>
            <div className="dish-grid">
              {filteredDishes.map((dish) => {
                const quantity = cart[dish.id] || 0;
                return (
                  <article className="dish-card" key={dish.id}>
                    <div className={`dish-art tone-${dish.tone}`}><span>{dish.emoji}</span><small>{dish.category}</small></div>
                    <div className="dish-body">
                      <div className="dish-title"><h3>{dish.name}</h3>{dish.tag && <span>{dish.tag}</span>}</div>
                      <p>{dish.description}</p>
                      <div className="dish-meta"><span>{dish.flavor}</span><span>约 {dish.minutes} 分钟</span></div>
                      <div className="quantity-control">
                        {quantity > 0 && <><button onClick={() => updateQuantity(dish.id, -1)} aria-label={`减少${dish.name}`}>−</button><strong>{quantity}</strong></>}
                        <button className={quantity ? "add filled" : "add"} onClick={() => updateQuantity(dish.id, 1)} aria-label={`添加${dish.name}`}>{quantity ? "+" : "加入菜单 +"}</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="promise-strip">
            <div><span>01</span><strong>新鲜采购</strong><p>收到点单后再买菜</p></div>
            <div><span>02</span><strong>认真备菜</strong><p>每一道都现做</p></div>
            <div><span>03</span><strong>一起吃饭</strong><p>最重要的是开心</p></div>
          </section>

          {cartCount > 0 && (
            <button className="floating-cart" onClick={() => setCartOpen(true)}>
              <span className="cart-icon">篮</span><span><small>已选菜单</small><strong>{cartCount} 道菜</strong></span><b>查看点单 →</b>
            </button>
          )}
        </>
      ) : (
        <section className="chef-page">
          <div className="chef-heading">
            <div><span className="eyebrow">KITCHEN DASHBOARD</span><h1>主厨工作台</h1><p>订单、备菜和采购，一眼看清楚。</p></div>
            <button className="refresh-button" onClick={loadOrders} disabled={loadingOrders}>{loadingOrders ? "刷新中…" : "刷新订单"}</button>
          </div>
          <div className="stats-row">
            <div><small>新订单</small><strong>{orders.filter((o) => o.status === "new").length}</strong><span>待确认</span></div>
            <div><small>待准备菜品</small><strong>{orders.filter((o) => o.status !== "done").reduce((sum, o) => sum + parseItems(o).reduce((s, i) => s + i.quantity, 0), 0)}</strong><span>份</span></div>
            <div><small>采购项目</small><strong>{shoppingList.length}</strong><span>种食材</span></div>
          </div>

          <div className="chef-grid">
            <div className="orders-panel panel">
              <div className="panel-title"><div><span>订单</span><h2>朋友们点了什么</h2></div><small>{orders.length} 个订单</small></div>
              {loadingOrders && orders.length === 0 ? <div className="empty">正在端上订单…</div> : orders.length === 0 ? <div className="empty"><span>🍽️</span><strong>还没有人点菜</strong><p>把页面发给朋友，第一份菜单就会出现在这里。</p></div> : (
                <div className="order-list">
                  {orders.map((order) => (
                    <article className="order-card" key={order.id}>
                      <div className="order-top"><div><strong>{order.customerName}</strong><span>#{order.id.slice(-6).toUpperCase()}</span></div><em className={`status ${order.status}`}>{statusLabel[order.status]}</em></div>
                      <div className="order-facts"><span>📅 {order.mealDate}</span><span>👥 {order.guestCount} 人</span></div>
                      <div className="ordered-dishes">
                        {parseItems(order).map((item) => <div key={item.dishId}><span>{getDish(item.dishId)?.name || "已下架菜品"}</span><strong>× {item.quantity}</strong></div>)}
                      </div>
                      {order.note && <p className="order-note">“{order.note}”</p>}
                      <div className="status-actions">
                        {order.status === "new" && <button onClick={() => updateOrderStatus(order.id, "confirmed")}>确认接单</button>}
                        {order.status === "confirmed" && <button onClick={() => updateOrderStatus(order.id, "done")}>标记完成</button>}
                        {order.status === "done" && <button className="quiet" onClick={() => updateOrderStatus(order.id, "confirmed")}>重新打开</button>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <aside className="shopping-panel panel">
              <div className="panel-title"><div><span>自动汇总</span><h2>采购清单</h2></div><small>不含已完成订单</small></div>
              {shoppingList.length === 0 ? <div className="empty compact"><span>🧺</span><p>有新订单后，会自动拆解并合并食材用量。</p></div> : (
                <div className="shopping-list">
                  {["生鲜", "蔬菜", "调料", "其他"].map((type) => {
                    const items = shoppingList.filter((item) => item.type === type);
                    if (!items.length) return null;
                    return <div className="shopping-group" key={type}><h3>{type}</h3>{items.map((item) => <label key={`${item.name}-${item.unit}`}><input type="checkbox" /><span>{item.name}</span><strong>{formatAmount(item.amount, item.unit)}</strong></label>)}</div>;
                  })}
                </div>
              )}
              <div className="shopping-tip">数量按每道菜约 3–4 人份估算，采购时可按食量微调。</div>
            </aside>
          </div>
        </section>
      )}

      {cartOpen && (
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setCartOpen(false)}>
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="已选菜单">
            <button className="close" onClick={() => setCartOpen(false)} aria-label="关闭">×</button>
            <span className="eyebrow">YOUR HOME MENU</span><h2>这顿想吃这些</h2>
            <div className="cart-lines">{cartItems.map((item) => <div key={item.id}><span className="mini-emoji">{item.emoji}</span><span><strong>{item.name}</strong><small>{item.flavor}</small></span><div><button onClick={() => updateQuantity(item.id, -1)}>−</button><b>{item.quantity}</b><button onClick={() => updateQuantity(item.id, 1)}>+</button></div></div>)}</div>
            <p className="cart-hint">每道菜约 3–4 人份，提交后我会和你确认具体时间。</p>
            <button className="primary-button" onClick={() => setCheckoutOpen(true)}>填写用餐信息 <span>→</span></button>
          </aside>
        </div>
      )}

      {checkoutOpen && (
        <div className="overlay checkout-overlay">
          <form className="checkout-card" onSubmit={submitOrder}>
            <button type="button" className="close" onClick={() => setCheckoutOpen(false)} aria-label="关闭">×</button>
            <span className="eyebrow">ALMOST THERE</span><h2>最后，告诉我是谁来吃饭</h2><p>提交后，我会尽快和你确认。</p>
            <label><span>你的称呼</span><input name="customerName" required maxLength={30} placeholder="例如：小林" /></label>
            <div className="form-row"><label><span>想哪天吃</span><input name="mealDate" type="date" min={today} defaultValue={today} required /></label><label><span>几个人</span><input name="guestCount" type="number" min="1" max="20" defaultValue="2" required /></label></div>
            <label><span>口味或忌口</span><textarea name="note" maxLength={200} placeholder="例如：少辣、不吃香菜，或者任何想说的话…" /></label>
            <button className="primary-button" disabled={submitting}>{submitting ? "正在提交…" : `确认点菜 · ${cartCount} 道`}<span>→</span></button>
          </form>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
      <footer><span>好好吃饭 · 私房菜单</span><p>Made with care, served with love.</p></footer>
    </main>
  );
}
