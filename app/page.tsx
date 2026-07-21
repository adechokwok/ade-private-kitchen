"use client";

import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { categories, dishes, type Dish, type Ingredient } from "./menu";

type Cart = Record<string, number>;
type OrderItem = { dishId: string; quantity: number };
type DishSnapshot = { dishId: string; name: string; baseServings: number; ingredients: Ingredient[]; steps?: string[]; minutes?: number; recipeSummary?: string; source?: string; difficulty?: string };
type Order = {
  id: string;
  customerName: string;
  mealDate: string;
  guestCount: number;
  note: string;
  dishes: string;
  dishSnapshot: string;
  inviteId: string;
  guestToken: string;
  progressNote: string;
  statusUpdatedAt: string;
  status: "new" | "confirmed" | "shopping" | "preparing" | "done" | "cancelled";
  createdAt: string;
};
type ManagedDish = Dish & { active: boolean; isCustom: true; createdAt?: string };
type IngredientRow = Ingredient & { rowId: string };
type MenuCategory = { id: string; name: string; sortOrder: number };
type PantryItem = { id: string; name: string; amount: number; unit: string; type: Ingredient["type"]; location: string };
type RecipeDraft = {
  name: string;
  category: string;
  description: string;
  slogan: string;
  flavor: string;
  minutes: number;
  baseServings?: number;
  source: string;
  ingredients: Ingredient[];
  steps: string[];
  confidenceNotes: string[];
  featured?: boolean;
  available?: boolean;
  soldOut?: boolean;
  seasons?: string[];
  occasions?: string[];
  dietary?: string[];
  imagePosition?: string;
  difficulty?: string;
  recipeSummary?: string;
  missingChecks?: string[];
  substitutions?: Array<{ ingredient: string; alternatives: string[]; note: string }>;
};
type DinnerInvite = { id: string; token: string; title: string; message: string; mealDate: string; theme: "warm" | "romance" | "fine" | "festival"; dishIds: string[]; recommendedDishIds: string[]; active: boolean; createdAt: string };
type DinnerJournal = { id: string; inviteId: string; title: string; note: string; imageUrls: string[]; createdAt: string };
type RecipeScreenshot = { id: string; file: File; preview: string; rotation: 0 | 90 | 180 | 270 };
type ImageCrop = { x: number; y: number; zoom: number };
type BanquetCourse = "starter" | "main" | "staple" | "soup";
type BanquetItem = { dishId: string; course: BanquetCourse };
type BanquetTemplate = "home" | "romance" | "fine" | "spring" | "midautumn" | "birthday" | "housewarming" | "summer" | "christmas" | "brunch";
type ChefView = "accepting" | "shopping" | "cooking" | "serving" | "menuManager" | "invitations";

const banquetCourses: Array<{ id: BanquetCourse; label: string; english: string }> = [
  { id: "starter", label: "开胃前菜", english: "APPETIZER" },
  { id: "main", label: "主厨热菜", english: "MAIN COURSE" },
  { id: "staple", label: "主食点心", english: "STAPLE" },
  { id: "soup", label: "汤饮甜品", english: "SOUP & DESSERT" },
];

const banquetTemplates: Array<{ id: BanquetTemplate; name: string; occasion: string; subtitle: string; mark: string; defaultTitle: string; defaultMessage: string }> = [
  { id: "home", name: "温馨家宴", occasion: "亲友小聚", subtitle: "一桌家常味，都是惦念", mark: "家", defaultTitle: "今晚家宴", defaultMessage: "为喜欢的人认真做一桌饭" },
  { id: "romance", name: "二人世界", occasion: "约会 · 纪念日", subtitle: "TONIGHT, JUST FOR US", mark: "♡", defaultTitle: "两个人的晚餐", defaultMessage: "把今晚留给好菜，也留给彼此" },
  { id: "fine", name: "Fine Dining", occasion: "正式晚宴", subtitle: "A PRIVATE DINING EXPERIENCE", mark: "FD", defaultTitle: "主厨私宴", defaultMessage: "一道一道，认真呈上今晚的心意" },
  { id: "spring", name: "新春团圆", occasion: "春节 · 除夕", subtitle: "岁岁常欢愉，年年皆胜意", mark: "春", defaultTitle: "新春团圆宴", defaultMessage: "围坐一桌，共尝新岁好味" },
  { id: "midautumn", name: "中秋雅宴", occasion: "中秋 · 赏月", subtitle: "清风明月，人间团圆", mark: "月", defaultTitle: "月下团圆宴", defaultMessage: "月满杯满，愿人长久" },
  { id: "birthday", name: "生日烛光", occasion: "生日 · 庆祝", subtitle: "MAKE A WISH TONIGHT", mark: "★", defaultTitle: "生日晚宴", defaultMessage: "愿新一岁有好味，也有更多好事发生" },
  { id: "housewarming", name: "乔迁暖居", occasion: "新家 · 暖房", subtitle: "NEW HOME, WARM TABLE", mark: "宅", defaultTitle: "乔迁暖居宴", defaultMessage: "新居有烟火，往后皆是好日子" },
  { id: "summer", name: "夏日晚风", occasion: "露台 · 小聚", subtitle: "A BREEZY SUMMER TABLE", mark: "夏", defaultTitle: "夏日晚风宴", defaultMessage: "趁晚风温柔，一起慢慢吃饭" },
  { id: "christmas", name: "冬日圣诞", occasion: "圣诞 · 冬夜", subtitle: "A COZY WINTER FEAST", mark: "✦", defaultTitle: "冬日圣诞小宴", defaultMessage: "灯火温暖，愿今晚的快乐如约而至" },
  { id: "brunch", name: "周末早午餐", occasion: "周末 · Brunch", subtitle: "SLOW MORNING, GOOD FOOD", mark: "☀", defaultTitle: "周末早午餐", defaultMessage: "睡到自然醒，再认真吃一顿" },
];

const statusLabel = { new: "待确认", confirmed: "已确认", shopping: "买菜中", preparing: "制作中", done: "已完成", cancelled: "已取消" };
const cookingStages: Array<{ id: Order["status"]; label: string }> = [{ id: "confirmed", label: "接单" }, { id: "shopping", label: "买菜" }, { id: "preparing", label: "制作" }, { id: "done", label: "开饭" }];
const statusProgressIndex: Record<Order["status"], number> = { new: -1, confirmed: 0, shopping: 1, preparing: 2, done: 3, cancelled: -1 };
const isArchivedOrder = (order: Order) => order.status === "done" || order.status === "cancelled";
const categoryEmoji: Record<string, string> = {
  全部: "✦", 家常热炒: "🍳", 江浙风味: "🌿", 川湘小馆: "🌶", 汤羹主食: "🥣", 海鲜: "🦐", 家常菜: "🥢",
};
function parseItems(order: Order): OrderItem[] {
  try {
    return JSON.parse(order.dishes) as OrderItem[];
  } catch {
    return [];
  }
}

function parseDishSnapshot(order: Order): DishSnapshot[] {
  try { return JSON.parse(order.dishSnapshot || "[]") as DishSnapshot[]; } catch { return []; }
}

function formatAmount(value: number, unit: string) {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  return `${rounded}${unit}`;
}

