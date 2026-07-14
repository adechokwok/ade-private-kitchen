"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { categories, dishes, type Dish, type Ingredient } from "./menu";

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
type ManagedDish = Dish & { active: boolean; isCustom: true; createdAt?: string };
type IngredientRow = Ingredient & { rowId: string };
type RecipeDraft = {
  name: string;
  category: string;
  description: string;
  flavor: string;
  minutes: number;
  source: string;
  ingredients: Ingredient[];
  steps: string[];
  confidenceNotes: string[];
};
type RecipeScreenshot = { file: File; preview: string };
type BanquetCourse = "starter" | "main" | "staple" | "soup";
type BanquetItem = { dishId: string; course: BanquetCourse };
type BanquetTemplate = "home" | "romance" | "fine" | "spring" | "midautumn" | "birthday";

const banquetCourses: Array<{ id: BanquetCourse; label: string; english: string }> = [
  { id: "starter", label: "开胃前菜", english: "APPETIZER" },
  { id: "main", label: "主厨热菜", english: "MAIN COURSE" },
  { id: "staple", label: "主食点心", english: "STAPLE" },
  { id: "soup", label: "汤饮甜品", english: "SOUP & DESSERT" },
];

const banquetTemplates: Array<{ id: BanquetTemplate; name: string; occasion: string; subtitle: string; mark: string }> = [
  { id: "home", name: "温馨家宴", occasion: "亲友小聚", subtitle: "一桌家常味，都是惦念", mark: "家" },
  { id: "romance", name: "二人世界", occasion: "约会 · 纪念日", subtitle: "Tonight, just for us", mark: "♡" },
  { id: "fine", name: "Fine Dining", occasion: "正式晚宴", subtitle: "A PRIVATE DINING EXPERIENCE", mark: "FD" },
  { id: "spring", name: "新春团圆", occasion: "春节 · 除夕", subtitle: "岁岁常欢愉，年年皆胜意", mark: "春" },
  { id: "midautumn", name: "中秋雅宴", occasion: "中秋 · 赏月", subtitle: "清风明月，人间团圆", mark: "月" },
  { id: "birthday", name: "生日庆典", occasion: "生日 · 派对", subtitle: "愿新一岁，万事胜意", mark: "★" },
];

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

const newIngredientRow = (): IngredientRow => ({
  rowId: crypto.randomUUID(), name: "", amount: 100, unit: "g", type: "生鲜",
});