function formatClockMinutes(value: number) {
  const normalized = ((value % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function formatCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function prepActionForIngredient(type: string, name: string) {
  if (type === "生鲜") return /肉|鸡|鸭|牛|羊|排骨/.test(name) ? "分切 / 腌制" : "清洗 / 沥干";
  if (type === "蔬菜") return /葱|姜|蒜|椒/.test(name) ? "清洗 / 切配" : "清洗 / 改刀";
  if (type === "调料") return "提前称量";
  return "备齐待用";
}

const ingredientAliases: Record<string, string> = {
  香葱: "小葱", 葱花: "小葱", 青葱: "小葱", 姜: "生姜", 姜片: "生姜", 蒜: "大蒜", 蒜瓣: "大蒜",
  酱油: "生抽", 食盐: "盐", 白砂糖: "白糖", 鸡蛋液: "鸡蛋", 土豆仔: "土豆", 西红柿: "番茄",
};

function normalizedIngredientName(name: string) {
  const compact = name.trim().replace(/[（(].*?[）)]/g, "").replace(/\s+/g, "");
  return ingredientAliases[compact] || compact;
}

function shoppingLocation(type: string) {
  if (type === "生鲜" || type === "蔬菜") return "菜市场 / 生鲜区";
  if (type === "调料") return "调味品区";
  return "超市其他区";
}

function createClientRowId() {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues === "function") {
    const values = new Uint32Array(2);
    webCrypto.getRandomValues(values);
    return `row-${values[0].toString(36)}-${values[1].toString(36)}`;
  }
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const newIngredientRow = (): IngredientRow => ({
  rowId: createClientRowId(), name: "", amount: 100, unit: "g", type: "生鲜",
});

const defaultImageCrop: ImageCrop = { x: 50, y: 50, zoom: 1 };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseImageCrop(value?: string): ImageCrop {
  if (value === "top") return { x: 50, y: 18, zoom: 1 };
  if (value === "bottom") return { x: 50, y: 82, zoom: 1 };
  if (!value || value === "center") return { ...defaultImageCrop };
  const [rawX, rawY, rawZoom] = value.split(":").map(Number);
  if (![rawX, rawY, rawZoom].every(Number.isFinite)) return { ...defaultImageCrop };
  return { x: clamp(rawX, 0, 100), y: clamp(rawY, 0, 100), zoom: clamp(rawZoom, 1, 1.8) };
}

function serializeImageCrop(crop: ImageCrop) {
  return `${Math.round(crop.x)}:${Math.round(crop.y)}:${crop.zoom.toFixed(2)}`;
}

function dishImageStyle(value?: string) {
  const crop = parseImageCrop(value);
  return {
    objectPosition: `${crop.x}% ${crop.y}%`,
    transform: `scale(${crop.zoom})`,
    transformOrigin: `${crop.x}% ${crop.y}%`,
  };
}

function findSmartImageCrop(image: HTMLImageElement): ImageCrop {
  const canvas = document.createElement("canvas");
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { ...defaultImageCrop, zoom: 1.06 };
  try {
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    let weightedX = 0;
    let weightedY = 0;
    let total = 0;
    const luminanceAt = (x: number, y: number) => {
      const offset = (y * size + x) * 4;
      return pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114;
    };
    for (let y = 2; y < size - 2; y += 2) {
      for (let x = 2; x < size - 2; x += 2) {
        const offset = (y * size + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
        const edge = Math.abs(luminanceAt(x + 2, y) - luminanceAt(x - 2, y)) + Math.abs(luminanceAt(x, y + 2) - luminanceAt(x, y - 2));
        const centerDistance = Math.hypot(x - size / 2, y - size / 2) / (size * .7);
        const centerPrior = Math.max(0, 1 - centerDistance) * 24;
        const score = Math.pow(Math.max(1, edge * 1.45 + saturation * .35 + centerPrior), 1.35);
        weightedX += x * score;
        weightedY += y * score;
        total += score;
      }
    }
    if (!total) return { ...defaultImageCrop, zoom: 1.06 };
    return {
      x: clamp(weightedX / total / (size - 1) * 100, 18, 82),
      y: clamp(weightedY / total / (size - 1) * 100, 16, 84),
      zoom: 1.06,
    };
  } catch {
    return { ...defaultImageCrop, zoom: 1.06 };
  }
}

export default function Home({ initialMode = "menu", chefUser = "", initialInviteToken = "" }: { initialMode?: "menu" | "chef"; chefUser?: string; initialInviteToken?: string }) {
  const dishFormRef = useRef<HTMLFormElement>(null);
  const coverImageRef = useRef<HTMLImageElement>(null);
  const coverDragRef = useRef<{ pointerId: number; clientX: number; clientY: number; crop: ImageCrop } | null>(null);
  const recipeScreenshotUrlsRef = useRef<string[]>([]);
  const mode = initialMode;
  const [chefView, setChefView] = useState<ChefView>("accepting");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customDishes, setCustomDishes] = useState<ManagedDish[]>([]);
  const [managedCategories, setManagedCategories] = useState<MenuCategory[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<ManagedDish | null>(null);
  const [shoppingChecks, setShoppingChecks] = useState<Record<string, boolean>>({});
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([newIngredientRow()]);
  const [imagePreview, setImagePreview] = useState("");
  const [imageCrop, setImageCrop] = useState<ImageCrop>(defaultImageCrop);
  const [autoCropPending, setAutoCropPending] = useState(false);
  const [cropMode, setCropMode] = useState<"" | "auto" | "manual" | "saved">("");
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dishSubmitting, setDishSubmitting] = useState(false);
  const [copyGenerating, setCopyGenerating] = useState<"description" | "slogan" | null>(null);
  const [recipeImporting, setRecipeImporting] = useState(false);
  const [recipeImportText, setRecipeImportText] = useState("");
  const [recipeScreenshots, setRecipeScreenshots] = useState<RecipeScreenshot[]>([]);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft | null>(null);
  const [recipeEngine, setRecipeEngine] = useState("Qwen3-VL-Plus");
  const [recipePreferences, setRecipePreferences] = useState("");
  const [invites, setInvites] = useState<DinnerInvite[]>([]);
  const [journals, setJournals] = useState<DinnerJournal[]>([]);
  const [activeInvite, setActiveInvite] = useState<DinnerInvite | null>(null);
  const [inviteLoading, setInviteLoading] = useState(Boolean(initialInviteToken));
  const [orderProgressUrl, setOrderProgressUrl] = useState("");
  const [orderSuccessOpen, setOrderSuccessOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [cookingChecks, setCookingChecks] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem("ade-kitchen-cooking-checks") || "{}"); } catch { return {}; }
  });
  const [banquetTemplate, setBanquetTemplate] = useState<BanquetTemplate>("home");
  const [banquetOrderId, setBanquetOrderId] = useState("");
  const [banquetItems, setBanquetItems] = useState<BanquetItem[]>([]);
  const [banquetDishId, setBanquetDishId] = useState("");
  const [banquetTitle, setBanquetTitle] = useState("今晚家宴");
  const [banquetDate, setBanquetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [banquetMessage, setBanquetMessage] = useState("为喜欢的人认真做一桌饭");
  const [serviceTime, setServiceTime] = useState("18:30");
  const [dishTimers, setDishTimers] = useState<Record<string, number>>({});
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [kitchenOpen, setKitchenOpen] = useState(true);
  const [kitchenStatusSaving, setKitchenStatusSaving] = useState(false);

  const dishCatalog = useMemo<Dish[]>(() => customDishes.length ? customDishes : (initialInviteToken ? [] : dishes), [customDishes, initialInviteToken]);
  const allDishes = useMemo(() => dishCatalog.filter((dish) => dish.active !== false && dish.available !== false), [dishCatalog]);
  const menuCategories = useMemo(() => managedCategories.length
    ? managedCategories.map((category) => category.name).filter((name) => allDishes.some((dish) => dish.category === name))
    : Array.from(new Set([...categories, ...allDishes.map((dish) => dish.category)])), [managedCategories, allDishes]);
  const filteredDishes = activeCategory === "全部"
    ? allDishes
    : allDishes.filter((dish) => dish.category === activeCategory);

  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const cartItems = allDishes
    .filter((dish) => cart[dish.id])
    .map((dish) => ({ ...dish, quantity: cart[dish.id] }));
  const activeBanquetTemplate = banquetTemplates.find((template) => template.id === banquetTemplate) || banquetTemplates[0];
  const selectedBanquetOrder = orders.find((order) => order.id === banquetOrderId);
  const activeOrders = useMemo(() => orders.filter((order) => !isArchivedOrder(order)), [orders]);
  const archivedOrders = useMemo(() => orders.filter(isArchivedOrder), [orders]);
  const acceptingOrders = useMemo(() => activeOrders.filter((order) => order.status === "new"), [activeOrders]);
  const shoppingOrders = useMemo(() => activeOrders.filter((order) => order.status === "confirmed" || order.status === "shopping"), [activeOrders]);
  const productionOrders = useMemo(() => activeOrders.filter((order) => order.status === "shopping" || order.status === "preparing"), [activeOrders]);
  const servingOrders = useMemo(() => activeOrders.filter((order) => order.status === "preparing"), [activeOrders]);
  const recentDoneOrders = useMemo(() => archivedOrders.filter((order) => order.status === "done").slice(0, 8), [archivedOrders]);
  const cookingOrders = useMemo(() => [...activeOrders].sort((left, right) => left.mealDate.localeCompare(right.mealDate) || left.createdAt.localeCompare(right.createdAt)), [activeOrders]);
  const cookingRecipeCount = new Set(activeOrders.flatMap((order) => parseItems(order).map((item) => item.dishId))).size;
  const cookingGuestCount = activeOrders.reduce((sum, order) => sum + order.guestCount, 0);
  const nextMealDate = cookingOrders[0]?.mealDate || "暂无饭局";

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
    setBanquetTitle(`${order.customerName}的${activeBanquetTemplate.name}`);
    setBanquetDate(order.mealDate);
    setBanquetMessage(order.note ? `今日心意：${order.note}` : `为 ${order.guestCount} 位朋友认真准备的一桌饭`);
    setNotice(`已把 ${uniqueIds.length} 道菜自动排入宴席菜单`);
  };

  const selectBanquetTemplate = (template: typeof banquetTemplates[number]) => {
    setBanquetTemplate(template.id);
    setBanquetTitle(selectedBanquetOrder ? `${selectedBanquetOrder.customerName}的${template.name}` : template.defaultTitle);
    setBanquetMessage(selectedBanquetOrder?.note ? `今日心意：${selectedBanquetOrder.note}` : template.defaultMessage);
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

  const loadOrders = async (silent = false) => {
    if (!silent) setLoadingOrders(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      const data = await response.json() as { orders?: Order[]; error?: string };
      if (!response.ok) throw new Error(data.error || "订单加载失败");
      setOrders(data.orders || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "订单加载失败");
    } finally {
      if (!silent) setLoadingOrders(false);
    }
  };

  const loadShoppingChecks = async () => {
    try {
      const response = await fetch("/api/shopping", { cache: "no-store" });
      const data = await response.json() as { checks?: Record<string, boolean> };
      if (response.ok) setShoppingChecks(data.checks || {});
    } catch { /* 主清单仍然可以正常使用 */ }
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

  const loadCategories = async () => {
    try {
      const response = await fetch("/api/categories", { cache: "no-store" });
      const data = await response.json() as { categories?: MenuCategory[] };
      if (response.ok) setManagedCategories(data.categories || []);
    } catch { /* 分类仍可从菜品中自动生成 */ }
  };

  const loadPantry = async () => {
    try {
      const response = await fetch("/api/pantry", { cache: "no-store" });
      const data = await response.json() as { items?: PantryItem[] };
      if (response.ok) setPantryItems(data.items || []);
    } catch { /* 不影响原始采购清单 */ }
  };

  const loadInvites = async () => {
    try {
      const response = await fetch("/api/invites", { cache: "no-store" });
      const data = await response.json() as { invites?: DinnerInvite[]; journals?: DinnerJournal[] };
      if (response.ok) { setInvites(data.invites || []); setJournals(data.journals || []); }
    } catch { /* 不影响订单和菜单管理 */ }
  };

  const loadRecipePreferences = async () => {
    try {
      const response = await fetch("/api/recipe-preferences", { cache: "no-store" });
      const data = await response.json() as { preferences?: string };
      if (response.ok) setRecipePreferences(data.preferences || "");
    } catch { /* 仍可使用默认识别 */ }
  };

  const loadKitchenStatus = async () => {
    try {
      const response = await fetch("/api/kitchen-status", { cache: "no-store" });
      const data = await response.json() as { open?: boolean };
      if (response.ok && typeof data.open === "boolean") setKitchenOpen(data.open);
    } catch { /* 默认保持营业，不阻塞菜单浏览 */ }
  };

  const toggleKitchenStatus = async () => {
    const nextOpen = !kitchenOpen;
    setKitchenStatusSaving(true);
    try {
      const response = await fetch("/api/kitchen-status", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ open: nextOpen }) });
      const data = await response.json() as { open?: boolean; error?: string };
      if (!response.ok || typeof data.open !== "boolean") throw new Error(data.error || "营业状态保存失败");
      setKitchenOpen(data.open);
      setNotice(data.open ? "绿灯已亮，朋友端显示厨房今日营业" : "红灯已亮，朋友端显示厨房今天休息");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "营业状态保存失败");
    } finally {
      setKitchenStatusSaving(false);
    }
  };

  const loadInvite = async (token: string) => {
    setInviteLoading(true);
    try {
      const response = await fetch(`/api/invites/${token}`, { cache: "no-store" });
      const data = await response.json() as { invite?: DinnerInvite; dishes?: ManagedDish[]; error?: string };
      if (!response.ok || !data.invite) throw new Error(data.error || "邀请加载失败");
      setActiveInvite(data.invite);
      setCustomDishes(data.dishes || []);
      setActiveCategory("全部");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "邀请加载失败");
    } finally { setInviteLoading(false); }
  };

  useEffect(() => {
    if (mode === "chef") {
      let timer = 0;
      const bootstrap = window.setTimeout(() => {
        loadOrders(); loadDishes(); loadShoppingChecks(); loadCategories(); loadPantry(); loadInvites(); loadRecipePreferences();
        timer = window.setInterval(() => loadOrders(true), 30000);
      }, 0);
      return () => { window.clearTimeout(bootstrap); if (timer) window.clearInterval(timer); };
    }
  }, [mode]);

  useEffect(() => {
    const bootstrap = window.setTimeout(() => {
      loadKitchenStatus();
      if (initialInviteToken) loadInvite(initialInviteToken);
      else { loadDishes(); loadCategories(); }
    }, 0);
    return () => window.clearTimeout(bootstrap);
  }, [initialInviteToken]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!Object.keys(dishTimers).length) return;
    const timer = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [dishTimers]);

  useEffect(() => () => {
    recipeScreenshotUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    recipeScreenshotUrlsRef.current = [];
  }, []);

  const shoppingList = useMemo(() => {
    const totals = new Map<string, { itemKey: string; name: string; amount: number; unit: string; type: string; location: string; stockUsed: number }>();
    activeOrders.forEach((order) => {
      const snapshots = parseDishSnapshot(order);
      parseItems(order).forEach((item) => {
        const snapshot = snapshots.find((candidate) => candidate.dishId === item.dishId);
        const dish = dishCatalog.find((candidate) => candidate.id === item.dishId);
        const ingredients = snapshot?.ingredients || dish?.ingredients || [];
        const scale = (order.guestCount / (snapshot?.baseServings || dish?.baseServings || 4)) * item.quantity;
        ingredients.forEach((ingredient) => {
          const name = normalizedIngredientName(ingredient.name);
          const key = `${name}-${ingredient.unit}`;
          const current = totals.get(key);
          totals.set(key, {
            itemKey: key,
            ...ingredient,
            name,
            location: shoppingLocation(ingredient.type),
            stockUsed: 0,
            amount: (current?.amount || 0) + ingredient.amount * scale,
          });
        });
      });
    });
    return Array.from(totals.values()).map((item) => {
      const stocked = pantryItems.filter((pantry) => normalizedIngredientName(pantry.name) === item.name && pantry.unit === item.unit).reduce((sum, pantry) => sum + pantry.amount, 0);
      const stockUsed = Math.min(item.amount, stocked);
      return { ...item, stockUsed, amount: Math.max(0, item.amount - stockUsed) };
    }).filter((item) => item.amount > 0.01).sort((a, b) => a.location.localeCompare(b.location, "zh-CN") || a.type.localeCompare(b.type, "zh-CN"));
  }, [activeOrders, dishCatalog, pantryItems]);

  const prepList = useMemo(() => {
    const merged = new Map<string, { key: string; name: string; amount: number; unit: string; type: string; action: string; dishes: Set<string> }>();
    productionOrders.forEach((order) => {
      const snapshots = parseDishSnapshot(order);
      parseItems(order).forEach((item) => {
        const snapshot = snapshots.find((candidate) => candidate.dishId === item.dishId);
        const dish = dishCatalog.find((candidate) => candidate.id === item.dishId);
        const dishName = snapshot?.name || dish?.name || "历史菜品";
        const ingredients = snapshot?.ingredients?.length ? snapshot.ingredients : dish?.ingredients || [];
        const scale = (order.guestCount / (snapshot?.baseServings || dish?.baseServings || 4)) * item.quantity;
        ingredients.forEach((ingredient) => {
          const name = normalizedIngredientName(ingredient.name);
          const key = `${name}-${ingredient.unit}`;
          const current = merged.get(key) || { key, name, amount: 0, unit: ingredient.unit, type: ingredient.type, action: prepActionForIngredient(ingredient.type, name), dishes: new Set<string>() };
          current.amount += ingredient.amount * scale;
          current.dishes.add(dishName);
          merged.set(key, current);
        });
      });
    });
    return Array.from(merged.values()).map((item) => ({ ...item, dishes: Array.from(item.dishes) })).sort((left, right) => left.type.localeCompare(right.type, "zh-CN") || left.name.localeCompare(right.name, "zh-CN"));
  }, [productionOrders, dishCatalog]);

  const serviceMinutes = (() => {
    const [hours, minutes] = serviceTime.split(":").map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 18 * 60 + 30;
  })();
  const cookingSchedule = useMemo(() => productionOrders.flatMap((order) => {
    const snapshots = parseDishSnapshot(order);
    return parseItems(order).map((item) => {
      const snapshot = snapshots.find((candidate) => candidate.dishId === item.dishId);
      const dish = dishCatalog.find((candidate) => candidate.id === item.dishId);
      const minutes = snapshot?.minutes || dish?.minutes || 30;
      return {
        key: `${order.id}:${item.dishId}`,
        orderId: order.id,
        dishId: item.dishId,
        name: snapshot?.name || dish?.name || "历史菜品",
        customerName: order.customerName,
        minutes,
        startTime: formatClockMinutes(serviceMinutes - minutes),
      };
    });
  }).sort((left, right) => left.startTime.localeCompare(right.startTime)), [productionOrders, dishCatalog, serviceMinutes]);
  const shoppingDoneCount = shoppingList.filter((item) => shoppingChecks[item.itemKey]).length;

  const startDishTimer = (key: string, minutes: number) => setDishTimers((current) => ({ ...current, [key]: Date.now() + minutes * 60 * 1000 }));
  const stopDishTimer = (key: string) => setDishTimers((current) => {
    const next = { ...current };
    delete next[key];
    return next;
  });

  const setShoppingChecked = async (itemKey: string, checked: boolean) => {
    setShoppingChecks((current) => ({ ...current, [itemKey]: checked }));
    try {
      const response = await fetch("/api/shopping", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemKey, checked }) });
      if (!response.ok) throw new Error();
    } catch {
      setShoppingChecks((current) => ({ ...current, [itemKey]: !checked }));
      setNotice("采购状态保存失败，请稍后重试");
    }
  };

  const resetShoppingChecks = async () => {
    const response = await fetch("/api/shopping", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reset: true }) });
    if (response.ok) {
      setShoppingChecks({});
      setNotice("采购清单已重新开始");
    } else {
      setNotice("采购清单重置失败");
    }
  };

  const shoppingText = () => {
    const lines = ["阿德小厨房 · 采购清单"];
    ["菜市场 / 生鲜区", "调味品区", "超市其他区"].forEach((location) => {
      const items = shoppingList.filter((item) => item.location === location);
      if (!items.length) return;
      lines.push(`\n【${location}】`, ...items.map((item) => `${shoppingChecks[item.itemKey] ? "✓" : "□"} ${item.name} ${formatAmount(item.amount, item.unit)}`));
    });
    if (pantryItems.length) lines.push(`\n家中库存已自动抵扣 ${pantryItems.length} 项。`);
    return lines.join("\n");
  };

  const shareShoppingList = async () => {
    const text = shoppingText();
    const canShare = typeof navigator.share === "function";
    try {
      if (canShare) await navigator.share({ title: "阿德小厨房采购清单", text });
      else await navigator.clipboard.writeText(text);
      setNotice(canShare ? "采购清单已打开分享" : "采购清单已复制，可粘贴到微信或备忘录");
    } catch (error) {
      if ((error as Error).name !== "AbortError") setNotice("复制失败，请稍后重试");
    }
  };

  const submitPantryItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/pantry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    const data = await response.json() as { item?: PantryItem; error?: string };
    if (!response.ok || !data.item) return setNotice(data.error || "库存保存失败");
    setPantryItems((current) => [...current, data.item!]);
    formElement.reset();
    setNotice(`已记住家里有${data.item.name}`);
  };

  const deletePantryItem = async (item: PantryItem) => {
    const response = await fetch(`/api/pantry?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (!response.ok) return setNotice("库存删除失败");
    setPantryItems((current) => current.filter((candidate) => candidate.id !== item.id));
  };

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name") }) });
    const data = await response.json() as { category?: MenuCategory; error?: string };
    if (!response.ok || !data.category) return setNotice(data.error || "分类添加失败");
    setManagedCategories((current) => current.some((item) => item.id === data.category!.id) ? current : [...current, data.category!]);
    formElement.reset();
  };

  const changeCategory = async (category: MenuCategory, mode: "rename" | "merge") => {
    const value = window.prompt(mode === "rename" ? `把“${category.name}”改成：` : `把“${category.name}”合并到哪个分类？`, "");
    if (!value?.trim()) return;
    const response = await fetch("/api/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: category.id, [mode === "rename" ? "name" : "mergeInto"]: value.trim() }) });
    const data = await response.json() as { categories?: MenuCategory[]; error?: string };
    if (!response.ok) return setNotice(data.error || "分类更新失败");
    setManagedCategories(data.categories || []);
    await loadDishes();
  };

  const moveCategory = async (category: MenuCategory, direction: -1 | 1) => {
    const response = await fetch("/api/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: category.id, direction }) });
    const data = await response.json() as { categories?: MenuCategory[] };
    if (response.ok) setManagedCategories(data.categories || []);
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    const form = new FormData(formElement);
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
          inviteToken: initialInviteToken || undefined,
        }),
      });
      const data = await response.json() as { error?: string; guestToken?: string };
      if (!response.ok) throw new Error(data.error || "提交失败，请再试一次");
      setCart({});
      setCheckoutOpen(false);
      setCartOpen(false);
      if (data.guestToken) {
        setOrderProgressUrl(`/order/${data.guestToken}`);
        setOrderSuccessOpen(true);
      }
      setNotice("点菜成功！厨房进度卡已经准备好 🍽️");
      formElement.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提交失败，请再试一次");
    } finally {
      setSubmitting(false);
    }
  };

  const updateOrderStatus = async (id: string, status: Order["status"]) => {
    try {
      const defaultNotes: Partial<Record<Order["status"], string>> = { confirmed: "饭局确认好啦，我会按时准备。", shopping: "正在挑新鲜食材，等你带着好胃口来。", preparing: "厨房已经开火，香味正在慢慢冒出来。", done: "开饭啦，愿今晚吃得开心。" };
      if (status === "done" && !window.confirm("确认通知开饭？朋友的进度页会弹出全屏强提醒，订单随后自动归档。")) return;
      const suggestedNote = defaultNotes[status] || (status === "cancelled" ? "这场饭局先暂停，等我们下次再好好约。" : "");
      const promptResult = window.prompt(status === "done" ? "填写开饭强提醒内容（可直接确认默认内容）" : "填写朋友端弹窗提醒内容（可直接确认默认内容）", suggestedNote);
      if (promptResult === null) return;
      const progressNote = promptResult.trim() || suggestedNote;
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status, progressNote }),
      });
      const data = await response.json() as { order?: Order; error?: string };
      if (!response.ok || !data.order) throw new Error(data.error || "更新失败");
      setOrders((current) => current.map((order) => order.id === id ? data.order! : order));
      if (status === "done") setNotice("开饭强提醒已发出，订单已自动归档");
      else if (status === "cancelled") setNotice("取消通知已发出，订单已归档");
      else setNotice("进度已更新，朋友端会弹窗提醒");
    } catch {
      setNotice("状态更新失败，请稍后重试");
    }
  };

  const setCookingStepChecked = (key: string, checked: boolean) => {
    setCookingChecks((current) => {
      const next = { ...current, [key]: checked };
      if (!checked) delete next[key];
      window.localStorage.setItem("ade-kitchen-cooking-checks", JSON.stringify(next));
      return next;
    });
  };

  const renderOrderCard = (order: Order, archived = false) => (
    <article className={`order-card${archived ? " archived" : ""}`} key={order.id}>
      <div className="order-top"><div><strong>{order.customerName}</strong><span>#{order.id.slice(-6).toUpperCase()}</span></div><em className={`status ${order.status}`}>{statusLabel[order.status]}</em></div>
      <div className="order-facts"><span>📅 {order.mealDate}</span><span>👥 {order.guestCount} 人</span></div>
      <div className="ordered-dishes">
        {parseItems(order).map((item) => <div key={item.dishId}><span>{parseDishSnapshot(order).find((dish) => dish.dishId === item.dishId)?.name || dishCatalog.find((dish) => dish.id === item.dishId)?.name || "历史菜品"}</span><strong>× {item.quantity}</strong></div>)}
      </div>
      {order.note && <p className="order-note">“{order.note}”</p>}
      {order.progressNote && <p className="order-progress-note"><span>最近通知</span>{order.progressNote}</p>}
      <div className="status-actions">
        {!archived && order.status === "new" && <button onClick={() => updateOrderStatus(order.id, "confirmed")}>确认接单</button>}
        {!archived && order.status === "confirmed" && <button onClick={() => updateOrderStatus(order.id, "shopping")}>开始买菜</button>}
        {!archived && order.status === "shopping" && <button onClick={() => updateOrderStatus(order.id, "preparing")}>开始制作</button>}
        {!archived && order.status === "preparing" && <button className="ready-alert" onClick={() => updateOrderStatus(order.id, "done")}><span aria-hidden="true">🔔</span> 通知开饭 · 强提醒</button>}
        {archived && <button className="quiet" onClick={() => updateOrderStatus(order.id, "confirmed")}>重新打开订单</button>}
        {!archived && <button className="quiet" onClick={() => updateOrderStatus(order.id, "cancelled")}>取消饭局</button>}
      </div>
    </article>
  );

  const updateIngredient = (rowId: string, field: keyof Ingredient, value: string) => {
    setIngredientRows((current) => current.map((row) => row.rowId === rowId
      ? { ...row, [field]: field === "amount" ? Number(value) : value }
      : row));
  };

  const previewLocalImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImagePreview(file ? URL.createObjectURL(file) : "");
    setImageCrop(defaultImageCrop);
    setCropMode("");
    setAutoCropPending(Boolean(file));
  };

  const applySmartCrop = (image = coverImageRef.current) => {
    if (!image || !image.complete || !image.naturalWidth) return;
    setImageCrop(findSmartImageCrop(image));
    setCropMode("auto");
    setAutoCropPending(false);
  };

  const handleCoverImageLoad = (image: HTMLImageElement) => {
    coverImageRef.current = image;
    if (autoCropPending) applySmartCrop(image);
  };

  const updateImageCrop = (next: Partial<ImageCrop>, mode: "auto" | "manual" = "manual") => {
    setImageCrop((current) => ({
      x: clamp(next.x ?? current.x, 0, 100),
      y: clamp(next.y ?? current.y, 0, 100),
      zoom: clamp(next.zoom ?? current.zoom, 1, 1.8),
    }));
    setCropMode(mode);
  };

  const startCoverDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!imagePreview) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    coverDragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, crop: imageCrop };
  };

  const moveCoverDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = coverDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    updateImageCrop({
      x: drag.crop.x - (event.clientX - drag.clientX) / bounds.width * 80 / imageCrop.zoom,
      y: drag.crop.y - (event.clientY - drag.clientY) / bounds.height * 80 / imageCrop.zoom,
    });
  };

  const finishCoverDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (coverDragRef.current?.pointerId === event.pointerId) coverDragRef.current = null;
  };

  const clearRecipeScreenshots = () => {
    recipeScreenshotUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    recipeScreenshotUrlsRef.current = [];
    setRecipeScreenshots([]);
  };

  const selectRecipeScreenshots = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 4);
    clearRecipeScreenshots();
    const screenshots = files.map((file) => ({ id: createClientRowId(), file, preview: URL.createObjectURL(file), rotation: 0 as const }));
    recipeScreenshotUrlsRef.current = screenshots.map((screenshot) => screenshot.preview);
    setRecipeScreenshots(screenshots);
    setRecipeDraft(null);
    setRecipeEngine("Qwen3-VL-Plus");
    event.target.value = "";
  };

  const rotateRecipeScreenshot = (id: string) => {
    setRecipeScreenshots((current) => current.map((screenshot) => screenshot.id === id
      ? { ...screenshot, rotation: ((screenshot.rotation + 90) % 360) as RecipeScreenshot["rotation"] }
      : screenshot));
    setRecipeDraft(null);
  };

  const removeRecipeScreenshot = (id: string) => {
    setRecipeScreenshots((current) => {
      const removed = current.find((screenshot) => screenshot.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      recipeScreenshotUrlsRef.current = recipeScreenshotUrlsRef.current.filter((url) => url !== removed?.preview);
      return current.filter((screenshot) => screenshot.id !== id);
    });
    setRecipeDraft(null);
  };

  const fillDishForm = (draft: RecipeDraft) => {
    const form = dishFormRef.current;
    if (!form) return;
    const setValue = (name: string, value: string) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) field.value = value;
    };
    const setChecked = (name: string, checked: boolean) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement) field.checked = checked;
    };
    setValue("name", draft.name);
    setValue("category", draft.category);
    setValue("flavor", draft.flavor);
    setValue("minutes", String(draft.minutes));
    setValue("baseServings", String(draft.baseServings || 4));
    setValue("description", draft.description);
    setValue("slogan", draft.slogan || "");
    setValue("source", draft.source);
    setValue("steps", draft.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"));
    setValue("seasons", (draft.seasons || []).join("、"));
    setValue("occasions", (draft.occasions || []).join("、"));
    setValue("dietary", (draft.dietary || []).join("、"));
    setValue("difficulty", draft.difficulty || "适中");
    setValue("recipeSummary", draft.recipeSummary || "");
    setValue("substitutions", JSON.stringify(draft.substitutions || []));
    setImageCrop(parseImageCrop(draft.imagePosition));
    setCropMode(draft.imagePosition ? "saved" : "");
    setAutoCropPending(false);
    setChecked("featured", Boolean(draft.featured));
    setChecked("available", draft.available !== false);
    setChecked("soldOut", Boolean(draft.soldOut));
    setIngredientRows(draft.ingredients.length
      ? draft.ingredients.map((ingredient) => ({ ...ingredient, rowId: createClientRowId() }))
      : [newIngredientRow()]);
    window.setTimeout(() => form.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const startEditingDish = (dish: ManagedDish) => {
    setEditingDish(dish);
    setImagePreview(dish.imageUrl || "");
    fillDishForm({
      name: dish.name, category: dish.category, description: dish.description, slogan: dish.slogan || "", flavor: dish.flavor,
      minutes: dish.minutes, baseServings: dish.baseServings || 4, source: dish.source || "",
      ingredients: dish.ingredients, steps: dish.steps || [], confidenceNotes: [],
      featured: dish.featured, available: dish.available, soldOut: dish.soldOut,
      seasons: dish.seasons, occasions: dish.occasions, dietary: dish.dietary,
      difficulty: dish.difficulty, recipeSummary: dish.recipeSummary, substitutions: dish.substitutions,
      imagePosition: dish.imagePosition,
    });
    setNotice(`正在编辑“${dish.name}”`);
  };

  const cancelEditingDish = () => {
    setEditingDish(null);
    dishFormRef.current?.reset();
    setIngredientRows([newIngredientRow()]);
    setImagePreview("");
    setImageCrop(defaultImageCrop);
    setCropMode("");
    setAutoCropPending(false);
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
      form.set("rotations", JSON.stringify(recipeScreenshots.map((screenshot) => screenshot.rotation)));
      form.set("text", recipeImportText);
      form.set("preferences", recipePreferences);
      const response = await fetch("/api/recipe-import", { method: "POST", body: form });
      const data = await response.json() as { draft?: RecipeDraft; mode?: string; model?: string; error?: string };
      if (!response.ok || !data.draft) throw new Error(data.error || "菜谱识别失败");
      setRecipeDraft(data.draft);
      setRecipeEngine(data.model || "Qwen3-VL-Plus");
      fillDishForm(data.draft);
      const summary = `${data.draft.ingredients.length} 种食材、${data.draft.steps.length} 个步骤`;
      setNotice(data.mode === "text-fallback" ? `已用文字模式拆解 ${summary}，请校对` : `识别完成：${summary}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "菜谱识别失败，请稍后重试");
    } finally {
      setRecipeImporting(false);
    }
  };

  const regenerateDishCopy = async (field: "description" | "slogan") => {
    const form = dishFormRef.current;
    if (!form) return;
    const fieldValue = (name: string) => {
      const input = form.elements.namedItem(name);
      return input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement ? input.value : "";
    };
    const name = fieldValue("name").trim();
    if (!name) return setNotice("请先填写菜名，再让千问生成文案");
    setCopyGenerating(field);
    try {
      const response = await fetch("/api/recipe-copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          field,
          name,
          flavor: fieldValue("flavor"),
          ingredients: ingredientRows.map(({ name: ingredientName, amount, unit, type }) => ({ name: ingredientName, amount, unit, type })),
          steps: fieldValue("steps").split("\n").map((step) => step.replace(/^\s*\d+[.、）)]\s*/, "").trim()).filter(Boolean),
          currentDescription: fieldValue("description"),
          currentSlogan: fieldValue("slogan"),
          preferences: recipePreferences,
        }),
      });
      const data = await response.json() as { description?: string; slogan?: string; error?: string };
      const generated = field === "description" ? data.description : data.slogan;
      if (!response.ok || !generated) throw new Error(data.error || "千问没有返回可用文案");
      const target = form.elements.namedItem(field);
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.value = generated;
      setRecipeDraft((current) => current ? { ...current, [field]: generated } : current);
      setNotice(field === "description" ? "菜品介绍已重新生成，保存前可以继续修改" : "点菜口号已重新生成，保存前可以继续修改");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "文案生成失败，请稍后重试");
    } finally {
      setCopyGenerating(null);
    }
  };

  const submitDish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setDishSubmitting(true);
    const form = new FormData(formElement);
    form.set("ingredients", JSON.stringify(ingredientRows.map(({ name, amount, unit, type }) => ({ name, amount, unit, type }))));
    if (!form.get("substitutions")) form.set("substitutions", JSON.stringify(recipeDraft?.substitutions || editingDish?.substitutions || []));
    if (editingDish) form.set("id", editingDish.id);
    try {
      const response = await fetch("/api/dishes", { method: editingDish ? "PUT" : "POST", body: form });
      const data = await response.json() as { dish?: ManagedDish; error?: string };
      if (!response.ok || !data.dish) throw new Error(data.error || "菜品保存失败");
      setCustomDishes((current) => editingDish
        ? current.map((dish) => dish.id === data.dish!.id ? data.dish! : dish)
        : [data.dish!, ...current]);
      formElement.reset();
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
      setImagePreview("");
      setImageCrop(defaultImageCrop);
      setCropMode("");
      setAutoCropPending(false);
      setIngredientRows([newIngredientRow()]);
      setRecipeDraft(null);
      setRecipeImportText("");
      clearRecipeScreenshots();
      setNotice(editingDish ? `“${data.dish.name}”已保存更新` : `“${data.dish.name}”已加入菜单`);
      setEditingDish(null);
      await loadCategories();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "菜品保存失败");
    } finally {
      setDishSubmitting(false);
    }
  };

  const saveRecipePreferences = async () => {
    const response = await fetch("/api/recipe-preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences: recipePreferences }) });
    setNotice(response.ok ? "主厨习惯已记住，下次识别会优先参考" : "主厨习惯保存失败");
  };

  const createInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const dishIds = form.getAll("dishIds").map(String);
    const recommendedDishIds = form.getAll("recommendedDishIds").map(String);
    const response = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.get("title"), message: form.get("message"), mealDate: form.get("mealDate"), theme: form.get("theme"), dishIds, recommendedDishIds }) });
    const data = await response.json() as { invite?: DinnerInvite; error?: string };
    if (!response.ok || !data.invite) return setNotice(data.error || "邀请创建失败");
    setInvites((current) => [data.invite!, ...current]);
    formElement.reset();
    setNotice("专属邀请已生成，可以发给朋友了");
  };

  const shareInvite = async (invite: DinnerInvite) => {
    const url = `${window.location.origin}/invite/${invite.token}`;
    const canShare = typeof navigator.share === "function";
    try {
      if (canShare) await navigator.share({ title: invite.title, text: invite.message || "来阿德小厨房点菜吧", url });
      else await navigator.clipboard.writeText(url);
      setNotice(canShare ? "邀请卡已打开分享" : "邀请链接已复制");
    } catch (error) { if ((error as Error).name !== "AbortError") setNotice("分享失败，请稍后重试"); }
  };

  const toggleInvite = async (invite: DinnerInvite) => {
    const response = await fetch("/api/invites", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: invite.id, active: !invite.active }) });
    if (!response.ok) return setNotice("邀请状态更新失败");
    setInvites((current) => current.map((item) => item.id === invite.id ? { ...item, active: !item.active } : item));
  };

  const saveJournal = async (event: FormEvent<HTMLFormElement>, invite: DinnerInvite) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget); form.set("inviteId", invite.id);
    const response = await fetch("/api/journals", { method: "POST", body: form });
    const data = await response.json() as { journal?: DinnerJournal; error?: string };
    if (!response.ok || !data.journal) return setNotice(data.error || "餐桌日记保存失败");
    setJournals((current) => [data.journal!, ...current.filter((item) => item.inviteId !== invite.id)]);
    setNotice("餐桌日记已保存，朋友的进度页也会看到");
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

  const setDishFlag = async (dish: ManagedDish, field: "featured" | "available" | "soldOut", value: boolean) => {
    const response = await fetch("/api/dishes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: dish.id, [field]: value }) });
    const data = await response.json() as { dish?: ManagedDish; error?: string };
    if (!response.ok || !data.dish) return setNotice(data.error || "菜品状态更新失败");
    setCustomDishes((current) => current.map((item) => item.id === dish.id ? data.dish! : item));
    if (field === "soldOut" && value) setCart((current) => { const next = { ...current }; delete next[dish.id]; return next; });
  };

  const duplicateDish = async (dish: ManagedDish) => {
    const response = await fetch("/api/dishes/duplicate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: dish.id }) });
    const data = await response.json() as { dish?: ManagedDish; error?: string };
    if (!response.ok || !data.dish) return setNotice(data.error || "复制失败");
    setCustomDishes((current) => [...current, data.dish!]);
    setNotice(`已复制“${dish.name}”，副本暂未上架`);
  };

  const deleteDish = async (dish: ManagedDish) => {
    if (!window.confirm(`确定永久删除“${dish.name}”吗？一般建议先归档，历史订单仍会保留菜名。`)) return;
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

  const renderBanquetComposer = () => (
    <section className="banquet-builder acceptance-composer" aria-labelledby="banquet-builder-title">
      <div className="banquet-tools panel">
        <div className="panel-title"><div><span>ORDER TO MENU</span><h2 id="banquet-builder-title">把点单编成正式宴席菜单</h2></div><small>接单 → 编排 → 导出</small></div>
        <div className="banquet-tool-body">
          <div className="banquet-step">
            <div className="banquet-step-title"><b>1</b><div><strong>选择这场饭局</strong><small>菜品、人数、日期与客人留言会一起带入</small></div></div>
            <select value={banquetOrderId} onChange={(event) => composeFromOrder(event.target.value)} aria-label="选择朋友的订单">
              <option value="">选择一个订单…</option>
              {orders.map((order) => <option value={order.id} key={order.id}>{order.customerName} · {order.mealDate} · {parseItems(order).length} 道菜</option>)}
            </select>
            {orders.length === 0 && <p className="banquet-hint">还没有订单，也可以先从下方菜谱库加入菜品，做一张备用菜单。</p>}
          </div>

          <div className="banquet-step">
            <div className="banquet-step-title"><b>2</b><div><strong>选择与场合一致的模板</strong><small>模板会同步匹配标题、祝福语、配色和装饰元素</small></div></div>
            <div className="template-picker">
              {banquetTemplates.map((template) => <button type="button" className={banquetTemplate === template.id ? `template-choice ${template.id} active` : `template-choice ${template.id}`} key={template.id} onClick={() => selectBanquetTemplate(template)}><span>{template.mark}</span><strong>{template.name}</strong><small>{template.occasion}</small></button>)}
            </div>
          </div>

          <div className="banquet-step">
            <div className="banquet-step-title"><b>3</b><div><strong>确认宴席文字</strong><small>自动匹配模板后，仍可改成你自己的语气</small></div></div>
            <div className="banquet-fields">
              <label><span>菜单标题</span><input value={banquetTitle} onChange={(event) => setBanquetTitle(event.target.value)} maxLength={32} /></label>
              <label><span>用餐日期</span><input type="date" value={banquetDate} onChange={(event) => setBanquetDate(event.target.value)} /></label>
              <label className="wide"><span>写给客人的话</span><input value={banquetMessage} onChange={(event) => setBanquetMessage(event.target.value)} maxLength={70} /></label>
            </div>
          </div>

          <div className="banquet-step">
            <div className="banquet-step-title"><b>4</b><div><strong>调整菜品和栏目</strong><small>自动分为前菜、热菜、主食与汤饮，也可手动调整</small></div></div>
            <div className="banquet-add-row"><select value={banquetDishId} onChange={(event) => setBanquetDishId(event.target.value)} aria-label="从菜谱库选择菜品"><option value="">从我的菜谱库添加…</option>{dishCatalog.filter((dish) => !banquetItems.some((item) => item.dishId === dish.id)).map((dish) => <option value={dish.id} key={dish.id}>{dish.name} · {dish.category}</option>)}</select><button type="button" onClick={addBanquetDish}>＋ 加入</button></div>
            {banquetDishes.length === 0 ? <div className="banquet-empty"><span>宴</span><p>选择一个订单，或从菜谱库加入第一道菜。</p></div> : <div className="banquet-arrangement">{banquetDishes.map(({ dish, course }, index) => <article key={dish.id}><span className="arrange-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{dish.name}</strong><small>{dish.flavor} · 约 {dish.minutes} 分钟</small></div><select value={course} onChange={(event) => updateBanquetCourse(dish.id, event.target.value as BanquetCourse)} aria-label={`${dish.name}所属栏目`}>{banquetCourses.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><div className="arrange-actions"><button type="button" onClick={() => moveBanquetDish(dish.id, -1)} disabled={index === 0} aria-label={`上移${dish.name}`}>↑</button><button type="button" onClick={() => moveBanquetDish(dish.id, 1)} disabled={index === banquetDishes.length - 1} aria-label={`下移${dish.name}`}>↓</button><button type="button" className="remove" onClick={() => setBanquetItems((current) => current.filter((item) => item.dishId !== dish.id))} aria-label={`移除${dish.name}`}>×</button></div></article>)}</div>}
          </div>
        </div>
      </div>

      <aside className="banquet-preview-wrap">
        <div className={`banquet-preview template-${banquetTemplate}`}>
          <div className="menu-card-ornament" aria-hidden="true"><span>{activeBanquetTemplate.mark}</span></div>
          <div className="menu-card-header">
            <small>阿德小厨房 · PRIVATE KITCHEN</small>
            <h2>{banquetTitle || activeBanquetTemplate.defaultTitle}</h2>
            <p>{activeBanquetTemplate.subtitle}</p>
            <div><span>{banquetDate || "择日相聚"}</span><span>{activeBanquetTemplate.occasion}</span>{selectedBanquetOrder && <span>{selectedBanquetOrder.guestCount} 位宾客</span>}</div>
          </div>
          <div className="menu-card-courses">
            {banquetCourses.map((course) => {
              const courseDishes = banquetDishes.filter((item) => item.course === course.id);
              if (!courseDishes.length) return null;
              return <section key={course.id}><h3><span>{course.label}</span><small>{course.english}</small></h3><div>{courseDishes.map(({ dish }) => <article key={dish.id}><strong>{dish.name}</strong><span>{dish.description || dish.flavor}</span></article>)}</div></section>;
            })}
            {banquetDishes.length === 0 && <div className="menu-card-placeholder"><span>MENU</span><p>加入菜品后，这里会生成与“{activeBanquetTemplate.name}”相匹配的完整菜单。</p></div>}
          </div>
          <div className="menu-card-footer"><span>—</span><p>{banquetMessage || activeBanquetTemplate.defaultMessage}</p><small>CHEF&apos;S TABLE · 私房呈献</small></div>
        </div>
        <div className="preview-actions"><button type="button" className="quiet" onClick={() => { setBanquetItems([]); setBanquetOrderId(""); }}>清空重排</button><button type="button" className="export" onClick={printBanquetMenu}>导出 / 打印菜单 <span>↗</span></button></div>
        <p className="preview-tip">装饰只位于页边，菜名与介绍始终保持高对比；导出后可保存为 PDF。</p>
      </aside>
    </section>
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className={mode === "menu" ? "friend-menu" : "chef-shell"}>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="回到菜单">
          <span className="brand-mark">德</span>
          <span><strong>阿德小厨房</strong><small>只招待我喜欢的人</small></span>
        </Link>
        <nav className="mode-switch" aria-label="页面切换">
          <Link className={mode === "menu" ? "active" : ""} href="/">朋友点菜</Link>
          <Link className={mode === "chef" ? "active" : ""} href="/chef">主厨入口</Link>
          {mode === "chef" && chefUser && <span className="chef-user">{chefUser}</span>}
          {mode === "chef" && <form className="chef-logout" action="/api/auth/logout" method="post"><button type="submit">退出</button></form>}
        </nav>
      </header>

      {mode === "menu" ? (
        <>
          <section className={`hero${activeInvite ? ` invite-hero theme-${activeInvite.theme}` : ""}`}>
            <div className="hero-copy">
              <div className="hero-greeting"><span className={!activeInvite && !kitchenOpen ? "closed" : ""}><i></i> {activeInvite ? "你的专属饭局" : kitchenOpen ? "厨房今日营业" : "厨房今天休息"}</span><small>{activeInvite ? activeInvite.mealDate : kitchenOpen ? "嗨，今天也要被好好招待 👋" : "今天先看看菜单，等主厨重新亮起绿灯"}</small></div>
              <h1>{activeInvite ? activeInvite.title : <>想吃什么，<br /><em>我给你做。</em></>}</h1>
              <p>{activeInvite?.message || "没有复杂规则，也不用跟我客气。挑几道你惦记的家常菜，剩下的交给主厨。"}</p>
              <div className="hero-actions"><a href="#weekly-menu">开始点菜 <span>↓</span></a><p><strong>提前 1 天</strong><small>让我从容去买菜</small></p></div>
            </div>
            <div className="hero-visual">
              <div className="chef-portrait-frame">
                <Image className="chef-portrait" src="/chef-portrait.jpg" width={960} height={960} priority alt="阿德主厨在厨房为朋友准备菜品" />
                <div className="magazine-masthead" style={{ borderBottom: 0, paddingBottom: 0 }}><small>ADE&apos;S PRIVATE KITCHEN</small><strong>阿德私厨志</strong></div>
                <div className="hero-sticker">{activeInvite ? "只为你" : "今日份"}<br /><strong>{activeInvite ? "留了位置" : "好好吃饭"}</strong></div>
                <div className="magazine-cover-slogan"><small>放心点</small><strong>不用替主厨<br />省事</strong><span>NO NEED TO HOLD BACK</span></div>
                <div className="chef-portrait-caption"><span>TONIGHT&apos;S CHEF</span><strong>阿德 · 为你掌勺</strong></div>
              </div>
            </div>
          </section>

          {orderProgressUrl && <section className="order-success-card"><span>点单已送进厨房</span><h2>接下来，就等香味慢慢靠近</h2><p>这张进度卡会告诉你：阿德确认了没有、买菜到哪一步、什么时候开火。</p><a href={orderProgressUrl}>查看我的厨房进度 <b>→</b></a></section>}

          <section className="menu-section" id="weekly-menu">
            <div className="section-heading">
              <div><span className="eyebrow">{activeInvite ? "YOUR PRIVATE DINNER MENU" : "THIS WEEK'S LITTLE MENU"}</span><h2>{activeInvite ? "这桌菜，等你翻牌" : "挑几道喜欢的"}</h2><p>{activeInvite ? "阿德特意为这场饭局留出的菜单。" : "点菜不用客气，洗碗也不用你。"}</p></div>
              <div className="menu-count-pill"><strong>{allDishes.length}</strong><span>道拿手菜<br />等你翻牌</span></div>
            </div>
            {inviteLoading && <div className="invite-loading">正在把你的专属菜单端上来…</div>}
            {activeInvite && activeInvite.recommendedDishIds.length > 0 && <div className="recommended-combo"><span>主厨搭配</span><strong>如果不想纠结，就从这几道开始</strong><div>{activeInvite.recommendedDishIds.map((id) => dishCatalog.find((dish) => dish.id === id)).filter(Boolean).map((dish) => <button key={dish!.id} onClick={() => updateQuantity(dish!.id, 1)}>{dish!.name}<i>＋</i></button>)}</div></div>}
            <div className="category-tabs" role="tablist" aria-label="菜系分类">
              {["全部", ...menuCategories].map((category) => (
                <button key={category} className={activeCategory === category ? "active" : ""} onClick={() => setActiveCategory(category)}><span>{categoryEmoji[category] || "•"}</span>{category}</button>
              ))}
            </div>
            <div className="dish-grid">
              {filteredDishes.map((dish, index) => {
                const quantity = cart[dish.id] || 0;
                return (
                  <article className={`${quantity ? "dish-card selected" : "dish-card"}${dish.soldOut ? " sold-out" : ""}`} key={dish.id}>
                    <div className={`dish-art tone-${dish.tone}`}>
                      {dish.imageUrl ? <img className="dish-photo" style={dishImageStyle(dish.imagePosition)} src={dish.imageUrl} alt={dish.name} /> : <span>{dish.emoji}</span>}
                      <small>{dish.category}</small>
                      {(dish.soldOut || dish.featured || dish.tag) && <b className="dish-art-tag">{dish.soldOut ? "今天售罄" : dish.featured ? "主厨推荐" : dish.tag}</b>}
                    </div>
                    <div className="dish-body">
                      <div className="dish-title"><h3>{dish.name}</h3></div>
                      <div className="dish-quip">{dish.slogan || ["这道很适合一起分享", "今天吃点认真做的", "一口下去，很有家的感觉"][index % 3]}</div>
                      <p>{dish.description}</p>
                      {dish.dietary && dish.dietary.length > 0 && <div className="dish-safety-tags">{dish.dietary.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>}
                      <div className={quantity ? "quantity-control has-quantity" : "quantity-control"}>
                        {quantity > 0 ? <div className="quantity-stepper" aria-label={`${dish.name}已选 ${quantity} 份`}>
                          <button type="button" onClick={() => updateQuantity(dish.id, -1)} aria-label={`减少${dish.name}`}><span className="control-mark minus" aria-hidden="true" /></button>
                          <strong><small>已选</small>{quantity} 份</strong>
                          <button type="button" onClick={() => updateQuantity(dish.id, 1)} aria-label={`增加${dish.name}`}><span className="control-mark plus" aria-hidden="true" /></button>
                        </div> : <button type="button" disabled={dish.soldOut} className="add" onClick={() => updateQuantity(dish.id, 1)} aria-label={`添加${dish.name}`}>{dish.soldOut ? <span>下次再约</span> : <><span>想吃这道</span><b className="plus-mark" aria-hidden="true" /></>}</button>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {!inviteLoading && initialInviteToken && !activeInvite && <div className="invite-loading"><strong>这份邀请暂时不能点菜</strong><p>可能饭局已经结束，可以问问阿德下一顿什么时候开席。</p></div>}
          </section>

          <section className="chef-story" aria-label="认识今晚的主厨">
            <Image className="chef-story-photo" src="/chef-studio.jpg" width={1440} height={809} alt="阿德主厨站在开放式厨房里" />
            <div className="chef-story-copy"><span>MEET YOUR CHEF</span><h2>菜慢慢挑，<br />心意已经开火。</h2><p>这不是餐厅的制式菜单，而是一顿专门留给朋友的饭。你负责挑喜欢的，我负责把每一道认真做好。</p><small className="chef-signature"><b>阿德</b><i>Ade</i></small></div>
          </section>

          <section className="promise-strip">
            <div className="promise-heading"><span>主厨保证书</span><h2>放心点，<br />我认真做。</h2><p>一顿好饭不一定隆重，<br />但一定要有诚意。</p></div>
            <div className="promise-card"><span>01</span><div>🧺</div><strong>收到点单再买菜</strong><p>新鲜这件事，不打折。</p></div>
            <div className="promise-card playful"><span>02</span><div>🍳</div><strong>每一道都现做</strong><p>锅气，是厨房的签名。</p></div>
            <div className="promise-card"><span>03</span><div>☺</div><strong>最重要的是开心</strong><p>吃饱以后，再慢慢聊天。</p></div>
          </section>

          {cartCount > 0 && (
            <button className="floating-cart" onClick={() => setCartOpen(true)}>
              <span className="cart-icon">{cartCount}</span><span><small>这顿有着落了</small><strong>{cartItems.length} 道菜 · 共 {cartCount} 份</strong></span><b>去确认菜单 <i>→</i></b>
            </button>
          )}
        </>
      ) : (
        <section className="chef-page">
          <div className="chef-heading">
            <div><span className="eyebrow">KITCHEN WORKFLOW</span><h1>主厨工作台</h1><p>从接单、买菜、制作到开饭，按厨房真正的顺序一步一步完成。</p></div>
            <div className="chef-heading-actions"><button type="button" className={`kitchen-status-toggle ${kitchenOpen ? "open" : "closed"}`} onClick={toggleKitchenStatus} disabled={kitchenStatusSaving}><i></i><span><small>{kitchenOpen ? "绿灯 · 朋友可见" : "红灯 · 朋友可见"}</small><strong>{kitchenStatusSaving ? "正在保存…" : kitchenOpen ? "厨房今日营业" : "厨房今天休息"}</strong></span><b>{kitchenOpen ? "关闭" : "开启"}</b></button>{(["accepting", "shopping", "cooking", "serving"] as ChefView[]).includes(chefView) && <button className="refresh-button" onClick={() => loadOrders()} disabled={loadingOrders}>{loadingOrders ? "刷新中…" : "刷新订单"}</button>}</div>
          </div>
          <div className="chef-workflow" role="tablist" aria-label="主厨工作流程">
            <button className={chefView === "accepting" ? "active" : ""} onClick={() => setChefView("accepting")}><i>01</i><span><b>接单</b><small>{acceptingOrders.length} 份待确认 · 编排宴席</small></span></button>
            <button className={chefView === "shopping" ? "active" : ""} onClick={() => setChefView("shopping")}><i>02</i><span><b>订单和采购</b><small>{shoppingList.length} 项要买 · {shoppingDoneCount} 项完成</small></span></button>
            <button className={chefView === "cooking" ? "active" : ""} onClick={() => setChefView("cooking")}><i>03</i><span><b>制作</b><small>{productionOrders.length} 场进行中 · {cookingRecipeCount} 道菜</small></span></button>
            <button className={chefView === "serving" ? "active" : ""} onClick={() => setChefView("serving")}><i>04</i><span><b>开饭</b><small>{servingOrders.length} 场待通知 · {recentDoneOrders.length} 场已归档</small></span></button>
          </div>
          <div className="chef-secondary-nav" role="tablist" aria-label="主厨其他工具">
            <span>其他工具</span>
            <button className={chefView === "menuManager" ? "active" : ""} onClick={() => setChefView("menuManager")}>菜单与菜谱 <b>{dishCatalog.filter((dish) => dish.active !== false).length}</b></button>
            <button className={chefView === "invitations" ? "active" : ""} onClick={() => setChefView("invitations")}>邀请与餐桌日记 <b>{invites.filter((invite) => invite.active).length}</b></button>
          </div>

          {chefView === "accepting" ? (
            <section className="accepting-workspace" aria-labelledby="accepting-title">
              <section className="workflow-hero panel">
                <div><span>STEP 01 · ORDER INTAKE</span><h2 id="accepting-title">先看清这场饭，再确认接单</h2><p>客人、日期、人数、菜品和忌口集中确认；确认后可直接把这份点单编排成正式宴席菜单。</p></div>
                <div className="workflow-hero-stats"><span><small>待确认</small><strong>{acceptingOrders.length}</strong></span><span><small>下一场</small><strong>{nextMealDate}</strong></span><span><small>预计招待</small><strong>{cookingGuestCount} 人</strong></span><span><small>已点菜品</small><strong>{cookingRecipeCount} 道</strong></span></div>
              </section>
              <section className="accepting-orders panel">
                <div className="panel-title"><div><span>NEW DINNER REQUESTS</span><h2>接单信息汇总</h2></div><small>{acceptingOrders.length} 份等待处理</small></div>
                {loadingOrders && orders.length === 0 ? <div className="empty">正在同步朋友们的点单…</div> : acceptingOrders.length === 0 ? <div className="empty compact"><span>✓</span><strong>目前没有待确认订单</strong><p>新的点单会自动出现在这里；也可以先在下方设计一张备用宴席菜单。</p></div> : <div className="accepting-order-grid">{acceptingOrders.map((order) => <article className="accepting-order-card" key={order.id}><header><div><small>{order.mealDate}</small><h3>{order.customerName} 的饭局</h3><p>{order.guestCount} 人 · 订单 #{order.id.slice(-6).toUpperCase()}</p></div><em>待确认</em></header>{order.note && <blockquote><b>口味 / 忌口</b>{order.note}</blockquote>}<div className="accepting-menu-summary">{parseItems(order).map((item) => <span key={item.dishId}>{parseDishSnapshot(order).find((dish) => dish.dishId === item.dishId)?.name || dishCatalog.find((dish) => dish.id === item.dishId)?.name || "历史菜品"}<b>× {item.quantity}</b></span>)}</div><footer><button className="quiet" onClick={() => composeFromOrder(order.id)}>先编排宴席菜单</button><button onClick={() => updateOrderStatus(order.id, "confirmed")}>确认接单 →</button></footer></article>)}</div>}
              </section>
              {renderBanquetComposer()}
            </section>
          ) : chefView === "cooking" ? (
            <section className="cooking-workspace" aria-labelledby="cooking-workspace-title">
              <section className="cooking-overview panel">
                <div className="cooking-overview-copy"><span>STEP 03 · LIVE COOKING BOARD</span><h2 id="cooking-workspace-title">制作执行台</h2><p>合并备菜、倒排开火时间、单菜计时与完整做法集中在这里，照着顺序做就不会乱。</p></div>
                <div className="cooking-stats"><div><small>计划开饭</small><strong>{serviceTime}</strong></div><div><small>制作中饭局</small><strong>{productionOrders.length}</strong></div><div><small>待处理菜品</small><strong>{new Set(productionOrders.flatMap((order) => parseItems(order).map((item) => item.dishId))).size}<i> 道</i></strong></div><div><small>库存不足</small><strong>{shoppingList.length}<i> 项</i></strong></div></div>
                <div className="cooking-sync-strip"><span>✓ 相同食材自动合并</span><span>✓ 按开饭时间倒排</span><span>✓ 单菜独立计时</span><span>✓ 库存不足提醒</span><span>✓ 步骤进度留在本机</span></div>
              </section>

              {shoppingList.length > 0 && <div className="stock-alert"><span>!</span><div><strong>还有 {shoppingList.length} 项食材未被库存覆盖</strong><p>先去“订单和采购”确认已买齐，再开始集中备菜。</p></div><button onClick={() => setChefView("shopping")}>查看采购清单</button></div>}
              <section className="kitchen-operations-grid">
                <article className="prep-board panel"><div className="panel-title"><div><span>MERGED PREP</span><h2>合并备菜清单</h2></div><small>{prepList.length} 项</small></div>{prepList.length === 0 ? <div className="empty compact"><span>🥬</span><p>订单进入买菜或制作状态后，这里会合并相同食材。</p></div> : <div className="prep-list">{prepList.map((item) => <div key={item.key}><span className={`prep-type ${item.type}`}>{item.type}</span><div><strong>{item.name}</strong><small>{item.action} · 用于 {item.dishes.join("、")}</small></div><b>{formatAmount(item.amount, item.unit)}</b></div>)}</div>}</article>
                <article className="schedule-board panel"><div className="panel-title"><div><span>BACKWARD PLAN</span><h2>倒排烹饪顺序</h2></div><label>开饭时间 <input type="time" value={serviceTime} onChange={(event) => setServiceTime(event.target.value)} /></label></div>{cookingSchedule.length === 0 ? <div className="empty compact"><span>⏱</span><p>有制作中的菜品后，会按烹饪时长自动算出开火时间。</p></div> : <ol className="cooking-schedule">{cookingSchedule.map((item) => <li key={item.key}><time>{item.startTime}</time><span><strong>{item.name}</strong><small>{item.customerName} · 约 {item.minutes} 分钟</small></span><i>开火</i></li>)}</ol>}</article>
              </section>

              {loadingOrders && orders.length === 0 ? <div className="panel cooking-empty">正在同步朋友们的点单…</div> : productionOrders.length === 0 ? <div className="panel cooking-empty"><span>火</span><strong>还没有进入制作阶段的菜</strong><p>订单在“订单和采购”页标记为开始买菜后，就会进入这张制作执行台。</p></div> : productionOrders.map((order) => {
                const snapshots = parseDishSnapshot(order);
                return <article className="cooking-order panel" key={order.id}>
                  <header className="cooking-order-head"><div><span>{order.mealDate}</span><h3>{order.customerName} 的饭局</h3><p>{order.guestCount} 人 · 订单 #{order.id.slice(-6).toUpperCase()}</p></div><em className={`status ${order.status}`}>{statusLabel[order.status]}</em></header>
                  {order.note && <div className="cooking-guest-note"><b>朋友的口味 / 忌口</b><p>{order.note}</p></div>}
                  <div className="cooking-progress"><div>{cookingStages.map((stage, index) => <span className={statusProgressIndex[order.status] >= index ? "done" : ""} key={stage.id}><i>{statusProgressIndex[order.status] > index ? "✓" : index + 1}</i>{stage.label}</span>)}</div><div className="cooking-order-actions">{order.status === "new" && <button onClick={() => updateOrderStatus(order.id, "confirmed")}>确认接单</button>}{order.status === "confirmed" && <button onClick={() => updateOrderStatus(order.id, "shopping")}>开始买菜</button>}{order.status === "shopping" && <button onClick={() => updateOrderStatus(order.id, "preparing")}>开始制作</button>}{order.status === "preparing" && <button className="ready-alert" onClick={() => updateOrderStatus(order.id, "done")}>🔔 通知开饭</button>}<small>推进状态后，朋友端会弹窗强提醒</small></div></div>
                  <div className="cooking-dishes">{parseItems(order).map((item, dishIndex) => {
                    const snapshot = snapshots.find((candidate) => candidate.dishId === item.dishId);
                    const dish = dishCatalog.find((candidate) => candidate.id === item.dishId);
                    const ingredients = snapshot?.ingredients?.length ? snapshot.ingredients : dish?.ingredients || [];
                    const steps = snapshot?.steps?.length ? snapshot.steps : dish?.steps || [];
                    const baseServings = snapshot?.baseServings || dish?.baseServings || 4;
                    const scale = (order.guestCount / baseServings) * item.quantity;
                    const checkPrefix = `${order.id}:${item.dishId}`;
                    const completedSteps = steps.filter((_, index) => cookingChecks[`${checkPrefix}:${index}`]).length;
                    const schedule = cookingSchedule.find((entry) => entry.key === checkPrefix);
                    const timerDeadline = dishTimers[checkPrefix];
                    const timerRemaining = timerDeadline ? timerDeadline - timerNow : 0;
                    return <section className="cooking-dish-card" key={`${order.id}-${item.dishId}`}>
                      <div className="cooking-dish-head"><span>{String(dishIndex + 1).padStart(2, "0")}</span><div><h4>{snapshot?.name || dish?.name || "历史菜品"}</h4><p>{item.quantity} 份 · 按 {order.guestCount} 人换算 · 约 {snapshot?.minutes || dish?.minutes || 30} 分钟</p></div><strong>{completedSteps}/{steps.length || 0} 步</strong></div>
                      {(snapshot?.recipeSummary || dish?.recipeSummary) && <p className="cooking-recipe-summary">{snapshot?.recipeSummary || dish?.recipeSummary}</p>}
                      <div className={`dish-timer${timerDeadline ? timerRemaining <= 0 ? " finished" : " running" : ""}`}><div><small>{schedule ? `建议 ${schedule.startTime} 开火` : "单菜计时器"}</small><strong>{timerDeadline ? timerRemaining > 0 ? formatCountdown(timerRemaining) : "时间到" : `${snapshot?.minutes || dish?.minutes || 30}:00`}</strong></div>{timerDeadline ? <button onClick={() => stopDishTimer(checkPrefix)}>{timerRemaining > 0 ? "停止计时" : "关闭提醒"}</button> : <button onClick={() => startDishTimer(checkPrefix, snapshot?.minutes || dish?.minutes || 30)}>开始计时</button>}</div>
                      <div className="cooking-recipe-grid"><section><div className="cooking-section-title"><b>本单用料</b><small>已自动换算</small></div>{ingredients.length ? <ul>{ingredients.map((ingredient) => <li key={`${item.dishId}-${ingredient.name}-${ingredient.unit}`}><span>{ingredient.name}</span><strong>{formatAmount(ingredient.amount * scale, ingredient.unit)}</strong></li>)}</ul> : <p className="cooking-missing">暂时没有记录用料。</p>}</section><section><div className="cooking-section-title"><b>具体做法</b><small>做完可勾选</small></div>{steps.length ? <ol>{steps.map((step, index) => { const checkKey = `${checkPrefix}:${index}`; return <li className={cookingChecks[checkKey] ? "checked" : ""} key={checkKey}><label><input type="checkbox" checked={Boolean(cookingChecks[checkKey])} onChange={(event) => setCookingStepChecked(checkKey, event.target.checked)} /><i>{index + 1}</i><span>{step}</span></label></li>; })}</ol> : <p className="cooking-missing">这道菜还没有记录步骤，可在“菜单管理”中补充。</p>}</section></div>
                      <footer>{(snapshot?.difficulty || dish?.difficulty) && <span>难度：{snapshot?.difficulty || dish?.difficulty}</span>}{(snapshot?.source || dish?.source) && <span>来源：{snapshot?.source || dish?.source}</span>}{dish?.gallery?.length ? <span>{dish.gallery.length} 张过程图可参考</span> : null}</footer>
                    </section>;
                  })}</div>
                </article>;
              })}
            </section>
          ) : chefView === "shopping" ? (
            <>
              <div className="stats-row">
                <div><small>已接单饭局</small><strong>{shoppingOrders.length}</strong><span>等待买菜 / 制作</span></div>
                <div><small>采购项目</small><strong>{shoppingList.length}</strong><span>库存抵扣后</span></div>
                <div><small>已买齐</small><strong>{shoppingDoneCount}</strong><span>还差 {Math.max(0, shoppingList.length - shoppingDoneCount)} 项</span></div>
              </div>

              <div className="chef-grid">
                <div className="orders-panel panel">
                  <div className="panel-title"><div><span>STEP 02 · ORDERS</span><h2>订单和采购提醒</h2></div><small>{shoppingOrders.length} 场待准备</small></div>
                  <div className="order-update-tip"><span aria-hidden="true">🧺</span><p><strong>先核对饭局，再照清单采购</strong>家中库存会自动抵扣；买齐后可直接把订单推进到制作页。</p></div>
                  {loadingOrders && orders.length === 0 ? <div className="empty">正在同步订单…</div> : shoppingOrders.length === 0 ? <div className="empty compact"><span>✓</span><strong>当前没有待采购饭局</strong><p>在接单页确认订单后，这里会自动生成采购提醒。</p></div> : <div className="order-list">{shoppingOrders.map((order) => renderOrderCard(order))}</div>}
                </div>

                <aside className="shopping-panel panel">
                  <div className="panel-title"><div><span>自动汇总</span><h2>采购清单</h2></div><div className="shopping-head-actions"><button className="shopping-reset" onClick={() => setPantryOpen((value) => !value)}>家中库存</button><button className="shopping-reset" onClick={shareShoppingList}>复制 / 分享</button><button className="shopping-reset" onClick={resetShoppingChecks}>重新开始</button></div></div>
                  {shoppingList.length === 0 ? <div className="empty compact"><span>🧺</span><p>有新订单后，会自动拆解并合并食材用量。</p></div> : (
                    <div className="shopping-list">
                      {["菜市场 / 生鲜区", "调味品区", "超市其他区"].map((location) => {
                        const items = shoppingList.filter((item) => item.location === location);
                        if (!items.length) return null;
                        return <div className="shopping-group" key={location}><h3>{location}</h3>{items.map((item) => <label key={item.itemKey}><input type="checkbox" checked={Boolean(shoppingChecks[item.itemKey])} onChange={(event) => setShoppingChecked(item.itemKey, event.target.checked)} /><span>{item.name}{item.stockUsed > 0 && <small>已扣家中 {formatAmount(item.stockUsed, item.unit)}</small>}</span><strong>{formatAmount(item.amount, item.unit)}</strong></label>)}</div>;
                      })}
                    </div>
                  )}
                  <div className="shopping-tip">已按订单人数换算并自动抵扣库存。仍显示在清单中的项目，就是需要补买的数量。</div>
                  {pantryOpen && <div className="pantry-box"><div className="pantry-heading"><div><strong>家中库存</strong><small>相同名称和单位会自动从采购量中扣除</small></div><span>{pantryItems.length} 项</span></div><form onSubmit={submitPantryItem}><input name="name" required placeholder="食材名称" /><input name="amount" required type="number" min="0.1" step="0.1" placeholder="数量" /><input name="unit" required placeholder="单位" /><select name="type" defaultValue="其他"><option>生鲜</option><option>蔬菜</option><option>调料</option><option>其他</option></select><button>加入库存</button></form>{pantryItems.length > 0 && <div className="pantry-list">{pantryItems.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.type}</small></span><b>{formatAmount(item.amount, item.unit)}</b><button onClick={() => deletePantryItem(item)} aria-label={`删除库存${item.name}`}>×</button></div>)}</div>}</div>}
                </aside>
              </div>
            </>
          ) : chefView === "menuManager" ? (
            <>
              <section className="smart-import panel" aria-labelledby="smart-import-title">
                <div className="smart-import-heading">
                  <div className="smart-import-icon" aria-hidden="true">识</div>
                  <div><span>QWEN VISION RECIPE</span><h2 id="smart-import-title">智能菜谱录入 · 截图版</h2><p>通义千问读取书页、截图和步骤照片，整理成可以直接保存的完整做法。</p></div>
                  <em>Qwen3-VL-Plus</em>
                </div>
                <div className="smart-import-body">
                  <div className="smart-import-grid">
                    <div className="screenshot-import">
                      <label className={recipeScreenshots.length ? "recipe-upload has-files" : "recipe-upload"}>
                        <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={selectRecipeScreenshots} />
                        <span>＋</span><strong>{recipeScreenshots.length ? "重新选择菜谱截图" : "上传菜谱截图"}</strong><small>最多 4 张；建议同时拍清菜名、材料和全部步骤</small>
                      </label>
                      {recipeScreenshots.length > 0 && <div className="screenshot-previews">{recipeScreenshots.map((screenshot, index) => <figure key={screenshot.id}><div className="screenshot-frame"><img src={screenshot.preview} alt={`菜谱截图 ${index + 1}`} style={{ transform: `rotate(${screenshot.rotation}deg)` }} /><figcaption>{index + 1}</figcaption></div><div className="screenshot-meta"><span title={screenshot.file.name}>{screenshot.file.name}</span><div><button type="button" onClick={() => rotateRecipeScreenshot(screenshot.id)} aria-label={`顺时针旋转第 ${index + 1} 张截图`}>↻ 旋转</button><button type="button" onClick={() => removeRecipeScreenshot(screenshot.id)} aria-label={`移除第 ${index + 1} 张截图`}>移除</button></div></div></figure>)}</div>}
                    </div>
                    <div className="import-or"><span>或</span></div>
                    <label className="recipe-text-import"><span>粘贴菜谱文字</span><textarea value={recipeImportText} onChange={(event) => { setRecipeImportText(event.target.value); setRecipeDraft(null); }} placeholder={'例如：\n大虾烧白菜\n食材：大虾 250g、白菜 500g……\n步骤：1. 处理大虾……'} /><small>没有截图时也能自动拆解；有截图时可补充模糊内容</small></label>
                  </div>
                  <div className="smart-import-actions">
                    <p>方向不对时先点“旋转”。识别结果只填入草稿，不会自动发布。</p>
                    <button type="button" onClick={analyzeRecipe} disabled={recipeImporting}>{recipeImporting ? "通义千问正在读图…" : "分析截图并生成菜谱"}<span>→</span></button>
                  </div>
                  <div className="recipe-preferences"><label><span>让它学会我的做菜习惯</span><textarea value={recipePreferences} onChange={(event) => setRecipePreferences(event.target.value)} placeholder="例如：默认少油少盐；香菜单独放；家里常用生抽而不是味极鲜；一勺按 15ml 计算。" /></label><button type="button" onClick={saveRecipePreferences}>保存习惯</button></div>
                  {recipeDraft && <div className="import-result" role="status"><div className="import-result-head"><div><strong>✓ 已生成“{recipeDraft.name}”完整草稿</strong><span>{recipeDraft.ingredients.length} 种食材 · {recipeDraft.steps.length} 个步骤 · {recipeDraft.difficulty} · {recipeEngine}</span></div>{recipeDraft.recipeSummary && <p>{recipeDraft.recipeSummary}</p>}</div><div className="recipe-generated-copy"><span>点菜口号</span><strong>{recipeDraft.slogan || "等待生成"}</strong><p>{recipeDraft.description || "等待生成菜品介绍"}</p></div><div className="recipe-draft-preview"><section><b>识别出的用料</b><div>{recipeDraft.ingredients.map((item) => <span key={`${item.name}-${item.unit}`}>{item.name} {item.amount}{item.unit}</span>)}</div></section><section><b>识别出的做法</b><ol>{recipeDraft.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></section></div>{Boolean(recipeDraft.confidenceNotes.length || recipeDraft.missingChecks?.length) && <p className="recipe-check-note">请核对：{[...recipeDraft.confidenceNotes, ...(recipeDraft.missingChecks || [])].join("；")}</p>}{Boolean(recipeDraft.substitutions?.length) && <div className="substitution-chips">{recipeDraft.substitutions!.map((item) => <span key={item.ingredient}>{item.ingredient} 可换 {item.alternatives.join(" / ")}</span>)}</div>}</div>}
                </div>
              </section>

              <section className="category-manager panel">
                <div className="panel-title"><div><span>MENU TYPES</span><h2>菜品类型管理</h2></div><small>新增 · 改名 · 排序 · 合并</small></div>
                <div className="category-manager-body"><form onSubmit={addCategory}><input name="name" maxLength={30} required placeholder="新增类型，例如：烧烤" /><button>＋ 添加类型</button></form><div className="category-manager-list">{managedCategories.map((category, index) => <div key={category.id}><span>{category.name}<small>{customDishes.filter((dish) => dish.category === category.name).length} 道</small></span><div><button onClick={() => moveCategory(category, -1)} disabled={index === 0} aria-label={`上移${category.name}`}>↑</button><button onClick={() => moveCategory(category, 1)} disabled={index === managedCategories.length - 1} aria-label={`下移${category.name}`}>↓</button><button onClick={() => changeCategory(category, "rename")}>改名</button><button onClick={() => changeCategory(category, "merge")}>合并</button></div></div>)}</div></div>
              </section>

              <div className="manager-grid">
              <form ref={dishFormRef} className="dish-form panel" onSubmit={submitDish}>
                <div className="panel-title"><div><span>{editingDish ? "EDIT DISH" : "NEW DISH"}</span><h2>{editingDish ? `编辑：${editingDish.name}` : "添加一道新菜"}</h2></div>{editingDish ? <button type="button" className="cancel-edit" onClick={cancelEditingDish}>取消编辑</button> : <small>保存后立即上架</small>}</div>
                <div className="dish-form-body">
                  <div className="field-grid">
                    <label><span>菜名 *</span><input name="name" required maxLength={40} placeholder="例如：糖醋小排" /></label>
                    <label className="category-edit-field"><span>菜品类型（可自定义）*</span><input name="category" required maxLength={30} placeholder="例如：凉菜、甜品、烧烤或粤菜" /><small>可直接输入任何新类型，保存后会自动出现在朋友端分类中。</small></label>
                    <label><span>口味标签</span><input name="flavor" maxLength={30} placeholder="例如：酸甜 · 不辣" /></label>
                    <label><span>预计烹饪时间</span><div className="input-suffix"><input name="minutes" type="number" min="5" max="360" defaultValue="30" required /><b>分钟</b></div></label>
                    <label><span>这份菜谱适合几人</span><div className="input-suffix"><input name="baseServings" type="number" min="1" max="20" defaultValue="4" required /><b>人</b></div><small>只用于后台换算采购量，朋友端不会显示。</small></label>
                    <label><span>菜谱来源</span><input name="source" maxLength={80} placeholder="例如：食遇日记 · 村驴" /></label>
                    <label><span>操作难度</span><select name="difficulty" defaultValue="适中"><option>简单</option><option>适中</option><option>进阶</option></select></label>
                  </div>
                  <input name="substitutions" type="hidden" />
                  <fieldset className="dish-status-fieldset"><legend>菜单状态</legend><div><label><input name="available" type="checkbox" defaultChecked /><span>本期可做</span></label><label><input name="featured" type="checkbox" /><span>主厨推荐</span></label><label><input name="soldOut" type="checkbox" /><span>暂时售罄</span></label></div><small>推荐和售罄会显示在朋友端；归档请在右侧菜品列表操作。</small></fieldset>
                  <div className="field-grid tag-field-grid"><label><span>适合季节</span><input name="seasons" maxLength={120} placeholder="春季、夏季、秋冬" /></label><label><span>适合场景</span><input name="occasions" maxLength={120} placeholder="二人晚餐、朋友聚会、生日" /></label><label><span>饮食与过敏提示</span><input name="dietary" maxLength={160} placeholder="含花生、含乳制品、可做素食" /></label></div>
                  <div className="ai-copy-field wide-field"><label><span>菜品介绍</span><textarea name="description" maxLength={180} placeholder="简单介绍这道菜的味道、口感和特色…" /></label><button type="button" onClick={() => regenerateDishCopy("description")} disabled={copyGenerating !== null}>{copyGenerating === "description" ? "千问生成中…" : "千问再生成"}</button></div>
                  <div className="ai-copy-field wide-field"><label><span>点菜端 slogan</span><input name="slogan" maxLength={60} placeholder="例如：大人小孩都很难拒绝" /><small>显示在朋友点菜页菜名下方，可以随时改成自己的语气。</small></label><button type="button" onClick={() => regenerateDishCopy("slogan")} disabled={copyGenerating !== null}>{copyGenerating === "slogan" ? "千问生成中…" : "千问再生成"}</button></div>
                  <label className="wide-field"><span>菜谱要点</span><textarea name="recipeSummary" maxLength={240} placeholder="例如：先煎香再焖，最后大火收汁到能挂在食材表面。" /></label>
                  <label className="wide-field"><span>烹饪步骤</span><textarea className="steps-textarea" name="steps" maxLength={12000} placeholder={'每行填写一个步骤，例如：\n1. 大虾剪去虾须，开背去虾线\n2. 白菜切块，小火煸炒至变软'} /></label>

                  <fieldset className="photo-fieldset">
                    <legend>菜品照片</legend>
                    <div className="photo-options">
                      <label className="upload-box">
                        <input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={previewLocalImage} />
                        <span className="upload-icon">＋</span><strong>从本地上传照片</strong><small>JPG、PNG、WebP 或 GIF，最大 6MB</small>
                      </label>
                      <div className="or-divider"><span>或</span></div>
                      <label className="network-photo"><span>粘贴网络图片地址</span><input name="imageUrl" type="url" placeholder="https://example.com/dish.jpg" onChange={(event) => { setImagePreview(event.target.value); setImageCrop(defaultImageCrop); setCropMode(""); setAutoCropPending(Boolean(event.target.value)); }} /><small>请使用你有权使用的图片地址</small></label>
                    </div>
                    <input name="imagePosition" type="hidden" value={serializeImageCrop(imageCrop)} readOnly />
                    <div className="cover-editor">
                      <div className="cover-editor-heading"><div><strong>封面智能取景</strong><small>{cropMode === "auto" ? "已自动找到画面主体，可继续微调" : cropMode === "manual" ? "已手动调整，保存后朋友端同步显示" : cropMode === "saved" ? "正在使用上次保存的取景" : "上传后会自动寻找菜品主体"}</small></div><div><button type="button" onClick={() => applySmartCrop()} disabled={!imagePreview}>自动取景</button><button type="button" className="quiet" onClick={() => updateImageCrop(defaultImageCrop)} disabled={!imagePreview}>居中重置</button></div></div>
                      <div className={`cover-crop-frame ${imagePreview ? "has-image" : ""}`} onPointerDown={startCoverDrag} onPointerMove={moveCoverDrag} onPointerUp={finishCoverDrag} onPointerCancel={finishCoverDrag}>
                        {imagePreview ? <img ref={coverImageRef} src={imagePreview} alt="菜品封面取景预览" draggable={false} style={dishImageStyle(serializeImageCrop(imageCrop))} onLoad={(event) => handleCoverImageLoad(event.currentTarget)} /> : <div><span>📷</span><small>上传照片后在这里拖动画面</small></div>}
                        {imagePreview && <span className="crop-guide" aria-hidden="true" />}
                      </div>
                      <div className="cover-sliders">
                        <label><span>左右焦点</span><input type="range" min="0" max="100" step="1" value={Math.round(imageCrop.x)} onChange={(event) => updateImageCrop({ x: Number(event.target.value) })} /></label>
                        <label><span>上下焦点</span><input type="range" min="0" max="100" step="1" value={Math.round(imageCrop.y)} onChange={(event) => updateImageCrop({ y: Number(event.target.value) })} /></label>
                        <label><span>画面缩放</span><input type="range" min="1" max="1.8" step="0.01" value={imageCrop.zoom} onChange={(event) => updateImageCrop({ zoom: Number(event.target.value) })} /><b>{Math.round(imageCrop.zoom * 100)}%</b></label>
                      </div>
                    </div>
                    <div className="photo-detail-row"><label className="gallery-upload"><span>制作过程图</span><input name="galleryImages" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" /><small>最多 4 张；编辑时重新上传会替换原过程图</small></label></div>
                    {editingDish?.gallery && editingDish.gallery.length > 0 && <div className="gallery-strip">{editingDish.gallery.map((photo, index) => <img key={photo} src={photo} alt={`${editingDish.name}制作过程 ${index + 1}`} />)}</div>}
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
                  <button className="primary-button save-dish" disabled={dishSubmitting}>{dishSubmitting ? "正在保存菜品…" : editingDish ? "保存修改" : "保存并上架"}<span>→</span></button>
                </div>
              </form>

              <aside className="managed-menu panel">
                <div className="panel-title"><div><span>YOUR RECIPE LIBRARY</span><h2>我的完整菜谱库</h2></div><small>{customDishes.length} 道</small></div>
                <div className="built-in-note"><span>统一管理</span><strong>经典菜和新菜都可编辑</strong><p>可推荐、售罄、暂停本期、复制或归档；历史订单不会被改坏。</p></div>
                {customDishes.length === 0 ? <div className="empty compact"><span>🥢</span><strong>还没有自定义菜式</strong><p>填写左侧表单，第一道新菜就会出现在朋友的菜单上。</p></div> : (
                  <div className="managed-dish-list">
                    {customDishes.map((dish) => (
                      <article className={`${!dish.active ? "managed-dish inactive" : "managed-dish"}${dish.soldOut ? " sold-out" : ""}`} key={dish.id}>
                        <div className="managed-thumb">{dish.imageUrl ? <img src={dish.imageUrl} style={dishImageStyle(dish.imagePosition)} alt="" /> : <span>🍽️</span>}</div>
                        <div className="managed-copy"><div><strong>{dish.name}</strong><em>{!dish.active ? "已归档" : dish.soldOut ? "已售罄" : dish.available === false ? "本期暂停" : dish.featured ? "主厨推荐" : "已上架"}</em></div><p>{dish.category} · {dish.flavor}</p>{dish.slogan && <small className="managed-slogan">“{dish.slogan}”</small>}<small>{dish.ingredients.length} 种食材 · {dish.steps?.length || 0} 个步骤 · {dish.baseServings || 4} 人基础份</small>{Boolean(dish.seasons?.length || dish.occasions?.length || dish.dietary?.length) && <small>{[...(dish.seasons || []), ...(dish.occasions || []), ...(dish.dietary || [])].join(" · ")}</small>}<details className="managed-recipe-details"><summary>查看具体做法</summary><div>{dish.recipeSummary && <p>{dish.recipeSummary}</p>}<b>用料</b><ul>{dish.ingredients.map((item) => <li key={`${dish.id}-${item.name}-${item.unit}`}><span>{item.name}</span><strong>{item.amount} {item.unit}</strong></li>)}</ul><b>步骤</b>{dish.steps?.length ? <ol>{dish.steps.map((step, index) => <li key={`${dish.id}-step-${index}`}>{step}</li>)}</ol> : <p>这道菜暂时还没有记录步骤。</p>}{dish.source && <small>来源：{dish.source}</small>}</div></details></div>
                        <div className="managed-actions"><button onClick={() => startEditingDish(dish)}>编辑</button><button onClick={() => duplicateDish(dish)}>复制</button><button className={dish.featured ? "active" : ""} onClick={() => setDishFlag(dish, "featured", !dish.featured)}>{dish.featured ? "取消推荐" : "推荐"}</button><button onClick={() => setDishFlag(dish, "soldOut", !dish.soldOut)}>{dish.soldOut ? "恢复供应" : "售罄"}</button><button onClick={() => setDishFlag(dish, "available", dish.available === false)}>{dish.available === false ? "加入本期" : "暂停本期"}</button><button onClick={() => toggleDish(dish)}>{dish.active ? "归档" : "恢复"}</button><button className="danger" onClick={() => deleteDish(dish)}>永久删除</button></div>
                      </article>
                    ))}
                  </div>
                )}
              </aside>
              </div>
            </>
          ) : chefView === "serving" ? (
            <section className="serving-workspace" aria-labelledby="serving-title">
              <section className="serving-hero panel"><div><span>STEP 04 · READY TO SERVE</span><h2 id="serving-title">最后确认，然后通知开饭</h2><p>这里只保留已经开火的饭局。检查步骤完成情况后发送强提醒，订单会自动进入下方归档。</p></div><div><strong>{servingOrders.length}</strong><small>场等待开饭</small></div></section>
              <div className="serving-grid">
                <section className="panel"><div className="panel-title"><div><span>READY QUEUE</span><h2>等待通知的饭局</h2></div><small>{servingOrders.length} 场</small></div>{servingOrders.length === 0 ? <div className="empty"><span>🔔</span><strong>暂时没有等待开饭的饭局</strong><p>制作页点击“开始制作”后，订单会出现在这里。</p></div> : <div className="order-list serving-list">{servingOrders.map((order) => renderOrderCard(order))}</div>}</section>
                <section className="panel"><div className="panel-title"><div><span>RECENTLY SERVED</span><h2>最近完成</h2></div><small>{recentDoneOrders.length} 场</small></div>{recentDoneOrders.length === 0 ? <div className="empty compact"><span>🍽️</span><p>完成的饭局会自动归档到这里。</p></div> : <div className="order-list archived-list">{recentDoneOrders.map((order) => renderOrderCard(order, true))}</div>}{archivedOrders.length > recentDoneOrders.length && <section className="order-archive"><button type="button" className="order-archive-toggle" onClick={() => setArchiveOpen((value) => !value)} aria-expanded={archiveOpen}><span><b>全部订单归档</b><small>包含已完成和已取消的历史饭局</small></span><strong>{archivedOrders.length} 份 {archiveOpen ? "收起 ↑" : "查看 ↓"}</strong></button>{archiveOpen && <div className="order-list archived-list">{archivedOrders.map((order) => renderOrderCard(order, true))}</div>}</section>}</section>
              </div>
            </section>
          ) : (
            <section className="invitation-workspace">
              <form className="invite-creator panel" onSubmit={createInvite}>
                <div className="panel-title"><div><span>PRIVATE DINNER LINK</span><h2>生成一场专属饭局</h2></div><small>选菜 · 写话 · 分享</small></div>
                <div className="invite-fields">
                  <label><span>饭局名字</span><input name="title" required maxLength={48} placeholder="例如：周六来我家吃饭" /></label>
                  <label><span>日期</span><input name="mealDate" type="date" min={today} defaultValue={today} required /></label>
                  <label><span>邀请风格</span><select name="theme" defaultValue="warm"><option value="warm">温馨家常</option><option value="romance">二人世界</option><option value="fine">Fine Dinner</option><option value="festival">节日团圆</option></select></label>
                  <label className="wide"><span>写给朋友的话</span><textarea name="message" maxLength={180} placeholder="例如：菜我来做，你只管带着好胃口来。" /></label>
                </div>
                <fieldset className="invite-dish-picker"><legend>这次开放哪些菜</legend><p>勾选“可点”会进入专属菜单；再勾“推荐”会组成主厨搭配。</p><div>{dishCatalog.filter((dish) => dish.active !== false && dish.available !== false).map((dish) => <article key={dish.id}><label><input type="checkbox" name="dishIds" value={dish.id} /><span>{dish.imageUrl ? <img src={dish.imageUrl} alt="" /> : "🍽️"}<b>{dish.name}</b><small>{dish.category}</small></span></label><label className="recommend-check"><input type="checkbox" name="recommendedDishIds" value={dish.id} />推荐</label></article>)}</div></fieldset>
                <button className="primary-button">生成专属邀请 <span>→</span></button>
              </form>

              <div className="invite-list panel">
                <div className="panel-title"><div><span>DINNER ARCHIVE</span><h2>我的饭局与餐桌日记</h2></div><small>{invites.length} 场</small></div>
                {invites.length === 0 ? <div className="empty"><span>💌</span><strong>还没有专属饭局</strong><p>从左边挑几道菜，生成第一张只属于朋友的邀请。</p></div> : <div className="invite-cards">{invites.map((invite) => {
                  const journal = journals.find((item) => item.inviteId === invite.id);
                  return <article className={`invite-card theme-${invite.theme}${invite.active ? "" : " inactive"}`} key={invite.id}>
                    <div className="invite-card-head"><span>{invite.mealDate}</span><em>{invite.active ? "邀请中" : "已结束"}</em></div>
                    <h3>{invite.title}</h3><p>{invite.message || "菜我来做，你只管来。"}</p>
                    <div className="invite-menu-preview">{invite.dishIds.map((id) => dishCatalog.find((dish) => dish.id === id)?.name).filter(Boolean).join(" · ")}</div>
                    <div className="invite-actions"><button onClick={() => shareInvite(invite)}>分享邀请</button><a href={`/invite/${invite.token}`} target="_blank">预览</a><button className="quiet" onClick={() => toggleInvite(invite)}>{invite.active ? "结束邀请" : "重新开放"}</button></div>
                    <form className="journal-form" onSubmit={(event) => saveJournal(event, invite)}><strong>饭后留一页</strong><input name="title" defaultValue={journal?.title || "今晚的餐桌日记"} maxLength={60} /><textarea name="note" defaultValue={journal?.note || ""} maxLength={800} placeholder="记下今晚最好吃的一道菜、最好笑的一句话…" /><label><span>上传餐桌照片（最多 6 张）</span><input name="images" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" /></label>{journal?.imageUrls.length ? <div className="journal-thumbs">{journal.imageUrls.map((url) => <img src={url} alt="饭局记录" key={url} />)}</div> : null}<button>保存餐桌日记</button></form>
                  </article>;
                })}</div>}
              </div>
            </section>
          )}
        </section>
      )}

      {cartOpen && (
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setCartOpen(false)}>
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="已选菜单">
            <button className="close" onClick={() => setCartOpen(false)} aria-label="关闭">×</button>
            <span className="eyebrow">YOUR HAPPY LITTLE MENU</span><h2>这顿想吃这些</h2>
            <div className="cart-lines">{cartItems.map((item) => <div key={item.id}><span className="mini-emoji">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.emoji}</span><span><strong>{item.name}</strong></span><div><button type="button" onClick={() => updateQuantity(item.id, -1)} aria-label={`减少${item.name}`}><span className="control-mark minus" aria-hidden="true" /></button><b>{item.quantity}</b><button type="button" onClick={() => updateQuantity(item.id, 1)} aria-label={`增加${item.name}`}><span className="control-mark plus" aria-hidden="true" /></button></div></div>)}</div>
            <p className="cart-hint">眼光不错呀。提交后我会和你确认时间，再认真去买菜。</p>
            <button className="primary-button" onClick={() => setCheckoutOpen(true)}>把这顿饭约起来 <span>→</span></button>
          </aside>
        </div>
      )}

      {checkoutOpen && (
        <div className="overlay checkout-overlay">
          <form className="checkout-card" onSubmit={submitOrder}>
            <button type="button" className="close" onClick={() => setCheckoutOpen(false)} aria-label="关闭">×</button>
            <span className="eyebrow">ALMOST DINNER TIME</span><h2>最后，把饭局约起来</h2><p>告诉我谁来、哪天来。你负责期待，我负责好吃。</p>
            <label><span>你的称呼</span><input name="customerName" required maxLength={30} placeholder="例如：小林" /></label>
            <div className="form-row"><label><span>想哪天吃</span><input name="mealDate" type="date" min={today} defaultValue={activeInvite?.mealDate || today} readOnly={Boolean(activeInvite)} required /></label><label><span>几个人</span><input name="guestCount" type="number" min="1" max="20" defaultValue="2" required /></label></div>
            <label><span>口味或忌口</span><textarea name="note" maxLength={200} placeholder="例如：少辣、不吃香菜，或者任何想说的话…" /></label>
            <button className="primary-button" disabled={submitting}>{submitting ? "正在提交…" : `确认点菜 · ${cartItems.length} 道 / ${cartCount} 份`}<span>→</span></button>
          </form>
        </div>
      )}

      {orderSuccessOpen && orderProgressUrl && (
        <div className="overlay checkout-overlay">
          <section className="checkout-card order-success-dialog" role="dialog" aria-modal="true" aria-label="点菜成功">
            <button type="button" className="close" onClick={() => setOrderSuccessOpen(false)} aria-label="关闭">×</button>
            <div className="order-success-mark" aria-hidden="true">✓</div>
            <span className="eyebrow">ORDER RECEIVED</span>
            <h2>点单已经送进厨房</h2>
            <p>进度卡会自动更新主厨确认、买菜和开火状态。建议现在打开，并把页面留在微信里。</p>
            <a className="primary-button" href={orderProgressUrl}>查看实时厨房进度 <span>→</span></a>
            <button type="button" className="order-success-secondary" onClick={() => setOrderSuccessOpen(false)}>继续看看菜单</button>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
      <footer><span>阿德小厨房 · 私房菜单</span><p>愿每顿饭都有热气，也有惦记。</p></footer>
    </main>
  );
}