export default function Home() {
  const dishFormRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<"menu" | "chef">("menu");
  const [chefView, setChefView] = useState<"overview" | "menuManager" | "banquet">("overview");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customDishes, setCustomDishes] = useState<ManagedDish[]>([]);
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([newIngredientRow()]);
  const [imagePreview, setImagePreview] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dishSubmitting, setDishSubmitting] = useState(false);
  const [recipeImporting, setRecipeImporting] = useState(false);
  const [recipeImportText, setRecipeImportText] = useState("");
  const [recipeScreenshots, setRecipeScreenshots] = useState<RecipeScreenshot[]>([]);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft | null>(null);
  const [banquetTemplate, setBanquetTemplate] = useState<BanquetTemplate>("home");
  const [banquetOrderId, setBanquetOrderId] = useState("");
  const [banquetItems, setBanquetItems] = useState<BanquetItem[]>([]);
  const [banquetDishId, setBanquetDishId] = useState("");
  const [banquetTitle, setBanquetTitle] = useState("今晚家宴");
  const [banquetDate, setBanquetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [banquetMessage, setBanquetMessage] = useState("为喜欢的人认真做一桌饭");
  const [notice, setNotice] = useState("");

  const allDishes = useMemo(() => [...dishes, ...customDishes.filter((dish) => dish.active)], [customDishes]);
  const dishCatalog = useMemo(() => [...dishes, ...customDishes], [customDishes]);
  const menuCategories = useMemo(() => Array.from(new Set([...categories, ...allDishes.map((dish) => dish.category)])), [allDishes]);
  const filteredDishes = activeCategory === "全部"
    ? allDishes
    : allDishes.filter((dish) => dish.category === activeCategory);

  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const cartItems = allDishes
    .filter((dish) => cart[dish.id])
    .map((dish) => ({ ...dish, quantity: cart[dish.id] }));
  const activeBanquetTemplate = banquetTemplates.find((template) => template.id === banquetTemplate) || banquetTemplates[0];
  const selectedBanquetOrder = orders.find((order) => order.id === banquetOrderId);

  const courseForDish = (dish?: Dish): BanquetCourse => {
    const text = `${dish?.name || ""}${dish?.category || ""}`;
    if (/[汤羹饮品甜品糖水羹]/.test(text)) return "soup";
    if (/[饭面粉粥饼包馒头饺主食]/.test(text)) return "staple";
    if (/[凉拌冷盘沙拉前菜卤味]/.test(text)) return "starter";
    return "main";
  };

  const banquetDishes = banquetItems.map((item) => ({ ...item, dish: dishCatalog.find((dish) => dish.id === item.dishId) })).filter((item): item is BanquetItem & { dish: Dish } => Boolean(item.dish));

  const updateQuantity = (dishId: string, change: number) => {
    setCart((current) => {
      const next = Math.max(0, (current[dishId] || 0) + change);
      const updated = { ...current, [dishId]: next };
      if (next === 0) delete updated[dishId];
      return updated;
    });
  };

  const composeFromOrder = (orderId: string) => {
    setBanquetOrderId(orderId);
    const order = orders.find((item) => item.id === orderId);
    if (!order) {
      setBanquetItems([]);
      return;
    }
    const uniqueIds = Array.from(new Set(parseItems(order).map((item) => item.dishId)));
    setBanquetItems(uniqueIds.map((dishId) => ({ dishId, course: courseForDish(dishCatalog.find((dish) => dish.id === dishId)) })));
    setBanquetTitle(`${order.customerName}的私房晚宴`);
    setBanquetDate(order.mealDate);
    setBanquetMessage(order.note ? `今日心意：${order.note}` : `为 ${order.guestCount} 位朋友认真准备的一桌饭`);
    setNotice(`已把 ${uniqueIds.length} 道菜自动排入宴席菜单`);
  };

  const addBanquetDish = () => {
    if (!banquetDishId) return;
    if (banquetItems.some((item) => item.dishId === banquetDishId)) {
      setNotice("这道菜已经在宴席菜单中了");
      return;
    }
    const dish = dishCatalog.find((item) => item.id === banquetDishId);
    setBanquetItems((current) => [...current, { dishId: banquetDishId, course: courseForDish(dish) }]);
    setBanquetDishId("");
  };

  const updateBanquetCourse = (dishId: string, course: BanquetCourse) => {
    setBanquetItems((current) => current.map((item) => item.dishId === dishId ? { ...item, course } : item));
  };

  const moveBanquetDish = (dishId: string, direction: -1 | 1) => {
    setBanquetItems((current) => {
      const index = current.findIndex((item) => item.dishId === dishId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const printBanquetMenu = () => {
    if (!banquetItems.length) {
      setNotice("请先从订单或菜谱库中加入菜品");
      return;
    }
    document.body.classList.add("printing-menu");
    const cleanup = () => document.body.classList.remove("printing-menu");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => window.print(), 80);
    window.setTimeout(cleanup, 3000);
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

  const loadDishes = async () => {
    try {
      const response = await fetch("/api/dishes", { cache: "no-store" });
      const data = await response.json() as { dishes?: ManagedDish[]; error?: string };
      if (!response.ok) throw new Error(data.error || "菜单加载失败");
      setCustomDishes(data.dishes || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "菜单加载失败");
    }
  };

  useEffect(() => {
    if (mode === "chef") {
      loadOrders();
      loadDishes();
    }
  }, [mode]);

  useEffect(() => {
    loadDishes();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => {
    recipeScreenshots.forEach((screenshot) => URL.revokeObjectURL(screenshot.preview));
  }, [recipeScreenshots]);

  const shoppingList = useMemo(() => {
    const totals = new Map<string, { name: string; amount: number; unit: string; type: string }>();
    orders.filter((order) => order.status !== "done").forEach((order) => {
      parseItems(order).forEach((item) => {
        const dish = dishCatalog.find((candidate) => candidate.id === item.dishId);
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
  }, [orders, dishCatalog]);

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

  const updateIngredient = (rowId: string, field: keyof Ingredient, value: string) => {
    setIngredientRows((current) => current.map((row) => row.rowId === rowId
      ? { ...row, [field]: field === "amount" ? Number(value) : value }
      : row));
  };

  const previewLocalImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImagePreview(file ? URL.createObjectURL(file) : "");
  };

  const selectRecipeScreenshots = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 4);
    setRecipeScreenshots(files.map((file) => ({ file, preview: URL.createObjectURL(file) })));
    setRecipeDraft(null);
  };

  const fillDishForm = (draft: RecipeDraft) => {
    const form = dishFormRef.current;
    if (!form) return;
    const setValue = (name: string, value: string) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.value = value;
    };
    setValue("name", draft.name);
    setValue("category", draft.category);
    setValue("flavor", draft.flavor);
    setValue("minutes", String(draft.minutes));
    setValue("description", draft.description);
    setValue("source", draft.source);
    setValue("steps", draft.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"));
    setIngredientRows(draft.ingredients.length
      ? draft.ingredients.map((ingredient) => ({ ...ingredient, rowId: crypto.randomUUID() }))
      : [newIngredientRow()]);
    window.setTimeout(() => form.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const analyzeRecipe = async () => {
    if (!recipeScreenshots.length && !recipeImportText.trim()) {
      setNotice("请先上传菜谱截图，或粘贴菜谱文字");
      return;
    }
    setRecipeImporting(true);
    try {
      const form = new FormData();
      recipeScreenshots.forEach(({ file }) => form.append("images", file));
      form.set("text", recipeImportText);
      const response = await fetch("/api/recipe-import", { method: "POST", body: form });
      const data = await response.json() as { draft?: RecipeDraft; mode?: string; error?: string };
      if (!response.ok || !data.draft) throw new Error(data.error || "菜谱识别失败");
      setRecipeDraft(data.draft);
      fillDishForm(data.draft);
      const summary = `${data.draft.ingredients.length} 种食材、${data.draft.steps.length} 个步骤`;
      setNotice(data.mode === "text-fallback" ? `已用文字模式拆解 ${summary}，请校对` : `识别完成：${summary}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "菜谱识别失败，请稍后重试");
    } finally {
      setRecipeImporting(false);
    }
  };

  const submitDish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDishSubmitting(true);
    const form = new FormData(event.currentTarget);
    form.set("ingredients", JSON.stringify(ingredientRows.map(({ rowId: _rowId, ...ingredient }) => ingredient)));
    try {
      const response = await fetch("/api/dishes", { method: "POST", body: form });
      const data = await response.json() as { dish?: ManagedDish; error?: string };
      if (!response.ok || !data.dish) throw new Error(data.error || "菜品保存失败");
      setCustomDishes((current) => [data.dish!, ...current]);
      event.currentTarget.reset();
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
      setImagePreview("");
      setIngredientRows([newIngredientRow()]);
      setRecipeDraft(null);
      setRecipeImportText("");
      setRecipeScreenshots([]);
      setNotice(`“${data.dish.name}”已加入菜单`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "菜品保存失败");
    } finally {
      setDishSubmitting(false);
    }
  };

  const toggleDish = async (dish: ManagedDish) => {
    try {
      const response = await fetch("/api/dishes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: dish.id, active: !dish.active }),
      });
      const data = await response.json() as { dish?: ManagedDish; error?: string };
      if (!response.ok || !data.dish) throw new Error(data.error || "更新失败");
      setCustomDishes((current) => current.map((item) => item.id === dish.id ? data.dish! : item));
      setCart((current) => {
        if (data.dish!.active) return current;
        const next = { ...current };
        delete next[dish.id];
        return next;
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "菜品状态更新失败");
    }
  };

  const deleteDish = async (dish: ManagedDish) => {
    if (!window.confirm(`确定删除“${dish.name}”吗？已有订单会保留菜名记录，但它不会再出现在菜单中。`)) return;
    try {
      const response = await fetch(`/api/dishes?id=${encodeURIComponent(dish.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "删除失败");
      setCustomDishes((current) => current.filter((item) => item.id !== dish.id));
      setCart((current) => {
        const next = { ...current };
        delete next[dish.id];
        return next;
      });
      setNotice(`“${dish.name}”已从菜单删除`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除失败");
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
              {["全部", ...menuCategories].map((category) => (
                <button key={category} className={activeCategory === category ? "active" : ""} onClick={() => setActiveCategory(category)}>{category}</button>
              ))}
            </div>
            <div className="dish-grid">
              {filteredDishes.map((dish) => {
                const quantity = cart[dish.id] || 0;
                return (
                  <article className="dish-card" key={dish.id}>
                    <div className={`dish-art tone-${dish.tone}`}>
                      {dish.imageUrl ? <img className="dish-photo" src={dish.imageUrl} alt={dish.name} /> : <span>{dish.emoji}</span>}
                      <small>{dish.category}</small>
                    </div>
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
            <div><span className="eyebrow">KITCHEN DASHBOARD</span><h1>主厨工作台</h1><p>订单、备菜、采购和菜单，都在这里管理。</p></div>
            {chefView === "overview" && <button className="refresh-button" onClick={loadOrders} disabled={loadingOrders}>{loadingOrders ? "刷新中…" : "刷新订单"}</button>}
          </div>
          <div className="chef-subnav" role="tablist" aria-label="主厨工具">
            <button className={chefView === "overview" ? "active" : ""} onClick={() => setChefView("overview")}>订单与采购</button>
            <button className={chefView === "menuManager" ? "active" : ""} onClick={() => setChefView("menuManager")}>菜单管理 <span>{customDishes.filter((dish) => dish.active).length + dishes.length}</span></button>
            <button className={chefView === "banquet" ? "active" : ""} onClick={() => setChefView("banquet")}>宴席菜单 <span>{banquetItems.length}</span></button>
          </div>

          {chefView === "overview" ? (
            <>
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
                            {parseItems(order).map((item) => <div key={item.dishId}><span>{dishCatalog.find((dish) => dish.id === item.dishId)?.name || "已下架菜品"}</span><strong>× {item.quantity}</strong></div>)}
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
            </>
          ) : chefView === "menuManager" ? (
            <>
              <section className="smart-import panel" aria-labelledby="smart-import-title">
                <div className="smart-import-heading">
                  <div className="smart-import-icon" aria-hidden="true">识</div>
                  <div><span>SMART RECIPE IMPORT</span><h2 id="smart-import-title">智能菜谱录入</h2><p>上传菜谱截图，自动拆出菜名、食材、用量和烹饪步骤，再由你确认。</p></div>
                  <em>先识别 · 后上架</em>
                </div>
                <div className="smart-import-body">
                  <div className="smart-import-grid">
                    <div className="screenshot-import">
                      <label className="recipe-upload">
                        <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={selectRecipeScreenshots} />
                        <span>＋</span><strong>{recipeScreenshots.length ? "重新选择截图" : "上传菜谱截图"}</strong><small>最多 4 张，可同时上传食材页和步骤页</small>
                      </label>
                      {recipeScreenshots.length > 0 && <div className="screenshot-previews">{recipeScreenshots.map((screenshot, index) => <figure key={`${screenshot.file.name}-${index}`}><img src={screenshot.preview} alt={`菜谱截图 ${index + 1}`} /><figcaption>{index + 1}</figcaption></figure>)}</div>}
                    </div>
                    <div className="import-or"><span>或</span></div>
                    <label className="recipe-text-import"><span>粘贴菜谱文字</span><textarea value={recipeImportText} onChange={(event) => { setRecipeImportText(event.target.value); setRecipeDraft(null); }} placeholder={'例如：\n大虾烧白菜\n食材：大虾 250g、白菜 500g……\n步骤：1. 处理大虾……'} /><small>没有截图时也能自动拆解；有截图时可补充模糊内容</small></label>
                  </div>
                  <div className="smart-import-actions">
                    <p>识别结果只会填入下方草稿，不会自动发布。</p>
                    <button type="button" onClick={analyzeRecipe} disabled={recipeImporting}>{recipeImporting ? "正在读菜谱…" : "开始识别并填入"}<span>→</span></button>
                  </div>
                  {recipeDraft && <div className="import-result" role="status"><div><strong>✓ 已生成“{recipeDraft.name}”草稿</strong><span>{recipeDraft.ingredients.length} 种食材 · {recipeDraft.steps.length} 个步骤 · 来源：{recipeDraft.source || "待确认"}</span></div>{recipeDraft.confidenceNotes.length > 0 && <p>请核对：{recipeDraft.confidenceNotes.join("；")}</p>}</div>}
                </div>
              </section>

              <div className="manager-grid">
              <form ref={dishFormRef} className="dish-form panel" onSubmit={submitDish}>
                <div className="panel-title"><div><span>NEW DISH</span><h2>添加一道新菜</h2></div><small>保存后立即上架</small></div>
                <div className="dish-form-body">
                  <div className="field-grid">
                    <label><span>菜名 *</span><input name="name" required maxLength={40} placeholder="例如：糖醋小排" /></label>
                    <label><span>菜系分类 *</span><input name="category" required maxLength={30} list="dish-categories" placeholder="例如：江浙风味" /><datalist id="dish-categories">{menuCategories.map((category) => <option value={category} key={category} />)}</datalist></label>
                    <label><span>口味标签</span><input name="flavor" maxLength={30} placeholder="例如：酸甜 · 不辣" /></label>
                    <label><span>预计烹饪时间</span><div className="input-suffix"><input name="minutes" type="number" min="5" max="360" defaultValue="30" required /><b>分钟</b></div></label>
                    <label><span>菜谱来源</span><input name="source" maxLength={80} placeholder="例如：食遇日记 · 村驴" /></label>
                  </div>
                  <label className="wide-field"><span>菜品介绍</span><textarea name="description" maxLength={180} placeholder="简单介绍这道菜的味道和特色…" /></label>
                  <label className="wide-field"><span>烹饪步骤</span><textarea className="steps-textarea" name="steps" maxLength={12000} placeholder={'每行填写一个步骤，例如：\n1. 大虾剪去虾须，开背去虾线\n2. 白菜切块，小火煸炒至变软'} /></label>

                  <fieldset className="photo-fieldset">
                    <legend>菜品照片</legend>
                    <div className="photo-options">
                      <label className="upload-box">
                        <input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={previewLocalImage} />
                        <span className="upload-icon">＋</span><strong>从本地上传照片</strong><small>JPG、PNG、WebP 或 GIF，最大 6MB</small>
                      </label>
                      <div className="or-divider"><span>或</span></div>
                      <label className="network-photo"><span>粘贴网络图片地址</span><input name="imageUrl" type="url" placeholder="https://example.com/dish.jpg" onChange={(event) => setImagePreview(event.target.value)} /><small>请使用你有权使用的图片地址</small></label>
                      <div className={`photo-preview ${imagePreview ? "has-image" : ""}`}>{imagePreview ? <img src={imagePreview} alt="菜品图片预览" /> : <><span>📷</span><small>照片预览</small></>}</div>
                    </div>
                  </fieldset>

                  <fieldset className="ingredient-fieldset">
                    <div className="fieldset-heading"><div><legend>食材与调料 *</legend><small>按每道菜约 3–4 人份填写，采购清单会自动合并</small></div><button type="button" onClick={() => setIngredientRows((current) => [...current, newIngredientRow()])}>＋ 添加一行</button></div>
                    <div className="ingredient-labels"><span>名称</span><span>数量</span><span>单位</span><span>分类</span><span></span></div>
                    {ingredientRows.map((row) => (
                      <div className="ingredient-row" key={row.rowId}>
                        <input value={row.name} onChange={(event) => updateIngredient(row.rowId, "name", event.target.value)} required placeholder="鸡中翅" aria-label="食材名称" />
                        <input value={row.amount} onChange={(event) => updateIngredient(row.rowId, "amount", event.target.value)} required type="number" min="0.1" step="0.1" aria-label="食材数量" />
                        <input value={row.unit} onChange={(event) => updateIngredient(row.rowId, "unit", event.target.value)} required placeholder="g" aria-label="食材单位" />
                        <select value={row.type} onChange={(event) => updateIngredient(row.rowId, "type", event.target.value)} aria-label="食材分类"><option>生鲜</option><option>蔬菜</option><option>调料</option><option>其他</option></select>
                        <button type="button" aria-label="删除这一行" disabled={ingredientRows.length === 1} onClick={() => setIngredientRows((current) => current.filter((item) => item.rowId !== row.rowId))}>×</button>
                      </div>
                    ))}
                  </fieldset>
                  <button className="primary-button save-dish" disabled={dishSubmitting}>{dishSubmitting ? "正在保存菜品…" : "保存并上架"}<span>→</span></button>
                </div>
              </form>

              <aside className="managed-menu panel">
                <div className="panel-title"><div><span>YOUR MENU</span><h2>我的自定义菜式</h2></div><small>{customDishes.length} 道</small></div>
                <div className="built-in-note"><span>固定菜单</span><strong>{dishes.length} 道经典菜</strong><p>固定菜式会一直保留；你添加的新菜可以随时上下架。</p></div>
                {customDishes.length === 0 ? <div className="empty compact"><span>🥢</span><strong>还没有自定义菜式</strong><p>填写左侧表单，第一道新菜就会出现在朋友的菜单上。</p></div> : (
                  <div className="managed-dish-list">
                    {customDishes.map((dish) => (
                      <article className={!dish.active ? "managed-dish inactive" : "managed-dish"} key={dish.id}>
                        <div className="managed-thumb">{dish.imageUrl ? <img src={dish.imageUrl} alt="" /> : <span>🍽️</span>}</div>
                        <div className="managed-copy"><div><strong>{dish.name}</strong><em>{dish.active ? "已上架" : "已下架"}</em></div><p>{dish.category} · {dish.flavor}</p><small>{dish.ingredients.length} 种食材 · {dish.steps?.length || 0} 个步骤 · 约 {dish.minutes} 分钟</small></div>
                        <div className="managed-actions"><button onClick={() => toggleDish(dish)}>{dish.active ? "下架" : "上架"}</button><button className="danger" onClick={() => deleteDish(dish)}>删除</button></div>
                      </article>
                    ))}
                  </div>
                )}
              </aside>
              </div>
            </>
          ) : (
            <section className="banquet-builder" aria-labelledby="banquet-builder-title">
              <div className="banquet-tools panel">
                <div className="panel-title"><div><span>MENU COMPOSER</span><h2 id="banquet-builder-title">宴席菜单编排器</h2></div><small>点单 → 编排 → 导出</small></div>
                <div className="banquet-tool-body">
                  <div className="banquet-step">
                    <div className="banquet-step-title"><b>1</b><div><strong>从朋友的点单开始</strong><small>自动把已点菜品排入合适栏目</small></div></div>
                    <select value={banquetOrderId} onChange={(event) => composeFromOrder(event.target.value)} aria-label="选择朋友的订单">
                      <option value="">选择一个订单…</option>
                      {orders.map((order) => <option value={order.id} key={order.id}>{order.customerName} · {order.mealDate} · {parseItems(order).length} 道菜</option>)}
                    </select>
                    {orders.length === 0 && <p className="banquet-hint">还没有订单，也可以直接从下方菜谱库添加菜品。</p>}
                  </div>

                  <div className="banquet-step">
                    <div className="banquet-step-title"><b>2</b><div><strong>选择场景模板</strong><small>内容不变，风格随场合切换</small></div></div>
                    <div className="template-picker">
                      {banquetTemplates.map((template) => <button type="button" className={banquetTemplate === template.id ? `template-choice ${template.id} active` : `template-choice ${template.id}`} key={template.id} onClick={() => setBanquetTemplate(template.id)}><span>{template.mark}</span><strong>{template.name}</strong><small>{template.occasion}</small></button>)}
                    </div>
                  </div>

                  <div className="banquet-step">
                    <div className="banquet-step-title"><b>3</b><div><strong>填写这场宴席</strong><small>标题和心意会显示在菜单卡上</small></div></div>
                    <div className="banquet-fields">
                      <label><span>菜单标题</span><input value={banquetTitle} onChange={(event) => setBanquetTitle(event.target.value)} maxLength={32} /></label>
                      <label><span>用餐日期</span><input type="date" value={banquetDate} onChange={(event) => setBanquetDate(event.target.value)} /></label>
                      <label className="wide"><span>写给客人的话</span><input value={banquetMessage} onChange={(event) => setBanquetMessage(event.target.value)} maxLength={70} /></label>
                    </div>
                  </div>

                  <div className="banquet-step">
                    <div className="banquet-step-title"><b>4</b><div><strong>调整菜品顺序</strong><small>可从菜谱库补菜，或更换所属栏目</small></div></div>
                    <div className="banquet-add-row"><select value={banquetDishId} onChange={(event) => setBanquetDishId(event.target.value)} aria-label="从菜谱库选择菜品"><option value="">从我的菜谱库添加…</option>{dishCatalog.filter((dish) => !banquetItems.some((item) => item.dishId === dish.id)).map((dish) => <option value={dish.id} key={dish.id}>{dish.name} · {dish.category}</option>)}</select><button type="button" onClick={addBanquetDish}>＋ 加入</button></div>
                    {banquetDishes.length === 0 ? <div className="banquet-empty"><span>宴</span><p>选择一个订单，或从菜谱库加入第一道菜。</p></div> : <div className="banquet-arrangement">{banquetDishes.map(({ dish, course }, index) => <article key={dish.id}><span className="arrange-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{dish.name}</strong><small>{dish.flavor} · 约 {dish.minutes} 分钟</small></div><select value={course} onChange={(event) => updateBanquetCourse(dish.id, event.target.value as BanquetCourse)} aria-label={`${dish.name}所属栏目`}>{banquetCourses.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><div className="arrange-actions"><button type="button" onClick={() => moveBanquetDish(dish.id, -1)} disabled={index === 0} aria-label={`上移${dish.name}`}>↑</button><button type="button" onClick={() => moveBanquetDish(dish.id, 1)} disabled={index === banquetDishes.length - 1} aria-label={`下移${dish.name}`}>↓</button><button type="button" className="remove" onClick={() => setBanquetItems((current) => current.filter((item) => item.dishId !== dish.id))} aria-label={`移除${dish.name}`}>×</button></div></article>)}</div>}
                  </div>
                </div>
              </div>

              <aside className="banquet-preview-wrap">
                <div className={`banquet-preview template-${banquetTemplate}`}>
                  <div className="menu-card-ornament" aria-hidden="true"><span>{activeBanquetTemplate.mark}</span></div>
                  <div className="menu-card-header">
                    <small>好好吃饭 · PRIVATE KITCHEN</small>
                    <h2>{banquetTitle || "今晚家宴"}</h2>
                    <p>{activeBanquetTemplate.subtitle}</p>
                    <div><span>{banquetDate || "择日相聚"}</span>{selectedBanquetOrder && <span>{selectedBanquetOrder.guestCount} 位宾客</span>}</div>
                  </div>
                  <div className="menu-card-courses">
                    {banquetCourses.map((course) => {
                      const courseDishes = banquetDishes.filter((item) => item.course === course.id);
                      if (!courseDishes.length) return null;
                      return <section key={course.id}><h3><span>{course.label}</span><small>{course.english}</small></h3><div>{courseDishes.map(({ dish }) => <article key={dish.id}><strong>{dish.name}</strong><span>{dish.description || dish.flavor}</span></article>)}</div></section>;
                    })}
                    {banquetDishes.length === 0 && <div className="menu-card-placeholder"><span>MENU</span><p>加入菜品后，这里会生成完整的宴席菜单。</p></div>}
                  </div>
                  <div className="menu-card-footer"><span>—</span><p>{banquetMessage || "愿今晚有好味，也有好心情"}</p><small>CHEF&apos;S TABLE · 私房呈献</small></div>
                </div>
                <div className="preview-actions"><button type="button" className="quiet" onClick={() => { setBanquetItems([]); setBanquetOrderId(""); }}>清空重排</button><button type="button" className="export" onClick={printBanquetMenu}>导出 / 打印菜单 <span>↗</span></button></div>
                <p className="preview-tip">导出后可保存为 PDF，也可以直接打印成桌面菜单。</p>
              </aside>
            </section>
          )}
        </section>
      )}

      {cartOpen && (
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setCartOpen(false)}>
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="已选菜单">
            <button className="close" onClick={() => setCartOpen(false)} aria-label="关闭">×</button>
            <span className="eyebrow">YOUR HOME MENU</span><h2>这顿想吃这些</h2>
            <div className="cart-lines">{cartItems.map((item) => <div key={item.id}><span className="mini-emoji">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.emoji}</span><span><strong>{item.name}</strong><small>{item.flavor}</small></span><div><button onClick={() => updateQuantity(item.id, -1)}>−</button><b>{item.quantity}</b><button onClick={() => updateQuantity(item.id, 1)}>+</button></div></div>)}</div>
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
