"use client";

import { ChangeEvent, DragEvent as ReactDragEvent, FormEvent, PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { categories, dishes, type Dish, type Ingredient } from "./menu";
import { activeGuestOrderStorageKey, isGuestOrderToken } from "./order-memory";

type Cart = Record<string, number>;
type OrderItem = { dishId: string; quantity: number };
type DishSnapshot = { dishId: string; name: string; baseServings: number; ingredients: Ingredient[]; steps?: string[]; minutes?: number; recipeSummary?: string; source?: string; difficulty?: string };
type PublishedMenuCourse = { id: BanquetCourse; label: string; english: string; dishes: Array<{ name: string; description: string }> };
type PublishedMenu = { title: string; date: string; message: string; template: BanquetTemplate; templateName: string; subtitle: string; occasion: string; guestCount?: number; chefCredit?: string; courses: PublishedMenuCourse[] };
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
  statusReadAt: string;
  publishedMenu: string;
  publishedMenuUpdatedAt: string;
  menuReadAt: string;
  archivedAt: string;
  status: "new" | "confirmed" | "shopping" | "preparing" | "done" | "cancelled";
  createdAt: string;
};
type ManagedDish = Dish & { active: boolean; isCustom: true; createdAt?: string };
type IngredientRow = Ingredient & { rowId: string };
type MenuCategory = { id: string; name: string; emoji: string; sortOrder: number };
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
type BulkRecipePreview = {
  total: number;
  toInsert: number;
  toUpdate: number;
  categories: string[];
  sampleNames: string[];
  fingerprint: string;
  fileName: string;
};
type BulkRecipeResult = { total: number; inserted: number; updated: number; totalDishes: number; backupFile: string };
type DinnerInvite = { id: string; token: string; title: string; message: string; mealDate: string; theme: "warm" | "romance" | "fine" | "festival"; dishIds: string[]; recommendedDishIds: string[]; mode: "single" | "shared"; active: boolean; createdAt: string };
type SharedDinner = { mode: "shared"; guests: Array<{ id: string; displayName: string }>; selections: Array<{ guestId: string; displayName: string; items: OrderItem[] }>; aggregate: OrderItem[]; guestToken: string; guestId: string; orderToken: string };
type DinnerJournal = { id: string; inviteId: string; orderId: string; title: string; note: string; imageUrls: string[]; updatedAt?: string; createdAt: string };
type RecipeScreenshot = { id: string; file: File; preview: string; rotation: 0 | 90 | 180 | 270 };
type ImageCrop = { x: number; y: number; zoom: number };
type BanquetCourse = "starter" | "main" | "staple" | "soup";
type BanquetItem = { dishId: string; course: BanquetCourse };
type BanquetTemplate = "home" | "romance" | "fine" | "spring" | "midautumn" | "birthday" | "housewarming" | "summer" | "christmas" | "brunch";
type ChefView = "accepting" | "shopping" | "cooking" | "serving" | "menuManager" | "invitations" | "journals" | "dataTransfer";
type StatusUpdateDraft = { orderId: string; status: Order["status"]; note: string };

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const acceptedImageInputTypes = "image/jpeg,image/png,image/webp,image/gif";
const maximumImageBytes = 6 * 1024 * 1024;

function ImageDropField({
  name,
  multiple = false,
  maximumFiles = 1,
  maximumTotalBytes = maximumImageBytes * maximumFiles,
  className,
  onChange,
  onNotice,
  children,
}: {
  name?: string;
  multiple?: boolean;
  maximumFiles?: number;
  maximumTotalBytes?: number;
  className: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onNotice: (message: string) => void;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const dropFiles = (event: ReactDragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const dropped = Array.from(event.dataTransfer.files);
    if (!dropped.length) return;
    if (dropped.some((file) => !acceptedImageTypes.has(file.type))) {
      onNotice("照片仅支持 JPG、PNG、WebP 或 GIF 格式");
      return;
    }
    if (dropped.some((file) => file.size > maximumImageBytes)) {
      onNotice("每张照片请控制在 6MB 以内");
      return;
    }
    const selected = dropped.slice(0, multiple ? maximumFiles : 1);
    if (selected.reduce((total, file) => total + file.size, 0) > maximumTotalBytes) {
      onNotice(`这次选择的照片总大小请控制在 ${Math.round(maximumTotalBytes / 1024 / 1024)}MB 以内`);
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    const transfer = new DataTransfer();
    selected.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (dropped.length > selected.length) onNotice(`一次最多上传 ${maximumFiles} 张，已保留前 ${selected.length} 张`);
  };

  return (
    <label
      className={`${className} image-drop-field${dragActive ? " is-dragging" : ""}`}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
      }}
      onDrop={dropFiles}
    >
      <input ref={inputRef} name={name} type="file" multiple={multiple} accept={acceptedImageInputTypes} onChange={onChange} />
      {children}
      {dragActive && <em className="image-drop-overlay">松开鼠标，照片就会放进这里</em>}
    </label>
  );
}

const banquetCourses: Array<{ id: BanquetCourse; label: string; english: string }> = [
  { id: "starter", label: "开胃前菜", english: "APPETIZER" },
  { id: "main", label: "主厨热菜", english: "MAIN COURSE" },
  { id: "staple", label: "主食点心", english: "STAPLE" },
  { id: "soup", label: "汤饮甜品", english: "SOUP & DESSERT" },
];

const banquetCourseOrder: Record<BanquetCourse, number> = {
  starter: 0,
  main: 1,
  staple: 2,
  soup: 3,
};

function sortBanquetItemsByCourse(items: BanquetItem[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => banquetCourseOrder[left.item.course] - banquetCourseOrder[right.item.course] || left.index - right.index)
    .map(({ item }) => item);
}

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

const statusLabel = { new: "待确认", confirmed: "已确认", shopping: "买菜中", preparing: "制作中", done: "已开饭", cancelled: "已取消" };
const cookingStages: Array<{ id: Order["status"]; label: string }> = [{ id: "confirmed", label: "接单" }, { id: "shopping", label: "买菜" }, { id: "preparing", label: "制作" }, { id: "done", label: "开饭" }];
const statusProgressIndex: Record<Order["status"], number> = { new: -1, confirmed: 0, shopping: 1, preparing: 2, done: 3, cancelled: -1 };
const statusUpdateNotes: Partial<Record<Order["status"], string>> = { confirmed: "饭局确认好啦，我会按时准备。", shopping: "正在挑新鲜食材，等你带着好胃口来。", preparing: "厨房已经开火，香味正在慢慢冒出来。", done: "开饭啦，今晚要吃得开心。", cancelled: "这场饭局先暂停，等我们下次再好好约。" };
const statusUpdateActionLabel: Partial<Record<Order["status"], string>> = { confirmed: "确认接单", shopping: "开始买菜", preparing: "开始制作", done: "通知开饭", cancelled: "发送取消通知" };
const statusUpdateSuccessNotice: Partial<Record<Order["status"], string>> = { confirmed: "已确认接单，朋友端已收到进度提醒", shopping: "已开始买菜，朋友端已收到进度提醒", preparing: "已开始制作，朋友端已收到进度提醒" };
const isArchivedOrder = (order: Order) => Boolean(order.archivedAt);
const isActiveKitchenOrder = (order: Order) => !isArchivedOrder(order) && order.status !== "done" && order.status !== "cancelled";
const categoryEmoji: Record<string, string> = {
  全部: "✦", 未分类: "📥", 家常热炒: "🍳", 江浙风味: "🌿", 川湘小馆: "🌶", 汤羹主食: "🥣", 海鲜: "🦐", 家常菜: "🥢",
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

function parsePublishedMenu(order?: Order): PublishedMenu | null {
  if (!order?.publishedMenu) return null;
  try { return JSON.parse(order.publishedMenu) as PublishedMenu; } catch { return null; }
}

function formatAmount(value: number, unit: string) {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  return `${rounded}${unit}`;
}

function dishThumbnailUrl(value?: string) {
  if (!value || !value.startsWith("/api/dish-images/")) return value || "";
  return `${value}${value.includes("?") ? "&" : "?"}size=thumb`;
}

function sharedGuestStorageKey(token: string) {
  return `ade-kitchen-shared-guest:${token}`;
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
  return { x: clamp(rawX, 0, 100), y: clamp(rawY, 0, 100), zoom: clamp(rawZoom, .6, 2.2) };
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

async function createCroppedCoverFile(image: HTMLImageElement, crop: ImageCrop, fileName: string) {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("照片还没有加载完成，请稍等一下再保存");
  const targetAspect = 1.48;
  const outputWidth = 1440;
  const outputHeight = Math.round(outputWidth / targetAspect);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法裁切照片");
  context.fillStyle = "#f5f0e9";
  context.fillRect(0, 0, outputWidth, outputHeight);
  const backgroundScale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight) * 1.1;
  const backgroundWidth = sourceWidth * backgroundScale;
  const backgroundHeight = sourceHeight * backgroundScale;
  context.save();
  context.filter = "blur(28px) saturate(.82)";
  context.globalAlpha = .78;
  context.drawImage(image, (outputWidth - backgroundWidth) / 2, (outputHeight - backgroundHeight) / 2, backgroundWidth, backgroundHeight);
  context.restore();
  context.fillStyle = "rgba(25,20,16,.12)";
  context.fillRect(0, 0, outputWidth, outputHeight);
  const baseScale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight);
  const fittedWidth = sourceWidth * baseScale;
  const fittedHeight = sourceHeight * baseScale;
  const positionX = crop.x / 100;
  const positionY = crop.y / 100;
  const fittedLeft = positionX * (outputWidth - fittedWidth);
  const fittedTop = positionY * (outputHeight - fittedHeight);
  const originX = positionX * outputWidth;
  const originY = positionY * outputHeight;
  context.save();
  context.translate(originX, originY);
  context.scale(crop.zoom, crop.zoom);
  context.translate(-originX, -originY);
  context.drawImage(image, fittedLeft, fittedTop, fittedWidth, fittedHeight);
  context.restore();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("照片裁切失败")), "image/jpeg", .9));
  const safeName = fileName.replace(/\.[^.]+$/, "").replace(/[^\w\u4e00-\u9fff-]+/g, "-").slice(0, 50) || "dish-cover";
  return new File([blob], `${safeName}-cover.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

export default function Home({ initialMode = "menu", chefUser = "", initialInviteToken = "" }: { initialMode?: "menu" | "chef"; chefUser?: string; initialInviteToken?: string }) {
  const dishFormRef = useRef<HTMLFormElement>(null);
  const dishGridRef = useRef<HTMLDivElement>(null);
  const mobileMenuSectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const banquetPreviewRef = useRef<HTMLDivElement>(null);
  const coverImageRef = useRef<HTMLImageElement>(null);
  const coverDragRef = useRef<{ pointerId: number; clientX: number; clientY: number; crop: ImageCrop } | null>(null);
  const recipeScreenshotUrlsRef = useRef<string[]>([]);
  const shoppingRequestChainsRef = useRef<Record<string, Promise<void>>>({});
  const mode = initialMode;
  const [chefView, setChefView] = useState<ChefView>("accepting");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [activeMobileCategory, setActiveMobileCategory] = useState("");
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [imageLightboxDish, setImageLightboxDish] = useState<Dish | null>(null);
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
  const [networkImageUrl, setNetworkImageUrl] = useState("");
  const [networkPreviewState, setNetworkPreviewState] = useState<"" | "loading" | "ready" | "error">("");
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
  const [bulkRecipeFile, setBulkRecipeFile] = useState<File | null>(null);
  const [bulkRecipePreview, setBulkRecipePreview] = useState<BulkRecipePreview | null>(null);
  const [bulkRecipeResult, setBulkRecipeResult] = useState<BulkRecipeResult | null>(null);
  const [bulkRecipeLoading, setBulkRecipeLoading] = useState<"preview" | "import" | null>(null);
  const [dataImporting, setDataImporting] = useState(false);
  const [recipeLibraryQuery, setRecipeLibraryQuery] = useState("");
  const [recipeLibraryCategory, setRecipeLibraryCategory] = useState("全部分类");
  const [recipeLibraryStatus, setRecipeLibraryStatus] = useState("全部状态");
  const [dishSortMode, setDishSortMode] = useState(false);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState("");
  const [bulkCategorySaving, setBulkCategorySaving] = useState(false);
  const [dishCategorySelection, setDishCategorySelection] = useState("");
  const [customDishCategory, setCustomDishCategory] = useState("");
  const [invites, setInvites] = useState<DinnerInvite[]>([]);
  const [journals, setJournals] = useState<DinnerJournal[]>([]);
  const [inviteMode, setInviteMode] = useState<"single" | "shared">("shared");
  const [inviteSelectedDishIds, setInviteSelectedDishIds] = useState<string[]>([]);
  const [inviteRecommendedDishIds, setInviteRecommendedDishIds] = useState<string[]>([]);
  const [inviteSelectionTouched, setInviteSelectionTouched] = useState(false);
  const [inviteDishQuery, setInviteDishQuery] = useState("");
  const [inviteDishCategory, setInviteDishCategory] = useState("全部分类");
  const [inviteCreating, setInviteCreating] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<DinnerInvite | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState("");
  const [activeInvite, setActiveInvite] = useState<DinnerInvite | null>(null);
  const [sharedDinner, setSharedDinner] = useState<SharedDinner | null>(null);
  const [sharedGuestName, setSharedGuestName] = useState("朋友");
  const sharedGuestNameDirtyRef = useRef(false);
  const [sharedGuestSaving, setSharedGuestSaving] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(Boolean(initialInviteToken));
  const [orderProgressUrl, setOrderProgressUrl] = useState("");
  const [orderSuccessOpen, setOrderSuccessOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [orderPendingDelete, setOrderPendingDelete] = useState<Order | null>(null);
  const [orderDeleting, setOrderDeleting] = useState(false);
  const [orderArchiving, setOrderArchiving] = useState("");
  const [guestOrderChecking, setGuestOrderChecking] = useState(initialMode === "menu");
  const [cookingChecks, setCookingChecks] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem("ade-kitchen-cooking-checks") || "{}"); } catch { return {}; }
  });
  const [banquetTemplate, setBanquetTemplate] = useState<BanquetTemplate>("home");
  const [banquetOrderId, setBanquetOrderId] = useState("");
  const [banquetItems, setBanquetItems] = useState<BanquetItem[]>([]);
  const [banquetDishId, setBanquetDishId] = useState("");
  const [banquetTitle, setBanquetTitle] = useState("今晚家宴");
  const [banquetTemplateName, setBanquetTemplateName] = useState(banquetTemplates[0].name);
  const [banquetDate, setBanquetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [banquetMessage, setBanquetMessage] = useState("为喜欢的人认真做一桌饭");
  const [banquetSubtitle, setBanquetSubtitle] = useState(banquetTemplates[0].subtitle);
  const [banquetOccasion, setBanquetOccasion] = useState(banquetTemplates[0].occasion);
  const [banquetChefCredit, setBanquetChefCredit] = useState("CHEF'S TABLE · 私房呈献");
  const [banquetGuestCount, setBanquetGuestCount] = useState(0);
  const [banquetCourseEdits, setBanquetCourseEdits] = useState<Partial<Record<BanquetCourse, { label: string; english: string }>>>({});
  const [banquetDishEdits, setBanquetDishEdits] = useState<Record<string, { name: string; description: string }>>({});
  const [serviceTime, setServiceTime] = useState("18:30");
  const [menuExporting, setMenuExporting] = useState<"png" | "jpeg" | "pdf" | null>(null);
  const [menuPublishing, setMenuPublishing] = useState(false);
  const [dishTimers, setDishTimers] = useState<Record<string, number>>({});
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [statusUpdateDraft, setStatusUpdateDraft] = useState<StatusUpdateDraft | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [kitchenOpen, setKitchenOpen] = useState(true);
  const [kitchenStatusSaving, setKitchenStatusSaving] = useState(false);
  const [imageLightboxAspect, setImageLightboxAspect] = useState(1.48);

  const courseText = (course: typeof banquetCourses[number]) => banquetCourseEdits[course.id] || { label: course.label, english: course.english };
  const dishText = (dish: Dish) => banquetDishEdits[dish.id] || { name: dish.name, description: dish.description || dish.flavor || "阿德认真准备的一道菜" };

  const openDishLightbox = (dish: Dish, trigger: HTMLButtonElement) => {
    const bounds = trigger.getBoundingClientRect();
    setImageLightboxAspect(bounds.width > 0 && bounds.height > 0 ? bounds.width / bounds.height : 1.48);
    setImageLightboxDish(dish);
  };

  useEffect(() => {
    if (!imageLightboxDish) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImageLightboxDish(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [imageLightboxDish]);

  useEffect(() => {
    const value = networkImageUrl.trim();
    if (!value) return;
    const timer = window.setTimeout(() => {
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
        setImagePreview((current) => {
          if (current.startsWith("blob:")) URL.revokeObjectURL(current);
          return `/api/image-preview?url=${encodeURIComponent(parsed.toString())}`;
        });
        setImageCrop(defaultImageCrop);
        setCropMode("");
        setAutoCropPending(true);
      } catch {
        setNetworkPreviewState("error");
        setImagePreview("");
        setAutoCropPending(false);
      }
    }, 420);
    return () => window.clearTimeout(timer);
  }, [networkImageUrl]);

  const dishCatalog = useMemo<Dish[]>(() => customDishes.length ? customDishes : (initialInviteToken ? [] : dishes), [customDishes, initialInviteToken]);
  const allDishes = useMemo(() => dishCatalog.filter((dish) => dish.active !== false && dish.available !== false), [dishCatalog]);
  const menuCategories = useMemo(() => managedCategories.length
    ? managedCategories.map((category) => category.name).filter((name) => allDishes.some((dish) => dish.category === name))
    : Array.from(new Set([...categories, ...allDishes.map((dish) => dish.category)])), [managedCategories, allDishes]);
  const filteredDishes = activeCategory === "全部"
    ? allDishes
    : allDishes.filter((dish) => dish.category === activeCategory);
  const recommendedDishes = useMemo(() => allDishes.filter((dish) => dish.featured), [allDishes]);
  const managedCategoryEmoji = useMemo(() => Object.fromEntries(managedCategories.map((category) => [category.name, category.emoji || categoryEmoji[category.name] || "•"])), [managedCategories]);
  const mobileMenuGroups = useMemo(() => {
    const groups: Array<{ name: string; dishes: Dish[] }> = [];
    menuCategories.forEach((category) => {
      const categoryDishes = allDishes.filter((dish) => dish.category === category);
      if (categoryDishes.length) groups.push({ name: category, dishes: categoryDishes });
    });
    return groups;
  }, [allDishes, menuCategories]);
  const recipeLibraryCategories = useMemo(() => {
    const managedNames = managedCategories.map((category) => category.name);
    const managedNameSet = new Set(managedNames);
    const legacyNames = Array.from(new Set(customDishes.map((dish) => dish.category))).filter((name) => !managedNameSet.has(name));
    return [...managedNames, ...legacyNames];
  }, [customDishes, managedCategories]);
  const filteredRecipeLibrary = useMemo(() => {
    const query = recipeLibraryQuery.trim().toLocaleLowerCase("zh-CN");
    return customDishes.filter((dish) => {
      const matchesQuery = !query || [dish.name, dish.category, dish.flavor, dish.slogan, dish.source].some((value) => value?.toLocaleLowerCase("zh-CN").includes(query));
      const matchesCategory = recipeLibraryCategory === "全部分类" || dish.category === recipeLibraryCategory;
      const matchesStatus = recipeLibraryStatus === "全部状态"
        || (recipeLibraryStatus === "正常供应" && dish.active !== false && dish.available !== false && !dish.soldOut)
        || (recipeLibraryStatus === "主厨推荐" && dish.featured)
        || (recipeLibraryStatus === "本期暂停" && dish.available === false)
        || (recipeLibraryStatus === "已售罄" && dish.soldOut)
        || (recipeLibraryStatus === "已归档" && dish.active === false);
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [customDishes, recipeLibraryCategory, recipeLibraryQuery, recipeLibraryStatus]);
  const canSortFilteredRecipes = recipeLibraryCategory !== "全部分类" && !recipeLibraryQuery.trim() && recipeLibraryStatus === "全部状态";
  const sortableActiveRecipes = canSortFilteredRecipes ? filteredRecipeLibrary.filter((dish) => dish.active !== false) : [];
  const selectedRecipeIdSet = useMemo(() => new Set(selectedRecipeIds), [selectedRecipeIds]);
  const allFilteredRecipesSelected = filteredRecipeLibrary.length > 0 && filteredRecipeLibrary.every((dish) => selectedRecipeIdSet.has(dish.id));
  const activeRecipeCount = customDishes.filter((dish) => dish.active !== false && dish.available !== false && !dish.soldOut).length;
  const featuredRecipeCount = customDishes.filter((dish) => dish.featured).length;

  const inviteSelectableDishes = allDishes;
  const inviteSelectedDishIdSet = useMemo(() => new Set(inviteSelectedDishIds), [inviteSelectedDishIds]);
  const inviteRecommendedDishIdSet = useMemo(() => new Set(inviteRecommendedDishIds), [inviteRecommendedDishIds]);
  const inviteCategoryOptions = useMemo(() => menuCategories.filter((category) => inviteSelectableDishes.some((dish) => dish.category === category)), [inviteSelectableDishes, menuCategories]);
  const inviteCategorySelected = (category: string) => !inviteSelectionTouched || inviteSelectableDishes.filter((dish) => dish.category === category).every((dish) => inviteSelectedDishIdSet.has(dish.id));
  const filteredInviteDishes = useMemo(() => {
    const query = inviteDishQuery.trim().toLocaleLowerCase("zh-CN");
    return inviteSelectableDishes.filter((dish) => {
      const matchesCategory = inviteDishCategory === "全部分类" || dish.category === inviteDishCategory;
      const matchesQuery = !query || [dish.name, dish.category, dish.description, dish.slogan].some((value) => value?.toLocaleLowerCase("zh-CN").includes(query));
      return matchesCategory && matchesQuery;
    });
  }, [inviteDishCategory, inviteDishQuery, inviteSelectableDishes]);
  const allInviteDishesSelected = filteredInviteDishes.length > 0 && filteredInviteDishes.every((dish) => !inviteSelectionTouched || inviteSelectedDishIdSet.has(dish.id));

  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const menuReadOnly = mode === "menu" && !kitchenOpen;
  const cartItems = allDishes
    .filter((dish) => cart[dish.id])
    .map((dish) => ({ ...dish, quantity: cart[dish.id] }));
  const sharedAggregateItems = sharedDinner?.aggregate.map((item) => ({ ...item, dish: allDishes.find((dish) => dish.id === item.dishId) })).filter((item): item is OrderItem & { dish: Dish } => Boolean(item.dish)) || [];
  const sharedAggregatePortionCount = sharedAggregateItems.reduce((sum, item) => sum + item.quantity, 0);
  const sharedDishSelections = useMemo(() => {
    const selections = new Map<string, Array<{ guestId: string; displayName: string; quantity: number }>>();
    sharedDinner?.selections.forEach((guest) => {
      guest.items.forEach((item) => {
        const list = selections.get(item.dishId) || [];
        list.push({ guestId: guest.guestId, displayName: guest.displayName || "朋友", quantity: item.quantity });
        selections.set(item.dishId, list);
      });
    });
    return selections;
  }, [sharedDinner]);
  const sharedDishTotals = useMemo(() => new Map((sharedDinner?.aggregate || []).map((item) => [item.dishId, item.quantity])), [sharedDinner]);
  const renderSharedDishSelections = (dishId: string) => {
    if (activeInvite?.mode !== "shared") return null;
    const selections = sharedDishSelections.get(dishId) || [];
    if (!selections.length) return null;
    const total = sharedDishTotals.get(dishId) || selections.reduce((sum, selection) => sum + selection.quantity, 0);
    return <div className="dish-selection-badge" aria-label={`这道菜已被朋友选中，共 ${total} 份`}><span>这桌已选 {total} 份</span>{selections.map((selection) => <b key={selection.guestId}>{selection.displayName}</b>)}</div>;
  };
  const activeOrders = useMemo(() => orders.filter(isActiveKitchenOrder), [orders]);
  const archivedOrders = useMemo(() => orders.filter(isArchivedOrder), [orders]);
  const pendingArchiveOrders = useMemo(() => orders.filter((order) => order.status === "done" && !isArchivedOrder(order)), [orders]);
  const activeBanquetTemplate = banquetTemplates.find((template) => template.id === banquetTemplate) || banquetTemplates[0];
  const selectedBanquetOrder = activeOrders.find((order) => order.id === banquetOrderId);
  const completedOrders = useMemo(() => orders.filter((order) => order.status === "done"), [orders]);
  const acceptingOrders = useMemo(() => activeOrders.filter((order) => order.status === "new"), [activeOrders]);
  const shoppingOrders = useMemo(() => activeOrders.filter((order) => order.status === "confirmed" || order.status === "shopping"), [activeOrders]);
  const productionOrders = useMemo(() => activeOrders.filter((order) => order.status === "shopping" || order.status === "preparing"), [activeOrders]);
  const servingReadyOrders = useMemo(() => activeOrders.filter((order) => order.status === "preparing"), [activeOrders]);
  const servingOrders = useMemo(() => [...servingReadyOrders, ...pendingArchiveOrders], [pendingArchiveOrders, servingReadyOrders]);
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
    if (!kitchenOpen) {
      setNotice("阿德今天休息，菜单可以慢慢看，等绿灯亮起再来点菜吧");
      return;
    }
    setCart((current) => {
      const next = Math.max(0, (current[dishId] || 0) + change);
      const updated = { ...current, [dishId]: next };
      if (next === 0) delete updated[dishId];
      return updated;
    });
    if (activeInvite?.mode === "shared" && sharedDinner?.guestToken) {
      const next = Math.max(0, (cart[dishId] || 0) + change);
      void fetch(`/api/invites/${activeInvite.token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set-selection", guestToken: sharedDinner.guestToken, dishId, quantity: next }) }).then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as { error?: string };
          setNotice(data.error || "这道菜刚刚被主厨下架了，已帮你刷新菜单");
          await loadInvite(activeInvite.token, true);
        }
      }).catch(() => setNotice("共享点菜同步失败，请稍后再试"));
    }
  };

  const selectMenuCategory = (category: string) => {
    setActiveCategory(category);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => dishGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  };

  const selectMobileMenuCategory = (category: string) => {
    setActiveMobileCategory(category);
    mobileMenuSectionRefs.current[category]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const composeFromOrder = (orderId: string) => {
    setBanquetOrderId(orderId);
    const order = activeOrders.find((item) => item.id === orderId);
    if (!order) {
      setBanquetItems([]);
      setBanquetGuestCount(0);
      setBanquetTitle(activeBanquetTemplate.defaultTitle);
      setBanquetTemplateName(activeBanquetTemplate.name);
      setBanquetDate(new Date().toISOString().slice(0, 10));
      setBanquetMessage(activeBanquetTemplate.defaultMessage);
      setBanquetSubtitle(activeBanquetTemplate.subtitle);
      setBanquetOccasion(activeBanquetTemplate.occasion);
      setBanquetCourseEdits({});
      setBanquetDishEdits({});
      return;
    }
    const uniqueIds = Array.from(new Set(parseItems(order).map((item) => item.dishId)));
    setBanquetItems(sortBanquetItemsByCourse(uniqueIds.map((dishId) => ({ dishId, course: courseForDish(dishCatalog.find((dish) => dish.id === dishId)) }))));
    setBanquetTitle(`${order.customerName}的${activeBanquetTemplate.name}`);
    setBanquetTemplateName(activeBanquetTemplate.name);
    setBanquetDate(order.mealDate);
    setBanquetMessage(order.note ? `今日心意：${order.note}` : `为 ${order.guestCount} 位朋友认真准备的一桌饭`);
    setBanquetGuestCount(order.guestCount);
    setBanquetSubtitle(activeBanquetTemplate.subtitle);
    setBanquetOccasion(activeBanquetTemplate.occasion);
    setBanquetCourseEdits({});
    setBanquetDishEdits({});
    setNotice(`已把 ${uniqueIds.length} 道菜自动排入宴席菜单`);
  };

  const startFreeBanquet = () => {
    composeFromOrder("");
    setNotice("已新建自由菜单，可以从菜谱库加入菜品并直接导出");
  };

  const selectBanquetTemplate = (template: typeof banquetTemplates[number]) => {
    setBanquetTemplate(template.id);
    setBanquetTitle(selectedBanquetOrder ? `${selectedBanquetOrder.customerName}的${template.name}` : template.defaultTitle);
    setBanquetTemplateName(template.name);
    setBanquetMessage(selectedBanquetOrder?.note ? `今日心意：${selectedBanquetOrder.note}` : template.defaultMessage);
    setBanquetSubtitle(template.subtitle);
    setBanquetOccasion(template.occasion);
  };

  const addBanquetDish = () => {
    if (!banquetDishId) return;
    if (banquetItems.some((item) => item.dishId === banquetDishId)) {
      setNotice("这道菜已经在宴席菜单中了");
      return;
    }
    const dish = dishCatalog.find((item) => item.id === banquetDishId);
    setBanquetItems((current) => sortBanquetItemsByCourse([...current, { dishId: banquetDishId, course: courseForDish(dish) }]));
    setBanquetDishId("");
  };

  const updateBanquetCourse = (dishId: string, course: BanquetCourse) => {
    setBanquetItems((current) => sortBanquetItemsByCourse(current.map((item) => item.dishId === dishId ? { ...item, course } : item)));
    const courseLabel = banquetCourses.find((item) => item.id === course)?.label || "新栏目";
    setNotice(`已移入${courseLabel}，整桌顺序也替你排好了`);
  };

  const moveBanquetDish = (dishId: string, direction: -1 | 1) => {
    setBanquetItems((current) => {
      const item = current.find((candidate) => candidate.dishId === dishId);
      if (!item) return current;
      const courseDishIds = current.filter((candidate) => candidate.course === item.course).map((candidate) => candidate.dishId);
      const courseIndex = courseDishIds.indexOf(dishId);
      const targetDishId = courseDishIds[courseIndex + direction];
      if (!targetDishId) return current;
      const index = current.findIndex((candidate) => candidate.dishId === dishId);
      const target = current.findIndex((candidate) => candidate.dishId === targetDishId);
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return sortBanquetItemsByCourse(next);
    });
  };

  const publishBanquetMenu = async () => {
    if (!selectedBanquetOrder) return setNotice("请先选择要接收菜单的朋友订单");
    if (!banquetDishes.length) return setNotice("请先把菜品排入正式菜单");
    setMenuPublishing(true);
    try {
      const publishedMenu: PublishedMenu = {
        title: banquetTitle || activeBanquetTemplate.defaultTitle,
        date: banquetDate,
        message: banquetMessage || activeBanquetTemplate.defaultMessage,
        template: banquetTemplate,
        templateName: banquetTemplateName || activeBanquetTemplate.name,
        subtitle: banquetSubtitle || activeBanquetTemplate.subtitle,
        occasion: banquetOccasion || activeBanquetTemplate.occasion,
        guestCount: banquetGuestCount > 0 ? banquetGuestCount : selectedBanquetOrder.guestCount,
        chefCredit: banquetChefCredit,
        courses: banquetCourses.map((course) => ({
          id: course.id,
          ...courseText(course),
          dishes: banquetDishes.filter((item) => item.course === course.id).map(({ dish }) => dishText(dish)),
        })),
      };
      const response = await fetch("/api/orders", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selectedBanquetOrder.id, action: "publish-menu", publishedMenu }) });
      const data = await response.json() as { order?: Order; error?: string };
      if (!response.ok || !data.order) throw new Error(data.error || "正式菜单推送失败");
      setOrders((current) => current.map((order) => order.id === data.order!.id ? data.order! : order));
      setNotice(`正式菜单已推送给${selectedBanquetOrder.customerName}，进度页会自动出现`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "正式菜单推送失败，请稍后重试");
    } finally {
      setMenuPublishing(false);
    }
  };

  const exportBanquetMenu = async (format: "png" | "jpeg" | "pdf") => {
    if (!banquetItems.length) {
      setNotice("请先从订单或菜谱库中加入菜品");
      return;
    }
    const node = banquetPreviewRef.current;
    if (!node) return setNotice("菜单预览还没有准备好，请稍后再试");
    setMenuExporting(format);
    try {
      await document.fonts.ready;
      const { toJpeg, toPng } = await import("html-to-image");
      const fileTitle = (banquetTitle || activeBanquetTemplate.defaultTitle || "阿德私房菜单").replace(/[\\/:*?"<>|]/g, "-").slice(0, 48);
      const imageOptions = { cacheBust: true, pixelRatio: 2, width: node.scrollWidth, height: node.scrollHeight };
      if (format === "jpeg") {
        const dataUrl = await toJpeg(node, { ...imageOptions, quality: .94, backgroundColor: "#f4ecdc" });
        const link = document.createElement("a");
        link.download = `${fileTitle}.jpg`;
        link.href = dataUrl;
        link.click();
      } else {
        const dataUrl = await toPng(node, imageOptions);
        if (format === "png") {
          const link = document.createElement("a");
          link.download = `${fileTitle}.png`;
          link.href = dataUrl;
          link.click();
        } else {
          const { jsPDF } = await import("jspdf");
          const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const imageRatio = node.scrollWidth / node.scrollHeight;
          let imageWidth = pageWidth;
          let imageHeight = imageWidth / imageRatio;
          if (imageHeight > pageHeight) {
            imageHeight = pageHeight;
            imageWidth = imageHeight * imageRatio;
          }
          pdf.addImage(dataUrl, "PNG", (pageWidth - imageWidth) / 2, (pageHeight - imageHeight) / 2, imageWidth, imageHeight, undefined, "FAST");
          pdf.save(`${fileTitle}.pdf`);
        }
      }
      setNotice(`菜单已导出为 ${format === "jpeg" ? "JPG" : format.toUpperCase()}`);
    } catch (error) {
      setNotice(error instanceof Error ? `菜单导出失败：${error.message}` : "菜单导出失败，请稍后再试");
    } finally {
      setMenuExporting(null);
    }
  };

  const loadOrders = async (silent = false) => {
    if (!silent) setLoadingOrders(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      const data = await response.json() as { orders?: Order[]; error?: string };
      if (!response.ok) throw new Error(data.error || "订单加载失败");
      const nextOrders = data.orders || [];
      setOrders(nextOrders);
      setBanquetOrderId((current) => current && !nextOrders.some((order) => order.id === current && isActiveKitchenOrder(order)) ? "" : current);
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

  const exportAllData = async () => {
    try {
      setNotice("正在整理菜谱、饭局和照片…");
      const response = await fetch("/api/admin/export", { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "数据导出失败");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `ade-kitchen-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice("全部数据已导出，压缩包已开始下载");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "数据导出失败，请稍后重试");
    }
  };

  const importAllData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!window.confirm("导入后会整体替换当前菜谱、饭局、邀请、库存和照片。当前会话密钥会保留，确定继续吗？")) return;
    setDataImporting(true);
    try {
      const chunkSize = 2 * 1024 * 1024;
      const uploadId = createClientRowId();
      let response: Response;
      if (file.size <= chunkSize) {
        const form = new FormData();
        form.set("file", file);
        response = await fetch("/api/admin/import", { method: "POST", body: form });
      } else {
        const totalChunks = Math.ceil(file.size / chunkSize);
        for (let index = 0; index < totalChunks; index += 1) {
          const start = index * chunkSize;
          const chunk = file.slice(start, Math.min(file.size, start + chunkSize));
          response = await fetch("/api/admin/import", {
            method: "POST",
            headers: {
              "content-type": "application/octet-stream",
              "x-import-upload-id": uploadId,
              "x-import-chunk-index": String(index),
              "x-import-total-chunks": String(totalChunks),
              "x-import-total-bytes": String(file.size),
            },
            body: chunk,
          });
          const chunkData = await response.json().catch(() => ({})) as { error?: string };
          if (!response.ok) throw new Error(chunkData.error || `备份上传失败（第 ${index + 1}/${totalChunks} 段）`);
          setNotice(`正在上传备份…${index + 1}/${totalChunks}`);
        }
        response = await fetch("/api/admin/import", { method: "POST", headers: { "x-import-upload-id": uploadId, "x-import-finalize": "1" } });
      }
      const data = await response.json().catch(() => ({})) as { result?: { dishes?: number; orders?: number; images?: number }; error?: string };
      if (!response.ok) throw new Error(data.error || "数据导入失败");
      await Promise.all([loadOrders(), loadDishes(), loadShoppingChecks(), loadCategories(), loadPantry(), loadInvites(), loadRecipePreferences()]);
      setNotice(`导入完成：${data.result?.dishes || 0} 道菜、${data.result?.orders || 0} 场饭局、${data.result?.images || 0} 个文件已恢复`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "数据导入失败，原数据已保留");
    } finally {
      setDataImporting(false);
    }
  };

  const saveSharedGuestName = async () => {
    if (!activeInvite || activeInvite.mode !== "shared" || !sharedDinner?.guestToken) return;
    const displayName = sharedGuestName.trim().slice(0, 30) || "朋友";
    setSharedGuestSaving(true);
    try {
      const response = await fetch(`/api/invites/${activeInvite.token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "join", guestToken: sharedDinner.guestToken, displayName }) });
      if (!response.ok) throw new Error();
      sharedGuestNameDirtyRef.current = false;
      setSharedGuestName(displayName);
      await loadInvite(activeInvite.token, true);
      setNotice(`已确认称呼：${displayName}，大家会看到你点的菜`);
    } catch { setNotice("称呼保存失败，请稍后再试"); }
    finally { setSharedGuestSaving(false); }
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
      if (response.ok && typeof data.open === "boolean") {
        setKitchenOpen(data.open);
        if (!data.open) {
          setCart({});
          setCartOpen(false);
          setCheckoutOpen(false);
        }
      }
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
      if (!data.open) {
        setCart({});
        setCartOpen(false);
        setCheckoutOpen(false);
      }
      setNotice(data.open ? "绿灯已亮，朋友端显示厨房今日营业" : "红灯已亮，朋友端显示厨房今天休息");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "营业状态保存失败");
    } finally {
      setKitchenStatusSaving(false);
    }
  };

  const loadInvite = async (token: string, silent = false) => {
    if (!silent) setInviteLoading(true);
    try {
      let guestToken = "";
      try { guestToken = window.localStorage.getItem(sharedGuestStorageKey(token)) || ""; } catch { /* 无痕模式仍可临时加入 */ }
      const response = await fetch(`/api/invites/${token}${guestToken ? `?guestToken=${encodeURIComponent(guestToken)}` : ""}`, { cache: "no-store" });
      const data = await response.json() as { invite?: DinnerInvite; dishes?: ManagedDish[]; shared?: SharedDinner; error?: string };
      if (!response.ok || !data.invite) throw new Error(data.error || "邀请加载失败");
      setActiveInvite(data.invite);
      setCustomDishes(data.dishes || []);
      if (data.shared) {
        setSharedDinner(data.shared);
        const currentGuest = data.shared.guests.find((guest) => guest.id === data.shared?.guestId);
        if (currentGuest && !sharedGuestNameDirtyRef.current) setSharedGuestName(currentGuest.displayName);
        const own = data.shared.selections.find((item) => item.guestId === data.shared?.guestId);
        if (own) setCart(Object.fromEntries(own.items.map((item) => [item.dishId, item.quantity])));
        if (!guestToken || !data.shared.guestId) {
          const joinResponse = await fetch(`/api/invites/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "join", guestToken, displayName: sharedGuestName || "朋友" }) });
          const joined = await joinResponse.json().catch(() => ({})) as { guestToken?: string };
          if (joined.guestToken) {
            try { window.localStorage.setItem(sharedGuestStorageKey(token), joined.guestToken); } catch { /* ignore */ }
            if (!silent) await loadInvite(token, true);
          }
        }
      } else {
        setSharedDinner(null);
      }
      if (!silent) setActiveCategory("全部");
    } catch (error) {
      if (!silent) setNotice(error instanceof Error ? error.message : "邀请加载失败");
    } finally {
      if (!silent) setInviteLoading(false);
    }
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
    if (mode !== "menu") return;
    let active = true;
    let redirecting = false;
    const bootstrap = window.setTimeout(async () => {
      let token = "";
      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get("add") === "1") {
          if (active) setGuestOrderChecking(false);
          return;
        }
        if (currentUrl.searchParams.get("order") === "archived") {
          window.localStorage.removeItem(activeGuestOrderStorageKey);
          currentUrl.searchParams.delete("order");
          window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
          if (active) setGuestOrderChecking(false);
          return;
        }
        token = window.localStorage.getItem(activeGuestOrderStorageKey) || "";
        if (!isGuestOrderToken(token)) {
          window.localStorage.removeItem(activeGuestOrderStorageKey);
          if (active) setGuestOrderChecking(false);
          return;
        }
        const response = await fetch(`/api/order-status/${token}`, { cache: "no-store" });
        if (response.ok) {
          const payload = await response.json() as { order?: { archivedAt?: string } };
          if (payload.order?.archivedAt) {
            window.localStorage.removeItem(activeGuestOrderStorageKey);
            if (active) setGuestOrderChecking(false);
            return;
          }
        } else if (response.status === 404) {
          window.localStorage.removeItem(activeGuestOrderStorageKey);
          if (active) setGuestOrderChecking(false);
          return;
        }
        redirecting = true;
        window.location.replace(`/order/${token}`);
      } catch {
        if (isGuestOrderToken(token)) {
          redirecting = true;
          window.location.replace(`/order/${token}`);
        } else if (active) {
          setGuestOrderChecking(false);
        }
      } finally {
        if (active && !redirecting) setGuestOrderChecking(false);
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(bootstrap);
    };
  }, [mode]);

  useEffect(() => {
    let timer = 0;
    const bootstrap = window.setTimeout(() => {
      loadKitchenStatus();
      if (initialInviteToken) loadInvite(initialInviteToken);
      else { loadDishes(); loadCategories(); }
      if (mode === "menu") {
        timer = window.setInterval(() => {
          loadKitchenStatus();
          if (initialInviteToken) loadInvite(initialInviteToken, true);
          else { loadDishes(); loadCategories(); }
        }, initialInviteToken ? 5000 : 15000);
      }
    }, 0);
    return () => {
      window.clearTimeout(bootstrap);
      if (timer) window.clearInterval(timer);
    };
  }, [initialInviteToken, mode]);

  useEffect(() => {
    const addModeFromUrl = typeof window !== "undefined" && new URL(window.location.href).searchParams.get("add") === "1";
    if (mode !== "menu" || !initialInviteToken || addModeFromUrl || orderProgressUrl) return;
    const orderToken = sharedDinner?.orderToken;
    if (!orderToken) return;
    window.location.replace(`/order/${orderToken}`);
  }, [initialInviteToken, mode, orderProgressUrl, sharedDinner?.orderToken]);

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

  useEffect(() => {
    if (mode !== "menu" || !mobileMenuGroups.length) return;
    let animationFrame = 0;
    const syncMobileCategory = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        if (window.innerWidth > 720) return;
        let current = mobileMenuGroups[0].name;
        mobileMenuGroups.forEach((group) => {
          const section = mobileMenuSectionRefs.current[group.name];
          if (section && section.getBoundingClientRect().top <= 128) current = group.name;
        });
        setActiveMobileCategory((value) => value === current ? value : current);
      });
    };
    syncMobileCategory();
    window.addEventListener("scroll", syncMobileCategory, { passive: true });
    window.addEventListener("resize", syncMobileCategory);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", syncMobileCategory);
      window.removeEventListener("resize", syncMobileCategory);
    };
  }, [mobileMenuGroups, mode]);

  useEffect(() => () => {
    recipeScreenshotUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    recipeScreenshotUrlsRef.current = [];
  }, []);

  const shoppingList = useMemo(() => {
    const totals = new Map<string, { itemKey: string; dishName: string; name: string; amount: number; unit: string; type: string; location: string; stockUsed: number }>();
    activeOrders.forEach((order) => {
      const snapshots = parseDishSnapshot(order);
      parseItems(order).forEach((item) => {
        const snapshot = snapshots.find((candidate) => candidate.dishId === item.dishId);
        const dish = dishCatalog.find((candidate) => candidate.id === item.dishId);
        const dishName = snapshot?.name || dish?.name || "历史菜品";
        const ingredients = snapshot?.ingredients || dish?.ingredients || [];
        // 采购永远按每道菜的原始配方分量显示，不按人数或点菜数量换算。
        ingredients.forEach((ingredient) => {
          const name = normalizedIngredientName(ingredient.name);
          const key = `${item.dishId || dishName}::${name}::${ingredient.unit}`;
          const current = totals.get(key);
          totals.set(key, {
            itemKey: key.slice(0, 120),
            dishName,
            ...ingredient,
            name,
            location: shoppingLocation(ingredient.type),
            stockUsed: 0,
            amount: (current?.amount || 0) + ingredient.amount,
          });
        });
      });
    });
    const remainingStock = new Map<string, number>();
    pantryItems.forEach((pantry) => {
      const key = `${normalizedIngredientName(pantry.name)}::${pantry.unit}`;
      remainingStock.set(key, (remainingStock.get(key) || 0) + pantry.amount);
    });
    return Array.from(totals.values()).map((item) => {
      const stockKey = `${item.name}::${item.unit}`;
      const stocked = remainingStock.get(stockKey) || 0;
      const stockUsed = Math.min(item.amount, stocked);
      remainingStock.set(stockKey, Math.max(0, stocked - stockUsed));
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
        // 制作台永远沿用菜谱原始分量；订单人数和点菜数量都不参与用料换算。
        ingredients.forEach((ingredient) => {
          const name = normalizedIngredientName(ingredient.name);
          const key = `${name}-${ingredient.unit}`;
          const current = merged.get(key) || { key, name, amount: 0, unit: ingredient.unit, type: ingredient.type, action: prepActionForIngredient(ingredient.type, name), dishes: new Set<string>() };
          current.amount += ingredient.amount;
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
    const previous = Boolean(shoppingChecks[itemKey]);
    setShoppingChecks((current) => ({ ...current, [itemKey]: checked }));
    const request = async () => {
      const response = await fetch("/api/shopping", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemKey, checked }) });
      if (!response.ok) throw new Error();
    };
    const previousRequest = shoppingRequestChainsRef.current[itemKey] || Promise.resolve();
    const currentRequest = previousRequest.then(request);
    shoppingRequestChainsRef.current[itemKey] = currentRequest;
    try {
      await currentRequest;
    } catch {
      // 只有这次操作仍是当前值时才回滚，避免较早的失败覆盖用户刚刚的新选择。
      setShoppingChecks((current) => current[itemKey] === checked ? { ...current, [itemKey]: previous } : current);
      setNotice("采购状态保存失败，已恢复原状态，请再试一次");
    } finally {
      if (shoppingRequestChainsRef.current[itemKey] === currentRequest) delete shoppingRequestChainsRef.current[itemKey];
    }
  };

  const resetShoppingChecks = async () => {
    const response = await fetch("/api/shopping", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ reset: true }) });
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
      const byDish = new Map<string, typeof items>();
      items.forEach((item) => byDish.set(item.dishName, [...(byDish.get(item.dishName) || []), item]));
      lines.push(`\n【${location}】`);
      byDish.forEach((dishItems, dishName) => lines.push(`  · ${dishName}`, ...dishItems.map((item) => `    ${shoppingChecks[item.itemKey] ? "✓" : "□"} ${item.name} ${formatAmount(item.amount, item.unit)}`)));
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
    const response = await fetch("/api/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), emoji: form.get("emoji") }) });
    const data = await response.json() as { category?: MenuCategory; error?: string };
    if (!response.ok || !data.category) return setNotice(data.error || "分类添加失败");
    setManagedCategories((current) => current.some((item) => item.id === data.category!.id) ? current : [...current, data.category!]);
    formElement.reset();
  };

  const renameCategory = async (category: MenuCategory) => {
    const value = window.prompt(`把“${category.name}”改成：`, category.name);
    if (!value?.trim()) return;
    const response = await fetch("/api/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: category.id, name: value.trim() }) });
    const data = await response.json() as { categories?: MenuCategory[]; error?: string };
    if (!response.ok) return setNotice(data.error || "分类更新失败");
    setManagedCategories(data.categories || []);
    await loadDishes();
    setNotice(`“${category.name}”已改名为“${value.trim()}”`);
  };

  const deleteCategory = async (category: MenuCategory) => {
    const dishCount = customDishes.filter((dish) => dish.category === category.name).length;
    const message = dishCount > 0
      ? `确定删除“${category.name}”吗？其中 ${dishCount} 道菜会全部移到“未分类”，菜谱本身不会删除。`
      : `确定删除空分类“${category.name}”吗？`;
    if (!window.confirm(message)) return;
    const response = await fetch(`/api/categories?id=${encodeURIComponent(category.id)}`, { method: "DELETE" });
    const data = await response.json() as { categories?: MenuCategory[]; movedCount?: number; error?: string };
    if (!response.ok) return setNotice(data.error || "分类删除失败");
    setManagedCategories(data.categories || []);
    if (recipeLibraryCategory === category.name) setRecipeLibraryCategory("未分类");
    if (bulkCategoryTarget === category.name) setBulkCategoryTarget("");
    await loadDishes();
    setNotice(dishCount > 0 ? `已删除“${category.name}”，${data.movedCount || dishCount} 道菜已移到“未分类”` : `已删除空分类“${category.name}”`);
  };

  const moveCategory = async (category: MenuCategory, direction: -1 | 1) => {
    const response = await fetch("/api/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: category.id, direction }) });
    const data = await response.json() as { categories?: MenuCategory[] };
    if (response.ok) setManagedCategories(data.categories || []);
  };

  const moveDish = async (dish: ManagedDish, move: "up" | "down" | "top" | "bottom") => {
    try {
      const response = await fetch("/api/dishes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: dish.id, move }) });
      const data = await response.json() as { dish?: ManagedDish; error?: string };
      if (!response.ok) throw new Error(data.error || "菜品排序失败");
      await loadDishes();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "菜品排序失败");
    }
  };

  const updateCategoryEmoji = async (category: MenuCategory, value: string) => {
    const emoji = value.trim().slice(0, 16);
    if (emoji === (category.emoji || "")) return;
    const response = await fetch("/api/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: category.id, emoji }) });
    const data = await response.json() as { categories?: MenuCategory[]; error?: string };
    if (!response.ok) return setNotice(data.error || "分类图标保存失败");
    setManagedCategories(data.categories || []);
    setNotice(emoji ? `“${category.name}”的图标已改为 ${emoji}` : `已恢复“${category.name}”的默认图标`);
  };

  const toggleRecipeSelection = (dishId: string) => {
    setSelectedRecipeIds((current) => current.includes(dishId) ? current.filter((id) => id !== dishId) : [...current, dishId]);
  };

  const toggleAllFilteredRecipes = () => {
    const visibleIds = filteredRecipeLibrary.map((dish) => dish.id);
    setSelectedRecipeIds((current) => allFilteredRecipesSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])));
  };

  const moveSelectedRecipesToCategory = async () => {
    if (!selectedRecipeIds.length) return setNotice("请先勾选要整理的菜谱");
    if (!bulkCategoryTarget) return setNotice("请选择要加入的大类");
    setBulkCategorySaving(true);
    try {
      const response = await fetch("/api/dishes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selectedRecipeIds, category: bulkCategoryTarget }),
      });
      const data = await response.json() as { updated?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "批量分类失败");
      await loadDishes();
      setNotice(`已把 ${data.updated || selectedRecipeIds.length} 道菜加入“${bulkCategoryTarget}”`);
      setSelectedRecipeIds([]);
      setBulkCategoryTarget("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "批量分类失败");
    } finally {
      setBulkCategorySaving(false);
    }
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!kitchenOpen) return setNotice("阿德今天休息，菜单可以慢慢看，等绿灯亮起再来点菜吧");
    const formElement = event.currentTarget;
    setSubmitting(true);
    const form = new FormData(formElement);
    try {
      const shared = activeInvite?.mode === "shared" && sharedDinner?.guestToken;
      const response = await fetch(shared ? `/api/invites/${activeInvite!.token}` : "/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(shared ? { action: "submit", guestToken: sharedDinner!.guestToken } : {}),
          customerName: form.get("customerName"),
          mealDate: form.get("mealDate"),
          guestCount: Number(form.get("guestCount")),
          note: form.get("note"),
          ...(shared ? {} : { dishes: cartItems.map((item) => ({ dishId: item.id, quantity: item.quantity })), inviteToken: initialInviteToken || undefined }),
        }),
      });
      const data = await response.json() as { error?: string; guestToken?: string; orderToken?: string };
      if (!response.ok) throw new Error(data.error || "提交失败，请再试一次");
      setCart({});
      setCheckoutOpen(false);
      setCartOpen(false);
      const progressToken = data.orderToken || data.guestToken;
      if (progressToken) {
        try { window.localStorage.setItem(activeGuestOrderStorageKey, progressToken); } catch { /* 当前进度链接仍可正常打开 */ }
        setOrderProgressUrl(`/order/${progressToken}`);
        setOrderSuccessOpen(true);
      }
      if (shared) await loadInvite(activeInvite!.token, true);
      setNotice(shared ? "已把这一桌大家选的菜汇总送进厨房 🍽️" : "点菜成功！厨房进度卡已经准备好 🍽️");
      formElement.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提交失败，请再试一次");
    } finally {
      setSubmitting(false);
    }
  };

  const updateOrderStatus = (id: string, status: Order["status"]) => {
    const order = orders.find((item) => item.id === id);
    if (!order || !statusUpdateActionLabel[status]) return;
    setStatusUpdateDraft({ orderId: id, status, note: statusUpdateNotes[status] || "" });
  };

  const submitOrderStatusUpdate = async () => {
    if (!statusUpdateDraft || statusUpdating) return;
    const { orderId: id, status, note } = statusUpdateDraft;
    let sent = false;
    setStatusUpdating(true);
    try {
      const progressNote = note.trim() || statusUpdateNotes[status] || "";
      const response = await fetch("/api/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "update-status", status, progressNote }),
      });
      const data = await response.json() as { order?: Order; error?: string };
      if (!response.ok || !data.order) throw new Error(data.error || "更新失败");
      setOrders((current) => current.map((order) => order.id === id ? data.order! : order));
      if (status === "done" || status === "cancelled") setBanquetOrderId((current) => current === id ? "" : current);
      if (status === "done") setNotice("开饭强提醒已发出；饭局会保留在“待确认归档”中");
      else if (status === "cancelled") setNotice("取消通知已发出，订单已归档");
      else setNotice(statusUpdateSuccessNotice[status] || "进度已更新，朋友端会弹窗提醒");
      sent = true;
    } catch {
      setNotice("状态更新失败，请稍后重试");
    } finally {
      setStatusUpdating(false);
      if (sent) setStatusUpdateDraft(null);
    }
  };

  const archiveOrder = async (order: Order) => {
    if (order.status !== "done" || isArchivedOrder(order)) return;
    if (!window.confirm(`确认归档“${order.customerName}”的这顿饭吗？归档后，对方下次打开链接会重新进入点菜首页。`)) return;
    setOrderArchiving(order.id);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: order.id, action: "archive-order" }),
      });
      const data = await response.json() as { order?: Order; error?: string };
      if (!response.ok || !data.order) throw new Error(data.error || "归档失败");
      setOrders((current) => current.map((item) => item.id === order.id ? data.order! : item));
      if (banquetOrderId === order.id) setBanquetOrderId("");
      setNotice(`“${order.customerName}”的饭局已确认归档，对方下次可以重新点菜`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "归档失败，请稍后重试");
    } finally {
      setOrderArchiving("");
    }
  };

  const deleteArchivedOrder = async (order: Order) => {
    if (!isArchivedOrder(order)) return;
    setOrderDeleting(true);
    try {
      const response = await fetch("/api/orders", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: order.id, action: "delete-order" }) });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "删除失败");
      setOrders((current) => current.filter((item) => item.id !== order.id));
      if (banquetOrderId === order.id) setBanquetOrderId("");
      setOrderPendingDelete(null);
      setNotice(`“${order.customerName}”的饭局已永久删除`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "饭局删除失败，请稍后重试");
    } finally {
      setOrderDeleting(false);
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
      {order.statusUpdatedAt && <p className={`order-progress-read${order.statusReadAt === order.statusUpdatedAt ? " read" : ""}`}><span>{order.statusReadAt === order.statusUpdatedAt ? "✓ 朋友已读" : "○ 等待朋友确认"}</span>{order.statusReadAt === order.statusUpdatedAt ? "提醒已确认" : "朋友打开进度页后会在这里显示"}</p>}
      <div className="status-actions">
        {!archived && order.status === "new" && <button onClick={() => updateOrderStatus(order.id, "confirmed")}>确认接单</button>}
        {!archived && order.status === "confirmed" && <button onClick={() => updateOrderStatus(order.id, "shopping")}>开始买菜</button>}
        {!archived && order.status === "shopping" && <button onClick={() => updateOrderStatus(order.id, "preparing")}>开始制作</button>}
        {!archived && order.status === "preparing" && <button className="ready-alert" onClick={() => updateOrderStatus(order.id, "done")}><span aria-hidden="true">🔔</span> 通知开饭 · 强提醒</button>}
        {!archived && order.status === "done" && <button className="archive-confirm" disabled={orderArchiving === order.id} onClick={() => void archiveOrder(order)}><span aria-hidden="true">✓</span> {orderArchiving === order.id ? "正在归档…" : "确认归档这顿饭"}</button>}
        {archived && <button className="quiet" onClick={() => updateOrderStatus(order.id, "confirmed")}>重新打开订单</button>}
        {archived && <button className="delete-order" onClick={() => setOrderPendingDelete(order)}>删除饭局</button>}
        {!archived && order.status !== "done" && <button className="quiet" onClick={() => updateOrderStatus(order.id, "cancelled")}>取消饭局</button>}
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
    setNetworkImageUrl("");
    setNetworkPreviewState("");
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
    if (networkImageUrl.trim()) setNetworkPreviewState("ready");
    if (autoCropPending) applySmartCrop(image);
  };

  const handleCoverImageError = async () => {
    setAutoCropPending(false);
    setCropMode("");
    if (!networkImageUrl.trim()) return;
    setNetworkPreviewState("error");
    try {
      const response = await fetch(`/api/image-preview?url=${encodeURIComponent(networkImageUrl.trim())}`, { cache: "no-store" });
      const payload = await response.json() as { error?: string };
      setNotice(payload.error || "网络图片无法预览，请检查地址或换一张图片");
    } catch {
      setNotice("网络图片无法预览，请检查地址或换一张图片");
    }
  };

  const updateImageCrop = (next: Partial<ImageCrop>, mode: "auto" | "manual" = "manual") => {
    setImageCrop((current) => ({
      x: clamp(next.x ?? current.x, 0, 100),
      y: clamp(next.y ?? current.y, 0, 100),
      zoom: clamp(next.zoom ?? current.zoom, .6, 2.2),
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
    const usesManagedCategory = managedCategories.some((category) => category.name === draft.category);
    setDishCategorySelection(usesManagedCategory ? draft.category : "__custom__");
    setCustomDishCategory(usesManagedCategory ? "" : draft.category);
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
    if (/^https?:\/\//i.test(dish.imageUrl || "")) {
      setNetworkImageUrl(dish.imageUrl || "");
      setNetworkPreviewState("loading");
      setImagePreview("");
    } else {
      setNetworkImageUrl("");
      setNetworkPreviewState("");
      setImagePreview(dish.imageUrl || "");
    }
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
    setNetworkImageUrl("");
    setNetworkPreviewState("");
    setImageCrop(defaultImageCrop);
    setCropMode("");
    setAutoCropPending(false);
    setDishCategorySelection("");
    setCustomDishCategory("");
  };

  const startNewDish = () => {
    cancelEditingDish();
    window.setTimeout(() => dishFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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

  const previewBulkRecipeFile = async (file: File) => {
    setBulkRecipeLoading("preview");
    setBulkRecipePreview(null);
    setBulkRecipeResult(null);
    try {
      const form = new FormData();
      form.set("action", "preview");
      form.set("file", file);
      const response = await fetch("/api/recipe-bulk-import", { method: "POST", body: form });
      const data = await response.json() as { preview?: BulkRecipePreview; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error || "菜谱文件预览失败");
      setBulkRecipePreview(data.preview);
      setNotice(`预览完成：将新增 ${data.preview.toInsert} 道、更新 ${data.preview.toUpdate} 道菜`);
    } catch (error) {
      setBulkRecipeFile(null);
      setNotice(error instanceof Error ? error.message : "菜谱文件预览失败");
    } finally {
      setBulkRecipeLoading(null);
    }
  };

  const selectBulkRecipeFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setBulkRecipeFile(file);
    setBulkRecipePreview(null);
    setBulkRecipeResult(null);
    if (file) void previewBulkRecipeFile(file);
  };

  const confirmBulkRecipeImport = async () => {
    if (!bulkRecipeFile || !bulkRecipePreview) return setNotice("请先选择并预览菜谱 JSON 文件");
    setBulkRecipeLoading("import");
    try {
      const form = new FormData();
      form.set("action", "import");
      form.set("file", bulkRecipeFile);
      form.set("fingerprint", bulkRecipePreview.fingerprint);
      const response = await fetch("/api/recipe-bulk-import", { method: "POST", body: form });
      const data = await response.json() as { ok?: boolean; result?: BulkRecipeResult; error?: string };
      if (!response.ok || !data.ok || !data.result) throw new Error(data.error || "批量导入失败");
      setBulkRecipeResult(data.result);
      await Promise.all([loadDishes(), loadCategories()]);
      setNotice(`导入完成：新增 ${data.result.inserted} 道、更新 ${data.result.updated} 道菜，数据库已自动备份`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "批量导入失败，请稍后重试");
    } finally {
      setBulkRecipeLoading(null);
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
    const resolvedCategory = dishCategorySelection === "__custom__" ? customDishCategory.trim() : dishCategorySelection;
    form.set("category", resolvedCategory);
    form.set("ingredients", JSON.stringify(ingredientRows.map(({ name, amount, unit, type }) => ({ name, amount, unit, type }))));
    if (!form.get("substitutions")) form.set("substitutions", JSON.stringify(recipeDraft?.substitutions || editingDish?.substitutions || []));
    if (editingDish) form.set("id", editingDish.id);
    try {
      if (networkImageUrl.trim() && networkPreviewState !== "ready") throw new Error("网络图片还没有预览成功，请稍等或换一个地址");
      if (imagePreview && (cropMode === "auto" || cropMode === "manual")) {
        const image = coverImageRef.current;
        if (!image) throw new Error("照片取景还没有准备好，请稍等一下再保存");
        const croppedCover = await createCroppedCoverFile(image, imageCrop, String(form.get("name") || "dish-cover"));
        form.set("image", croppedCover, croppedCover.name);
        form.delete("imageUrl");
        form.set("imagePosition", "center");
      }
      const response = await fetch("/api/dishes", { method: editingDish ? "PUT" : "POST", body: form });
      const data = await response.json() as { dish?: ManagedDish; error?: string };
      if (!response.ok || !data.dish) throw new Error(data.error || "菜品保存失败");
      setCustomDishes((current) => editingDish
        ? current.map((dish) => dish.id === data.dish!.id ? data.dish! : dish)
        : [data.dish!, ...current]);
      formElement.reset();
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
      setImagePreview("");
      setNetworkImageUrl("");
      setNetworkPreviewState("");
      setImageCrop(defaultImageCrop);
      setCropMode("");
      setAutoCropPending(false);
      setIngredientRows([newIngredientRow()]);
      setDishCategorySelection("");
      setCustomDishCategory("");
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

  const toggleAllInviteDishes = () => {
    const baseIds = inviteSelectionTouched ? inviteSelectedDishIds : inviteSelectableDishes.map((dish) => dish.id);
    const nextIds = allInviteDishesSelected
      ? baseIds.filter((id) => !filteredInviteDishes.some((dish) => dish.id === id))
      : Array.from(new Set([...baseIds, ...filteredInviteDishes.map((dish) => dish.id)]));
    setInviteSelectionTouched(true);
    setInviteSelectedDishIds(nextIds);
    if (allInviteDishesSelected) setInviteRecommendedDishIds([]);
  };

  const toggleInviteDish = (dishId: string, checked: boolean) => {
    setInviteSelectionTouched(true);
    setInviteSelectedDishIds((current) => {
      const base = inviteSelectionTouched ? current : inviteSelectableDishes.map((dish) => dish.id);
      return checked ? Array.from(new Set([...base, dishId])) : base.filter((id) => id !== dishId);
    });
    if (!checked) setInviteRecommendedDishIds((current) => current.filter((id) => id !== dishId));
  };

  const toggleInviteCategory = (category: string, checked: boolean) => {
    setInviteSelectionTouched(true);
    const categoryIds = inviteSelectableDishes.filter((dish) => dish.category === category).map((dish) => dish.id);
    setInviteSelectedDishIds((current) => {
      const base = inviteSelectionTouched ? current : inviteSelectableDishes.map((dish) => dish.id);
      return checked ? Array.from(new Set([...base, ...categoryIds])) : base.filter((id) => !categoryIds.includes(id));
    });
    if (!checked) setInviteRecommendedDishIds((current) => current.filter((id) => !categoryIds.includes(id)));
  };

  const copyInviteLink = async (invite: DinnerInvite) => {
    const url = `${window.location.origin}/invite/${invite.token}`;
    setCreatedInvite(invite);
    setCreatedInviteUrl(url);
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch { /* 鏃犳潈闄愭椂缁х画浣跨敤鍏煎鍥為€€ */ }
      }
      if (!copied) {
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      setNotice("邀请链接已复制，直接发给朋友即可");
    } catch {
      setNotice("链接已生成，请复制下方地址发给朋友");
    }
  };

  const createInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inviteCreating) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedDishIds = inviteSelectedDishIds.length || inviteSelectionTouched ? inviteSelectedDishIds : form.getAll("dishIds").map(String);
    const dishIds = inviteMode === "shared" && !inviteSelectionTouched && !selectedDishIds.length ? inviteSelectableDishes.map((dish) => dish.id) : selectedDishIds;
    const recommendedDishIds = inviteRecommendedDishIds.length ? inviteRecommendedDishIds : form.getAll("recommendedDishIds").map(String);
    setInviteCreating(true);
    try {
      const response = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.get("title"), message: form.get("message"), mealDate: form.get("mealDate"), theme: form.get("theme"), mode: inviteMode, dishIds, recommendedDishIds }) });
      const data = await response.json().catch(() => ({})) as { invite?: DinnerInvite; error?: string };
      if (!response.ok || !data.invite) throw new Error(data.error || `邀请创建失败（${response.status}）`);
      const invite = data.invite;
      setInvites((current) => [invite, ...current]);
      setCreatedInvite(invite);
      setCreatedInviteUrl(`${window.location.origin}/invite/${invite.token}`);
      formElement.reset();
      setInviteMode("shared");
      setInviteSelectedDishIds([]);
      setInviteRecommendedDishIds([]);
      setInviteSelectionTouched(false);
      setInviteDishQuery("");
      setInviteDishCategory("全部分类");
      setNotice(invite.mode === "shared" ? "多人共享饭局已生成，复制链接发给几位朋友即可一起选菜" : "专属邀请已生成，复制链接发给朋友即可");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "邀请创建失败，请稍后重试");
    } finally {
      setInviteCreating(false);
    }
  };

  const shareInvite = async (invite: DinnerInvite) => {
    const url = `${window.location.origin}/invite/${invite.token}`;
    setCreatedInvite(invite);
    setCreatedInviteUrl(url);
    const canShare = typeof navigator.share === "function";
    try {
      if (canShare) await navigator.share({ title: invite.title, text: invite.message || "来阿德小厨房点菜吧", url });
      else await copyInviteLink(invite);
      setNotice(canShare ? "邀请卡已打开分享" : "邀请链接已复制");
    } catch (error) { if ((error as Error).name !== "AbortError") setNotice("分享失败，请稍后重试"); }
  };

  const toggleInvite = async (invite: DinnerInvite) => {
    const response = await fetch("/api/invites", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: invite.id, active: !invite.active }) });
    if (!response.ok) return setNotice("邀请状态更新失败");
    setInvites((current) => current.map((item) => item.id === invite.id ? { ...item, active: !item.active } : item));
  };

  const deleteInvite = async (invite: DinnerInvite) => {
    if (!window.confirm(`确定删除“${invite.title}”这份邀请吗？删除后，朋友将不能再通过这条链接进入，但已经形成的订单和餐桌日记会保留。`)) return;
    const response = await fetch(`/api/invites?id=${encodeURIComponent(invite.id)}`, { method: "DELETE", credentials: "same-origin" });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) return setNotice(data.error || "邀请删除失败");
    setInvites((current) => current.filter((item) => item.id !== invite.id));
    if (createdInvite?.id === invite.id) setCreatedInvite(null);
    setNotice("邀请已删除，相关订单和餐桌日记仍然保留");
  };

  const saveJournal = async (event: FormEvent<HTMLFormElement>, order: Order) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget); form.set("orderId", order.id);
    const response = await fetch("/api/journals", { method: "POST", body: form });
    const data = await response.json() as { journal?: DinnerJournal; error?: string };
    if (!response.ok || !data.journal) return setNotice(data.error || "餐桌日记保存失败");
    setJournals((current) => [data.journal!, ...current.filter((item) => item.id !== data.journal!.id && item.orderId !== order.id)]);
    setNotice("餐桌日记已保存，朋友的进度页也会看到");
  };

  const deleteJournal = async (journal: DinnerJournal) => {
    if (!window.confirm("确定删除这篇餐桌日记吗？日记文字和已上传照片会一并删除，但饭局订单会保留。")) return;
    const response = await fetch(`/api/journals?id=${encodeURIComponent(journal.id)}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (!response.ok) return setNotice(data.error || "餐桌日记删除失败");
    setJournals((current) => current.filter((item) => item.id !== journal.id));
    setNotice("餐桌日记已删除，这场饭仍保留在订单归档中");
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
      await loadDishes();
      setCart((current) => {
        if (data.dish!.active) return current;
        const next = { ...current };
        delete next[dish.id];
        return next;
      });
      setNotice(data.dish.active ? `“${dish.name}”已恢复，可以继续编辑和上架` : `“${dish.name}”已归档`);
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

  const deleteDish = async (dish: ManagedDish) => {
    if (!window.confirm(`确定永久删除“${dish.name}”吗？一般建议先归档，历史订单仍会保留菜名。`)) return;
    try {
      const response = await fetch(`/api/dishes?id=${encodeURIComponent(dish.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "删除失败");
      setCustomDishes((current) => current.filter((item) => item.id !== dish.id));
      setSelectedRecipeIds((current) => current.filter((id) => id !== dish.id));
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
              {activeOrders.map((order) => <option value={order.id} key={order.id}>{order.customerName} · {order.mealDate} · {parseItems(order).length} 道菜</option>)}
            </select>
            <button type="button" className="quiet banquet-free-menu-button" onClick={startFreeBanquet}>＋ 新建自由菜单</button>
            {selectedBanquetOrder && <p className={parsePublishedMenu(selectedBanquetOrder) ? "banquet-publish-state published" : "banquet-publish-state"}><span>{parsePublishedMenu(selectedBanquetOrder) ? "✓" : "○"}</span>{parsePublishedMenu(selectedBanquetOrder) ? <>{`已推送过正式菜单 · ${selectedBanquetOrder.publishedMenuUpdatedAt ? new Date(selectedBanquetOrder.publishedMenuUpdatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "可再次更新"}`}<small className={selectedBanquetOrder.menuReadAt === selectedBanquetOrder.publishedMenuUpdatedAt ? "menu-read-state read" : "menu-read-state"}>{selectedBanquetOrder.menuReadAt === selectedBanquetOrder.publishedMenuUpdatedAt ? "✓ 朋友已读" : "○ 等待朋友查看"}</small></> : "这份订单还没有收到正式宴席菜单"}</p>}
            {activeOrders.length === 0 && <p className="banquet-hint">目前没有进行中的订单，也可以先从下方菜谱库加入菜品，做一张备用菜单。</p>}
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
              <label><span>菜单署名</span><input value={banquetTemplateName} onChange={(event) => setBanquetTemplateName(event.target.value)} maxLength={24} /></label>
              <label><span>用餐日期</span><input type="date" value={banquetDate} onChange={(event) => setBanquetDate(event.target.value)} /></label>
              <label><span>菜单副标题</span><input value={banquetSubtitle} onChange={(event) => setBanquetSubtitle(event.target.value)} maxLength={60} /></label>
              <label><span>场合文字</span><input value={banquetOccasion} onChange={(event) => setBanquetOccasion(event.target.value)} maxLength={32} /></label>
              <label><span>用餐人数</span><input type="number" min="1" max="20" value={banquetGuestCount || ""} placeholder="自由菜单可选" onChange={(event) => setBanquetGuestCount(Math.min(20, Math.max(0, Number(event.target.value) || 0)))} /></label>
              <label className="wide"><span>写给客人的话</span><input value={banquetMessage} onChange={(event) => setBanquetMessage(event.target.value)} maxLength={70} /></label>
              <label className="wide"><span>菜单落款</span><input value={banquetChefCredit} onChange={(event) => setBanquetChefCredit(event.target.value)} maxLength={50} /></label>
            </div>
          </div>

          <div className="banquet-step">
            <div className="banquet-step-title"><b>4</b><div><strong>调整菜品和栏目</strong><small>按前菜 → 热菜 → 主食 → 汤饮甜品自动排列，栏目内仍可手动调整</small></div></div>
            <div className="banquet-add-row"><select value={banquetDishId} onChange={(event) => setBanquetDishId(event.target.value)} aria-label="从菜谱库选择菜品"><option value="">从我的菜谱库添加…</option>{dishCatalog.filter((dish) => !banquetItems.some((item) => item.dishId === dish.id)).map((dish) => <option value={dish.id} key={dish.id}>{dish.name} · {dish.category}</option>)}</select><button type="button" onClick={addBanquetDish}>＋ 加入</button></div>
            {banquetDishes.length === 0 ? <div className="banquet-empty"><span>宴</span><p>选择一个订单，或从菜谱库加入第一道菜。</p></div> : <div className="banquet-arrangement">
              <p className="banquet-auto-order-note"><span>✓</span>换栏目后会自动归位；上下箭头只调整同一栏目的出菜先后。</p>
              {banquetCourses.map((banquetCourse) => {
                const courseDishes = banquetDishes.filter((item) => item.course === banquetCourse.id);
                if (!courseDishes.length) return null;
                return <section className="banquet-course-group" key={banquetCourse.id}>
                  <header><div><input className="banquet-course-label-input" value={courseText(banquetCourse).label} onChange={(event) => setBanquetCourseEdits((current) => ({ ...current, [banquetCourse.id]: { ...courseText(banquetCourse), label: event.target.value } }))} aria-label={`${banquetCourse.label}中文栏目名`} /><input className="banquet-course-english-input" value={courseText(banquetCourse).english} onChange={(event) => setBanquetCourseEdits((current) => ({ ...current, [banquetCourse.id]: { ...courseText(banquetCourse), english: event.target.value } }))} aria-label={`${banquetCourse.label}英文栏目名`} /></div><span>{courseDishes.length} 道</span></header>
                  <div>{courseDishes.map(({ dish, course }, courseIndex) => {
                    const menuIndex = banquetDishes.findIndex((item) => item.dish.id === dish.id);
                    const text = dishText(dish);
                    return <article key={dish.id}><span className="arrange-number">{String(menuIndex + 1).padStart(2, "0")}</span><div className="banquet-dish-edit-fields"><input value={text.name} onChange={(event) => setBanquetDishEdits((current) => ({ ...current, [dish.id]: { ...dishText(dish), name: event.target.value } }))} aria-label={`${dish.name}菜单名称`} /><input value={text.description} onChange={(event) => setBanquetDishEdits((current) => ({ ...current, [dish.id]: { ...dishText(dish), description: event.target.value } }))} aria-label={`${dish.name}菜单介绍`} /></div><select value={course} onChange={(event) => updateBanquetCourse(dish.id, event.target.value as BanquetCourse)} aria-label={`${dish.name}所属栏目`}>{banquetCourses.map((item) => <option value={item.id} key={item.id}>{courseText(item).label}</option>)}</select><div className="arrange-actions"><button type="button" onClick={() => moveBanquetDish(dish.id, -1)} disabled={courseIndex === 0} aria-label={`在${banquetCourse.label}中上移${dish.name}`}>↑</button><button type="button" onClick={() => moveBanquetDish(dish.id, 1)} disabled={courseIndex === courseDishes.length - 1} aria-label={`在${banquetCourse.label}中下移${dish.name}`}>↓</button><button type="button" className="remove" onClick={() => setBanquetItems((current) => current.filter((item) => item.dishId !== dish.id))} aria-label={`移除${dish.name}`}>×</button></div></article>;
                  })}</div>
                </section>;
              })}
            </div>}
          </div>
        </div>
      </div>

      <aside className="banquet-preview-wrap">
        <div ref={banquetPreviewRef} className={`banquet-preview template-${banquetTemplate}`}>
          <div className="menu-card-ornament" aria-hidden="true"><span>{activeBanquetTemplate.mark}</span></div>
          <div className="menu-card-header">
            <small>阿德小厨房 · PRIVATE KITCHEN</small>
            <h2>{banquetTitle || activeBanquetTemplate.defaultTitle}</h2>
            <p><strong>{banquetTemplateName || activeBanquetTemplate.name}</strong><span>{banquetSubtitle || activeBanquetTemplate.subtitle}</span></p>
            <div><span>{banquetDate || "择日相聚"}</span><span>{banquetOccasion || activeBanquetTemplate.occasion}</span>{banquetGuestCount > 0 && <span>{banquetGuestCount} 位宾客</span>}</div>
          </div>
          <div className="menu-card-courses">
            {banquetCourses.map((course) => {
              const courseDishes = banquetDishes.filter((item) => item.course === course.id);
              if (!courseDishes.length) return null;
              const text = courseText(course);
              return <section key={course.id}><h3><span>{text.label}</span><small>{text.english}</small></h3><div>{courseDishes.map(({ dish }) => { const dishCopy = dishText(dish); return <article key={dish.id}><strong>{dishCopy.name}</strong><span>{dishCopy.description}</span></article>; })}</div></section>;
            })}
            {banquetDishes.length === 0 && <div className="menu-card-placeholder"><span>MENU</span><p>加入菜品后，这里会生成与“{activeBanquetTemplate.name}”相匹配的完整菜单。</p></div>}
          </div>
          <div className="menu-card-footer"><span>—</span><p>{banquetMessage || activeBanquetTemplate.defaultMessage}</p><small>{banquetChefCredit}</small></div>
        </div>
        <button type="button" className="publish-menu-button" disabled={menuPublishing || !selectedBanquetOrder || !banquetDishes.length} onClick={() => void publishBanquetMenu()}><span aria-hidden="true">↗</span><strong>{menuPublishing ? "正在推送菜单…" : parsePublishedMenu(selectedBanquetOrder) ? "更新朋友端正式菜单" : "推送到点菜人的进度页"}</strong><small>{selectedBanquetOrder ? `发给 ${selectedBanquetOrder.customerName} · 之后修改可再次推送` : "自由菜单可直接导出 PNG、JPG 或 PDF"}</small></button>
        <div className="preview-actions"><button type="button" className="quiet" onClick={() => { setBanquetItems([]); setBanquetOrderId(""); setBanquetGuestCount(0); setBanquetDishEdits({}); setBanquetCourseEdits({}); }}>清空重排</button><div className="export-options" aria-label="导出菜单格式"><button type="button" className="export" disabled={menuExporting !== null} onClick={() => exportBanquetMenu("png")}>{menuExporting === "png" ? "生成中…" : "PNG 图片"}</button><button type="button" className="export" disabled={menuExporting !== null} onClick={() => exportBanquetMenu("jpeg")}>{menuExporting === "jpeg" ? "生成中…" : "JPG 图片"}</button><button type="button" className="export" disabled={menuExporting !== null} onClick={() => exportBanquetMenu("pdf")}>{menuExporting === "pdf" ? "生成中…" : "PDF 文件"}</button></div></div>
        <p className="preview-tip">推送后，朋友的实时进度页会自动出现这张菜单；PNG、JPG 适合发微信，PDF 适合留存。</p>
      </aside>
    </section>
  );

  if (mode === "menu" && guestOrderChecking) {
    return <main className="status-page guest-order-resume"><section className="status-card"><span>阿德小厨房</span><h1>正在找回这顿饭</h1><p>上次点过的菜还在，我带你回到厨房进度页。</p></section></main>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const statusUpdateOrder = statusUpdateDraft ? orders.find((order) => order.id === statusUpdateDraft.orderId) : null;

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
              <div className="hero-greeting"><span className={!kitchenOpen ? "closed" : ""}><i></i> {!kitchenOpen ? "厨房今天休息" : activeInvite ? "你的专属饭局" : "厨房今日营业"}</span><small>{!kitchenOpen ? "今天先看看菜单，等主厨重新亮起绿灯" : activeInvite ? activeInvite.mealDate : "嗨，今天也要被好好招待 👋"}</small></div>
              <h1>{activeInvite ? activeInvite.title : <>想吃什么，<br /><em>我给你做。</em></>}</h1>
              <p>{activeInvite?.message || "没有复杂规则，也不用跟我客气。挑几道你惦记的家常菜，剩下的交给主厨。"}</p>
              <div className="hero-actions"><a href="#weekly-menu">{menuReadOnly ? "看看菜单" : "开始点菜"} <span>↓</span></a><p><strong>{menuReadOnly ? "只看不点" : "提前 1 天"}</strong><small>{menuReadOnly ? "等绿灯亮起再来约饭" : "让我从容去买菜"}</small></p></div>
            </div>
            <div className="hero-visual">
              <div className="chef-portrait-frame">
                <Image className="chef-portrait" src="/chef-magazine-v2.jpg" width={1600} height={1600} priority alt="阿德主厨在厨房为朋友准备菜品" />
                <div className="magazine-masthead" style={{ borderBottom: 0, paddingBottom: 0 }}><small>ADE&apos;S PRIVATE KITCHEN</small><strong>阿德私厨志</strong></div>
                <div className="hero-sticker">
                  <span>{activeInvite ? "JUST FOR YOU" : "TODAY'S NOTE"}</span>
                  <small>{activeInvite ? "只为你" : "今日份"}</small>
                  <strong>{activeInvite ? "留了位置" : "好好吃饭"}</strong>
                </div>
                <div className="magazine-cover-slogan"><small>放心点</small><strong>不用替主厨<br />省事</strong><span>NO NEED TO HOLD BACK</span></div>
                <div className="chef-portrait-caption"><span>TONIGHT&apos;S CHEF</span><strong>阿德 · 为你掌勺</strong></div>
              </div>
            </div>
          </section>

          {orderProgressUrl && <section className="order-success-card"><span>谢谢你来吃饭</span><h2>这份想吃的，阿德已经接住了</h2><p>从确认、买菜到开火，这张进度卡都会及时告诉你。带着好胃口来，剩下的交给厨房。</p><a href={orderProgressUrl}>查看我的厨房进度 <b>→</b></a></section>}

          <section className="menu-section" id="weekly-menu">
            {menuReadOnly && <div className="menu-readonly-notice" role="status"><span>歇</span><div><strong>今天先看菜单，不接新点单</strong><p>喜欢的菜可以先记在心里，等厨房重新亮起绿灯，再把这一顿约起来。</p></div></div>}
            <div className="section-heading">
              <div><span className="eyebrow">{activeInvite ? "YOUR PRIVATE DINNER MENU" : "THIS WEEK'S LITTLE MENU"}</span><h2 className={menuReadOnly ? "menu-title-lines" : undefined}>{menuReadOnly ? <><span>菜单照常翻，</span><span>厨房今天歇</span></> : activeInvite ? "这桌菜，等你翻牌" : "挑几道喜欢的"}</h2><p>{menuReadOnly ? "可以慢慢看，但今天暂时不能加菜和提交。" : activeInvite ? "阿德特意为这场饭局留出的菜单。" : "点菜不用客气，洗碗也不用你。"}</p></div>
              <div className="menu-count-pill"><strong>{allDishes.length}</strong><span>道拿手菜<br />等你翻牌</span></div>
            </div>
            {inviteLoading && <div className="invite-loading">正在把你的专属菜单端上来…</div>}
            {activeInvite?.mode === "shared" && sharedDinner && <section className="shared-dinner-bar" aria-label="多人共享饭局"><div><span>SHARED DINNER · {sharedDinner.guests.length} 位朋友已加入</span><strong>大家选的菜会自动汇总到同一张单</strong></div><div className="shared-name-field"><label><small>你的称呼</small><input value={sharedGuestName} maxLength={30} onChange={(event) => { sharedGuestNameDirtyRef.current = true; setSharedGuestName(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveSharedGuestName(); } }} disabled={sharedGuestSaving} /></label><button type="button" onClick={() => void saveSharedGuestName()} disabled={sharedGuestSaving || !sharedDinner.guestToken}>{sharedGuestSaving ? "保存中…" : "确认称呼"}</button></div><p>{sharedDinner.guests.map((guest) => guest.displayName).join("、") || "等朋友加入"}</p><div className="shared-dinner-selections">{sharedDinner.selections.filter((guest) => guest.items.length).map((guest) => <span key={guest.guestId}><b>{guest.displayName}</b>：{guest.items.length} 道菜</span>)}{!sharedDinner.selections.some((guest) => guest.items.length) && <span>还没有人选菜，先挑一道你想吃的吧。</span>}</div>{sharedDinner.orderToken && <a className="shared-dinner-progress" href={`/order/${sharedDinner.orderToken}`}>这桌已送进厨房 · 查看实时进度与主厨菜单 →</a>}</section>}
            {activeInvite && activeInvite.recommendedDishIds.length > 0 && <div className="recommended-combo"><span>主厨搭配</span><strong>如果不想纠结，就从这几道开始</strong><div>{activeInvite.recommendedDishIds.map((id) => dishCatalog.find((dish) => dish.id === id)).filter(Boolean).map((dish) => <button key={dish!.id} disabled={menuReadOnly} onClick={() => updateQuantity(dish!.id, 1)}>{dish!.name}<i>＋</i></button>)}</div></div>}
            <div className="category-tabs-shell">
              <div className="category-tabs-heading"><div><span>MENU CATEGORIES</span><strong>想吃哪一类？</strong></div><small>{activeCategory === "全部" ? `全部 ${allDishes.length} 道` : `${activeCategory} · ${filteredDishes.length} 道`}</small></div>
              <div className="category-tabs" role="tablist" aria-label="菜品大类">
                {["全部", ...menuCategories].map((category) => {
                  const count = category === "全部" ? allDishes.length : allDishes.filter((dish) => dish.category === category).length;
                  return <button type="button" role="tab" aria-selected={activeCategory === category} key={category} className={activeCategory === category ? "active" : ""} onClick={() => selectMenuCategory(category)}><span>{category === "全部" ? "◎" : managedCategoryEmoji[category] || categoryEmoji[category] || "•"}</span><b>{category}</b><small>{count}</small></button>;
                })}
              </div>
            </div>
            {recommendedDishes.length > 0 && <section className="desktop-ade-picks" aria-labelledby="desktop-ade-picks-title">
              <header><div><span>ADE&apos;S PICKS · TODAY</span><h3 id="desktop-ade-picks-title">阿德推荐</h3><p>要是拿不定主意，就从这几道开始。都是阿德今天很想端上桌的味道。</p></div><small>{recommendedDishes.length} 道心选</small></header>
              <div className="desktop-ade-picks-grid">
                {recommendedDishes.map((dish) => {
                  const quantity = cart[dish.id] || 0;
                  return <article className={`${quantity ? "desktop-ade-pick-card selected" : "desktop-ade-pick-card"}${dish.soldOut ? " sold-out" : ""}`} key={`desktop-ade-pick-${dish.id}`}>
                    <div className={`desktop-ade-pick-photo tone-${dish.tone}`}>{dish.imageUrl ? <button type="button" className="dish-image-trigger" onClick={(event) => openDishLightbox(dish, event.currentTarget)} aria-label={`查看${dish.name}大图`}><img src={dishThumbnailUrl(dish.imageUrl)} loading="lazy" decoding="async" style={dishImageStyle(dish.imagePosition)} alt={dish.name} /><span className="dish-image-zoom" aria-hidden="true">⌕</span></button> : <span>{dish.emoji}</span>}<b>阿德推荐</b></div>
                    <div className="desktop-ade-pick-copy"><small>{dish.category}</small><h4>{dish.name}</h4><p>{dish.slogan || dish.description}</p>{renderSharedDishSelections(dish.id)}</div>
                    <div className="desktop-ade-pick-action">{quantity > 0 ? <div aria-label={`${dish.name}已选 ${quantity} 份`}><button type="button" onClick={() => updateQuantity(dish.id, -1)} aria-label={`减少${dish.name}`}>−</button><strong>{quantity}</strong><button type="button" onClick={() => updateQuantity(dish.id, 1)} aria-label={`增加${dish.name}`}>＋</button></div> : <button type="button" disabled={dish.soldOut || menuReadOnly} onClick={() => updateQuantity(dish.id, 1)}>{dish.soldOut ? "今天已售罄" : menuReadOnly ? "今天只看看" : "就想吃这道"}<b>＋</b></button>}</div>
                  </article>;
                })}
              </div>
            </section>}
            {recommendedDishes.length > 0 && <section className="mobile-ade-picks" aria-labelledby="mobile-ade-picks-title">
              <header><div><span>ADE&apos;S PICKS</span><h3 id="mobile-ade-picks-title">阿德推荐</h3><p>这几道，是我今天特别想做给你吃的。</p></div><small>横滑看看 →</small></header>
              <div className="mobile-ade-picks-track">
                {recommendedDishes.map((dish) => {
                  const quantity = cart[dish.id] || 0;
                  return <article className={`${quantity ? "mobile-ade-pick-card selected" : "mobile-ade-pick-card"}${dish.soldOut ? " sold-out" : ""}`} key={`ade-pick-${dish.id}`}>
                    <div className={`mobile-ade-pick-photo tone-${dish.tone}`}>{dish.imageUrl ? <button type="button" className="dish-image-trigger" onClick={(event) => openDishLightbox(dish, event.currentTarget)} aria-label={`查看${dish.name}大图`}><img src={dishThumbnailUrl(dish.imageUrl)} loading="lazy" decoding="async" style={dishImageStyle(dish.imagePosition)} alt={dish.name} /><span className="dish-image-zoom" aria-hidden="true">⌕</span></button> : <span>{dish.emoji}</span>}<b>阿德推荐</b></div>
                    <div className="mobile-ade-pick-body"><small>{dish.category}</small><h4>{dish.name}</h4><p>{dish.slogan || dish.description}</p><div className="mobile-dish-control">{quantity > 0 ? <div aria-label={`${dish.name}已选 ${quantity} 份`}><button type="button" onClick={() => updateQuantity(dish.id, -1)} aria-label={`减少${dish.name}`}>−</button><strong>{quantity}</strong><button type="button" onClick={() => updateQuantity(dish.id, 1)} aria-label={`增加${dish.name}`}>＋</button></div> : <button type="button" disabled={dish.soldOut || menuReadOnly} onClick={() => updateQuantity(dish.id, 1)} aria-label={`添加${dish.name}`}>{dish.soldOut ? "下次" : menuReadOnly ? "看看" : "想吃"}<b>＋</b></button>}</div></div>
                  </article>;
                })}
              </div>
            </section>}
            <div className="mobile-menu-browser">
              <nav className="mobile-category-rail" aria-label="手机端菜品大类">
                {mobileMenuGroups.map((group) => <button type="button" key={group.name} className={activeMobileCategory === group.name ? "active" : ""} aria-current={activeMobileCategory === group.name ? "true" : undefined} onClick={() => selectMobileMenuCategory(group.name)}><span>{managedCategoryEmoji[group.name] || categoryEmoji[group.name] || "•"}</span><b>{group.name}</b><small>{group.dishes.length}</small></button>)}
              </nav>
              <div className="mobile-menu-groups">
                {mobileMenuGroups.map((group) => <section className="mobile-menu-group" key={group.name} ref={(node) => { mobileMenuSectionRefs.current[group.name] = node; }} data-menu-category={group.name}>
                  <header><div><span>MENU CATEGORY</span><h3>{group.name}</h3></div><small>{group.dishes.length} 道</small></header>
                  <div>{group.dishes.map((dish) => {
                    const quantity = cart[dish.id] || 0;
                    return <article className={`${quantity ? "mobile-dish-row selected" : "mobile-dish-row"}${dish.soldOut ? " sold-out" : ""}`} key={`${group.name}-${dish.id}`}>
                      <div className={`mobile-dish-photo tone-${dish.tone}`}>{dish.imageUrl ? <button type="button" className="dish-image-trigger" onClick={(event) => openDishLightbox(dish, event.currentTarget)} aria-label={`查看${dish.name}大图`}><img src={dishThumbnailUrl(dish.imageUrl)} loading="lazy" decoding="async" style={dishImageStyle(dish.imagePosition)} alt={dish.name} /><span className="dish-image-zoom" aria-hidden="true">⌕</span></button> : <span>{dish.emoji}</span>}{(dish.featured || dish.soldOut) && <b>{dish.soldOut ? "售罄" : "推荐"}</b>}</div>
                      <div className="mobile-dish-copy"><h4>{dish.name}</h4><p>{dish.slogan || dish.description}</p><small>{dish.category}</small>{renderSharedDishSelections(dish.id)}</div>
                      <div className="mobile-dish-control">{quantity > 0 ? <div aria-label={`${dish.name}已选 ${quantity} 份`}><button type="button" onClick={() => updateQuantity(dish.id, -1)} aria-label={`减少${dish.name}`}>−</button><strong>{quantity}</strong><button type="button" onClick={() => updateQuantity(dish.id, 1)} aria-label={`增加${dish.name}`}>＋</button></div> : <button type="button" disabled={dish.soldOut || menuReadOnly} onClick={() => updateQuantity(dish.id, 1)} aria-label={`添加${dish.name}`}>{dish.soldOut ? "下次" : menuReadOnly ? "看看" : "想吃"}<b>＋</b></button>}</div>
                    </article>;
                  })}</div>
                </section>)}
              </div>
            </div>
            <div className="dish-grid" ref={dishGridRef}>
              {filteredDishes.map((dish, index) => {
                const quantity = cart[dish.id] || 0;
                return (
                  <article className={`${quantity ? "dish-card selected" : "dish-card"}${dish.soldOut ? " sold-out" : ""}`} key={dish.id}>
                    <div className={`dish-art tone-${dish.tone}`}>
                      {dish.imageUrl ? <button type="button" className="dish-image-trigger" onClick={(event) => openDishLightbox(dish, event.currentTarget)} aria-label={`查看${dish.name}大图`}><img className="dish-photo" loading="lazy" decoding="async" style={dishImageStyle(dish.imagePosition)} src={dishThumbnailUrl(dish.imageUrl)} alt={dish.name} /><span className="dish-image-zoom" aria-hidden="true">⌕</span></button> : <span>{dish.emoji}</span>}
                      <small>{dish.category}</small>
                      {(dish.soldOut || dish.featured || dish.tag) && <b className="dish-art-tag">{dish.soldOut ? "今天售罄" : dish.featured ? "阿德推荐" : dish.tag}</b>}
                    </div>
                    <div className="dish-body">
                      <div className="dish-title"><h3>{dish.name}</h3></div>
                      <div className="dish-quip">{dish.slogan || ["这道很适合一起分享", "今天吃点认真做的", "一口下去，很有家的感觉"][index % 3]}</div>
                      <p>{dish.description}</p>{renderSharedDishSelections(dish.id)}
                      {dish.dietary && dish.dietary.length > 0 && <div className="dish-safety-tags">{dish.dietary.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>}
                      <div className={quantity ? "quantity-control has-quantity" : "quantity-control"}>
                        {quantity > 0 ? <div className="quantity-stepper" aria-label={`${dish.name}已选 ${quantity} 份`}>
                          <button type="button" onClick={() => updateQuantity(dish.id, -1)} aria-label={`减少${dish.name}`}><span className="control-mark minus" aria-hidden="true" /></button>
                          <strong><small>已选</small>{quantity} 份</strong>
                          <button type="button" onClick={() => updateQuantity(dish.id, 1)} aria-label={`增加${dish.name}`}><span className="control-mark plus" aria-hidden="true" /></button>
                        </div> : <button type="button" disabled={dish.soldOut || menuReadOnly} className="add" onClick={() => updateQuantity(dish.id, 1)} aria-label={`添加${dish.name}`}>{dish.soldOut ? <span>下次再约</span> : menuReadOnly ? <span>今天只看看</span> : <><span>想吃这道</span><b className="plus-mark" aria-hidden="true" /></>}</button>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {!inviteLoading && initialInviteToken && !activeInvite && <div className="invite-loading"><strong>这份邀请暂时不能点菜</strong><p>可能饭局已经结束，可以问问阿德下一顿什么时候开席。</p></div>}
          </section>

          <section className="chef-story" id="meet-chef" aria-label="认识今晚的主厨">
            <div className="chef-story-copy"><span>MEET YOUR CHEF</span><h2>菜慢慢挑，<br />心意已经开火。</h2><p>这不是餐厅的制式菜单，而是一顿专门留给朋友的饭。你负责挑喜欢的，我负责把每一道认真做好。</p><Image className="chef-signature" src="/ade-signature.png" width={960} height={320} alt="阿德，Adecho.Kwok 手写签名" /></div>
            <div className="chef-story-visual">
              <Image className="chef-story-photo" src="/chef-interview-light.png" width={2048} height={1148} alt="阿德主厨在明亮厨房里的个人肖像" />
              <div className="chef-story-caption"><small>ADE&apos;S PRIVATE KITCHEN</small><strong>今晚，阿德掌勺。</strong></div>
            </div>
          </section>

          <section className="promise-strip">
            <div className="promise-heading"><span>主厨保证书</span><h2>放心点，<br />我认真做。</h2><p>一顿好饭不一定隆重，<br />但一定要有诚意。</p></div>
            <div className="promise-card"><span>01</span><div>🧺</div><strong>收到点单再买菜</strong><p>新鲜这件事，不打折。</p></div>
            <div className="promise-card playful"><span>02</span><div>🍳</div><strong>每一道都现做</strong><p>锅气，是厨房的签名。</p></div>
            <div className="promise-card"><span>03</span><div>🥂</div><strong>最重要的是开心</strong><p>吃饱以后，再慢慢聊天。</p></div>
          </section>

          {kitchenOpen && cartCount > 0 && (
            <button className="floating-cart" onClick={() => setCartOpen(true)}>
              <span className="cart-icon">{cartCount}</span><span><small>{activeInvite?.mode === "shared" ? "这桌正在一起选" : "这顿有着落了"}</small><strong>{activeInvite?.mode === "shared" ? `${sharedAggregateItems.length} 道菜 · 共 ${sharedAggregateItems.reduce((sum, item) => sum + item.quantity, 0)} 份` : `${cartItems.length} 道菜 · 共 ${cartCount} 份`}</strong></span><b>去确认菜单 <i>→</i></b>
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
            <button className={chefView === "serving" ? "active" : ""} onClick={() => setChefView("serving")}><i>04</i><span><b>开饭</b><small>{servingReadyOrders.length} 场待通知 · {pendingArchiveOrders.length} 场待归档</small></span></button>
          </div>
          <div className="chef-secondary-nav" role="tablist" aria-label="主厨其他工具">
            <span>其他工具</span>
            <button className={chefView === "menuManager" ? "active" : ""} onClick={() => setChefView("menuManager")}>菜单与菜谱 <b>{dishCatalog.filter((dish) => dish.active !== false).length}</b></button>
            <button className={chefView === "invitations" ? "active" : ""} onClick={() => setChefView("invitations")}>专属邀请 <b>{invites.filter((invite) => invite.active).length}</b></button>
            <button className={chefView === "journals" ? "active" : ""} onClick={() => setChefView("journals")}>餐桌日记 <b>{journals.length}</b></button>
            <button className={chefView === "dataTransfer" ? "active" : ""} onClick={() => setChefView("dataTransfer")}>数据迁移</button>
          </div>

          {chefView === "accepting" ? (
            <section className="accepting-workspace" aria-labelledby="accepting-title">
              <section className="workflow-hero panel">
                <div><span>STEP 01 · ORDER INTAKE</span><h2 id="accepting-title">先看清这场饭，再确认接单</h2><p>客人、日期、人数、菜品和忌口集中确认；确认后可直接把这份点单编排成正式宴席菜单。</p></div>
                <div className="workflow-hero-stats"><span><small>待确认</small><strong>{acceptingOrders.length}</strong></span><span><small>下一场</small><strong>{nextMealDate}</strong></span><span><small>预计招待</small><strong>{cookingGuestCount} 人</strong></span><span><small>已点菜品</small><strong>{cookingRecipeCount} 道</strong></span></div>
              </section>
              <section className="dinner-overview panel" aria-labelledby="dinner-overview-title">
                <div className="panel-title">
                  <div><span>SHARED DINNERS</span><h2 id="dinner-overview-title">我的饭局</h2></div>
                  <small>{invites.filter((invite) => invite.active).length} 场进行中</small>
                </div>
                {invites.filter((invite) => invite.active).length === 0 ? (
                  <div className="dinner-overview-empty"><span>🍽️</span><p>还没有进行中的饭局，请进入“专属邀请”创建一场饭局并生成分享链接。</p></div>
                ) : (
                  <div className="dinner-overview-list">
                    {invites.filter((invite) => invite.active).slice(0, 6).map((invite) => (
                      <article className="dinner-overview-card" key={invite.id}>
                        <div className="dinner-overview-date"><span>{invite.mealDate}</span><b aria-hidden="true">{invite.mode === "shared" ? "多人" : "专属"}</b></div>
                        <div className="dinner-overview-copy"><div className="dinner-overview-title"><strong>{invite.title}</strong><em><i aria-hidden="true" />进行中</em></div><small>{invite.mode === "shared" ? "多人共享一张单 · 朋友的选择会同步汇总" : "专属点菜单 · 等待朋友确认"}</small><span>{invite.dishIds.length} 道开放菜品</span></div>
                        <div className="dinner-overview-actions"><button type="button" onClick={() => { setCreatedInvite(invite); setCreatedInviteUrl(window.location.origin + "/invite/" + invite.token); setChefView("invitations"); }}>管理饭局</button><a href={"/invite/" + invite.token} target="_blank" rel="noreferrer">打开点菜页</a><button type="button" className="quiet" onClick={() => void shareInvite(invite)}>分享</button></div>
                      </article>
                    ))}
                  </div>
                )}
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
                  <div className="cooking-progress"><div>{cookingStages.map((stage, index) => <span className={statusProgressIndex[order.status] >= index ? "done" : ""} key={stage.id}><i>{statusProgressIndex[order.status] > index ? "✓" : index + 1}</i>{stage.label}</span>)}</div><div className="cooking-order-actions">{order.status === "new" && <button onClick={() => updateOrderStatus(order.id, "confirmed")}>确认接单</button>}{order.status === "confirmed" && <button onClick={() => updateOrderStatus(order.id, "shopping")}>开始买菜</button>}{order.status === "shopping" && <button onClick={() => updateOrderStatus(order.id, "preparing")}>开始制作</button>}{order.status === "preparing" && <button className="ready-alert" onClick={() => updateOrderStatus(order.id, "done")}>🔔 通知开饭</button>}<small>点击后先确认要发给朋友的提醒内容</small></div></div>
                  <div className="cooking-dishes">{parseItems(order).map((item, dishIndex) => {
                    const snapshot = snapshots.find((candidate) => candidate.dishId === item.dishId);
                    const dish = dishCatalog.find((candidate) => candidate.id === item.dishId);
                    const ingredients = snapshot?.ingredients?.length ? snapshot.ingredients : dish?.ingredients || [];
                    const steps = snapshot?.steps?.length ? snapshot.steps : dish?.steps || [];
                    // 每道菜严格按菜谱记录的原始分量制作，不按订单人数放大或缩小。
                    const checkPrefix = `${order.id}:${item.dishId}`;
                    const completedSteps = steps.filter((_, index) => cookingChecks[`${checkPrefix}:${index}`]).length;
                    const schedule = cookingSchedule.find((entry) => entry.key === checkPrefix);
                    const timerDeadline = dishTimers[checkPrefix];
                    const timerRemaining = timerDeadline ? timerDeadline - timerNow : 0;
                    return <section className="cooking-dish-card" key={`${order.id}-${item.dishId}`}>
                      <div className="cooking-dish-head"><span>{String(dishIndex + 1).padStart(2, "0")}</span><div><h4>{snapshot?.name || dish?.name || "历史菜品"}</h4><p>{item.quantity} 份 · 按菜谱原始分量 · 约 {snapshot?.minutes || dish?.minutes || 30} 分钟</p></div><strong>{completedSteps}/{steps.length || 0} 步</strong></div>
                      {(snapshot?.recipeSummary || dish?.recipeSummary) && <p className="cooking-recipe-summary">{snapshot?.recipeSummary || dish?.recipeSummary}</p>}
                      <div className={`dish-timer${timerDeadline ? timerRemaining <= 0 ? " finished" : " running" : ""}`}><div><small>{schedule ? `建议 ${schedule.startTime} 开火` : "单菜计时器"}</small><strong>{timerDeadline ? timerRemaining > 0 ? formatCountdown(timerRemaining) : "时间到" : `${snapshot?.minutes || dish?.minutes || 30}:00`}</strong></div>{timerDeadline ? <button onClick={() => stopDishTimer(checkPrefix)}>{timerRemaining > 0 ? "停止计时" : "关闭提醒"}</button> : <button onClick={() => startDishTimer(checkPrefix, snapshot?.minutes || dish?.minutes || 30)}>开始计时</button>}</div>
                      <div className="cooking-recipe-grid"><section><div className="cooking-section-title"><b>本单用料</b><small>菜谱原始分量</small></div>{ingredients.length ? <ul>{ingredients.map((ingredient) => <li key={`${item.dishId}-${ingredient.name}-${ingredient.unit}`}><span>{ingredient.name}</span><strong>{formatAmount(ingredient.amount, ingredient.unit)}</strong></li>)}</ul> : <p className="cooking-missing">暂时没有记录用料。</p>}</section><section><div className="cooking-section-title"><b>具体做法</b><small>做完可勾选</small></div>{steps.length ? <ol>{steps.map((step, index) => { const checkKey = `${checkPrefix}:${index}`; return <li className={cookingChecks[checkKey] ? "checked" : ""} key={checkKey}><label><input type="checkbox" checked={Boolean(cookingChecks[checkKey])} onChange={(event) => setCookingStepChecked(checkKey, event.target.checked)} /><i>{index + 1}</i><span>{step}</span></label></li>; })}</ol> : <p className="cooking-missing">这道菜还没有记录步骤，可在“菜单管理”中补充。</p>}</section></div>
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
                        const byDish = new Map<string, typeof items>();
                        items.forEach((item) => byDish.set(item.dishName, [...(byDish.get(item.dishName) || []), item]));
                        return <div className="shopping-group" key={location}><h3>{location}</h3>{Array.from(byDish.entries()).map(([dishName, dishItems]) => <section className="shopping-subgroup" key={dishName}><h4>{dishName}</h4>{dishItems.map((item) => <label key={item.itemKey}><input type="checkbox" checked={Boolean(shoppingChecks[item.itemKey])} onChange={(event) => void setShoppingChecked(item.itemKey, event.target.checked)} /><span>{item.name}{item.stockUsed > 0 && <small>已扣家中 {formatAmount(item.stockUsed, item.unit)}</small>}</span><strong>{formatAmount(item.amount, item.unit)}</strong></label>)}</section>)}</div>;
                      })}
                    </div>
                  )}
                  <div className="shopping-tip">每道菜按菜谱原始分量列出，并自动抵扣家中库存；仍显示在清单中的项目，就是需要补买的数量。</div>
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
                      <ImageDropField className={recipeScreenshots.length ? "recipe-upload has-files" : "recipe-upload"} multiple maximumFiles={4} maximumTotalBytes={14 * 1024 * 1024} onChange={selectRecipeScreenshots} onNotice={setNotice}>
                        <span>＋</span><strong>{recipeScreenshots.length ? "重新选择或拖入菜谱截图" : "点击选择，或把菜谱截图拖到这里"}</strong><small>最多 4 张；建议同时拍清菜名、材料和全部步骤</small>
                      </ImageDropField>
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

              <section className="bulk-recipe-import panel" aria-labelledby="bulk-recipe-import-title">
                <div className="bulk-import-heading">
                  <div><span>RECIPE LIBRARY IMPORT</span><h2 id="bulk-recipe-import-title">批量导入菜谱库</h2><p>把整理好的 JSON 菜谱一次合并进 NAS；先预览，再确认导入。</p></div>
                  <em>自动备份 · 失败回滚</em>
                </div>
                <div className="bulk-import-body">
                  <label className={bulkRecipeFile ? "bulk-import-picker selected" : "bulk-import-picker"}>
                    <input type="file" accept=".json,application/json" onChange={selectBulkRecipeFile} />
                    <span>{bulkRecipeLoading === "preview" ? "…" : "JSON"}</span>
                    <div><strong>{bulkRecipeLoading === "preview" ? "正在检查菜谱文件…" : bulkRecipeFile?.name || "选择菜谱 JSON 文件"}</strong><small>最多 2MB、500 道菜；文件需要包含 recipes 列表</small></div>
                    <b>{bulkRecipeFile ? "重新选择" : "选择文件"}</b>
                  </label>
                  {bulkRecipePreview && <div className="bulk-import-preview">
                    <div className="bulk-import-stats"><article><small>文件内菜谱</small><strong>{bulkRecipePreview.total}</strong><span>道</span></article><article className="insert"><small>将新增</small><strong>{bulkRecipePreview.toInsert}</strong><span>道</span></article><article className="update"><small>将更新</small><strong>{bulkRecipePreview.toUpdate}</strong><span>道</span></article></div>
                    <div className="bulk-import-details"><p><b>涉及分类</b>{bulkRecipePreview.categories.join("、")}</p><p><b>部分菜名</b>{bulkRecipePreview.sampleNames.join("、")}{bulkRecipePreview.total > bulkRecipePreview.sampleNames.length ? "……" : ""}</p></div>
                    <div className="bulk-import-confirm"><p><strong>合并规则</strong><span>同名菜更新配方和步骤，但保留原有照片、上架状态和推荐设置；新菜直接加入菜单。确认前会把数据库备份到 NAS 的 import-backups 文件夹。</span></p><button type="button" onClick={confirmBulkRecipeImport} disabled={bulkRecipeLoading !== null || Boolean(bulkRecipeResult)}>{bulkRecipeLoading === "import" ? "正在备份并导入…" : bulkRecipeResult ? "本文件已导入" : `确认合并导入 ${bulkRecipePreview.total} 道菜`}</button></div>
                  </div>}
                  {bulkRecipeResult && <div className="bulk-import-success" role="status"><span>✓</span><div><strong>批量导入完成</strong><p>新增 {bulkRecipeResult.inserted} 道、更新 {bulkRecipeResult.updated} 道；当前菜谱库共 {bulkRecipeResult.totalDishes} 道。</p><small>安全备份：{bulkRecipeResult.backupFile}</small></div></div>}
                </div>
              </section>

              <section className="category-manager panel">
                <div className="panel-title"><div><span>MENU TYPES</span><h2>菜品类型管理</h2></div><small>新增 · 改名 · 排序 · 删除</small></div>
                <div className="category-manager-body"><form onSubmit={addCategory}><input className="category-new-emoji" name="emoji" maxLength={16} placeholder="Emoji" aria-label="新分类 Emoji" /><input name="name" maxLength={30} required placeholder="新增类型，例如：烧烤" /><button>＋ 添加类型</button></form><p className="category-emoji-help">每个大类都可以填一个 Emoji；删除大类只会把其中菜品移到“未分类”，不会删除菜谱。</p><div className="category-manager-list">{managedCategories.map((category, index) => <div key={category.id}><label className="category-emoji-editor"><span>图标</span><input key={`${category.id}-${category.emoji}`} defaultValue={category.emoji || ""} maxLength={16} placeholder={categoryEmoji[category.name] || "•"} aria-label={`${category.name}的 Emoji 图标`} onBlur={(event) => updateCategoryEmoji(category, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label><span>{category.name}<small>{customDishes.filter((dish) => dish.category === category.name).length} 道</small></span><div><button type="button" onClick={() => moveCategory(category, -1)} disabled={index === 0} aria-label={`上移${category.name}`}>↑</button><button type="button" onClick={() => moveCategory(category, 1)} disabled={index === managedCategories.length - 1} aria-label={`下移${category.name}`}>↓</button><button type="button" onClick={() => renameCategory(category)}>改名</button><button type="button" className="danger" onClick={() => deleteCategory(category)} disabled={category.name === "未分类"}>{category.name === "未分类" ? "保留" : "删除"}</button></div></div>)}</div></div>
              </section>

              <div className="manager-grid">
              <section className="managed-menu panel" aria-labelledby="recipe-library-title">
                <div className="recipe-library-head">
                  <div><span>YOUR RECIPE LIBRARY</span><h2 id="recipe-library-title">我的完整菜谱库</h2><p>搜索或筛选后直接上下滑动，全部菜谱会以瀑布流连续展开。</p></div>
                  <button type="button" onClick={startNewDish}>＋ 新建菜品</button>
                </div>
                <div className="recipe-library-overview">
                  <article><small>全部菜谱</small><strong>{customDishes.length}</strong></article>
                  <article><small>正常供应</small><strong>{activeRecipeCount}</strong></article>
                  <article><small>主厨推荐</small><strong>{featuredRecipeCount}</strong></article>
                  <p>推荐、售罄、暂停和归档都能在每张卡片的“状态与归档”中调整。</p>
                </div>
                <div className="recipe-library-toolbar">
                  <label className="recipe-library-search"><span aria-hidden="true">⌕</span><input type="search" value={recipeLibraryQuery} onChange={(event) => { setRecipeLibraryQuery(event.target.value); setDishSortMode(false); }} placeholder="搜索菜名、口味、来源…" aria-label="搜索菜谱库" /></label>
                  <select value={recipeLibraryCategory} onChange={(event) => { setRecipeLibraryCategory(event.target.value); setDishSortMode(false); }} aria-label="按菜品分类筛选"><option>全部分类</option>{recipeLibraryCategories.map((category) => <option key={category}>{category}</option>)}</select>
                  <select value={recipeLibraryStatus} onChange={(event) => { setRecipeLibraryStatus(event.target.value); setDishSortMode(false); }} aria-label="按菜品状态筛选"><option>全部状态</option><option>正常供应</option><option>主厨推荐</option><option>本期暂停</option><option>已售罄</option><option>已归档</option></select>
                  <button type="button" className={dishSortMode ? "recipe-sort-toggle active" : "recipe-sort-toggle"} disabled={!canSortFilteredRecipes} onClick={() => setDishSortMode((value) => !value)}>{dishSortMode ? "完成排序" : "菜品排序"}</button>
                  <span>找到 <strong>{filteredRecipeLibrary.length}</strong> 道<small>{canSortFilteredRecipes ? "可按当前大类调整前后" : "选择一个大类后可排序"}</small></span>
                </div>
                {dishSortMode && <div className="recipe-sort-note"><span>↕</span><p><strong>正在整理“{recipeLibraryCategory}”</strong>朋友端会同步使用这里的顺序；归档菜品固定放在末尾。</p></div>}
                <div className="recipe-bulk-category-bar">
                  <label><input type="checkbox" checked={allFilteredRecipesSelected} onChange={toggleAllFilteredRecipes} disabled={filteredRecipeLibrary.length === 0} /><span>选择当前筛选的 {filteredRecipeLibrary.length} 道</span></label>
                  <strong>已选 {selectedRecipeIds.length} 道</strong>
                  <select value={bulkCategoryTarget} onChange={(event) => setBulkCategoryTarget(event.target.value)} aria-label="批量加入菜品大类"><option value="">选择目标大类…</option>{recipeLibraryCategories.map((category) => <option value={category} key={`bulk-${category}`}>{category}</option>)}</select>
                  <button type="button" onClick={moveSelectedRecipesToCategory} disabled={!selectedRecipeIds.length || !bulkCategoryTarget || bulkCategorySaving}>{bulkCategorySaving ? "正在整理…" : "批量加入大类"}</button>
                  {selectedRecipeIds.length > 0 && <button type="button" className="clear" onClick={() => setSelectedRecipeIds([])}>取消选择</button>}
                </div>
                {customDishes.length === 0 ? <div className="empty compact"><span>🥢</span><strong>还没有自定义菜式</strong><p>点击“新建菜品”，第一道菜就会出现在朋友的菜单上。</p></div> : filteredRecipeLibrary.length === 0 ? <div className="empty compact library-empty"><span>⌕</span><strong>没有符合条件的菜</strong><p>换一个关键词或筛选条件再找找。</p><button type="button" onClick={() => { setRecipeLibraryQuery(""); setRecipeLibraryCategory("全部分类"); setRecipeLibraryStatus("全部状态"); }}>清除筛选</button></div> : (
                  <>
                    <div className="managed-dish-scroll" aria-label="连续滚动菜谱瀑布流">
                      <div className="managed-dish-list managed-dish-waterfall">
                        {filteredRecipeLibrary.map((dish) => (
                        <article className={`${!dish.active ? "managed-dish inactive" : "managed-dish"}${dish.soldOut ? " sold-out" : ""}${selectedRecipeIdSet.has(dish.id) ? " selected" : ""}`} key={dish.id}>
                          <label className="managed-select"><input type="checkbox" checked={selectedRecipeIdSet.has(dish.id)} onChange={() => toggleRecipeSelection(dish.id)} aria-label={`选择${dish.name}`} /><span>选择</span></label>
                          <div className="managed-thumb">{dish.imageUrl ? <img src={dishThumbnailUrl(dish.imageUrl)} loading="lazy" decoding="async" style={dishImageStyle(dish.imagePosition)} alt="" /> : <span>🍽️</span>}</div>
                          <div className="managed-copy">
                            <div><strong>{dish.name}</strong><em>{!dish.active ? "已归档" : dish.soldOut ? "已售罄" : dish.available === false ? "本期暂停" : dish.featured ? "主厨推荐" : "已上架"}</em></div>
                            <p>{dish.category} · {dish.flavor}</p>
                            {dish.slogan && <small className="managed-slogan">“{dish.slogan}”</small>}
                            <small>{dish.ingredients.length} 种食材 · {dish.steps?.length || 0} 个步骤 · {dish.baseServings || 4} 人基础份</small>
                            <details className="managed-recipe-details"><summary>查看具体做法</summary><div>{dish.recipeSummary && <p>{dish.recipeSummary}</p>}<b>用料</b><ul>{dish.ingredients.map((item, index) => <li key={`${dish.id}-${item.name}-${item.unit}-${index}`}><span>{item.name}</span><strong>{item.amount} {item.unit}</strong></li>)}</ul><b>步骤</b>{dish.steps?.length ? <ol>{dish.steps.map((step, index) => <li key={`${dish.id}-step-${index}`}>{step}</li>)}</ol> : <p>这道菜暂时还没有记录步骤。</p>}{dish.source && <small>来源：{dish.source}</small>}</div></details>
                          </div>
                          {dishSortMode && (dish.active ? (() => { const orderIndex = sortableActiveRecipes.findIndex((item) => item.id === dish.id); return <div className="managed-sort-actions"><button type="button" disabled={orderIndex <= 0} onClick={() => moveDish(dish, "top")}>置顶</button><button type="button" disabled={orderIndex <= 0} onClick={() => moveDish(dish, "up")}>上移</button><span>{orderIndex + 1}</span><button type="button" disabled={orderIndex < 0 || orderIndex >= sortableActiveRecipes.length - 1} onClick={() => moveDish(dish, "down")}>下移</button><button type="button" disabled={orderIndex < 0 || orderIndex >= sortableActiveRecipes.length - 1} onClick={() => moveDish(dish, "bottom")}>置底</button></div>; })() : <div className="managed-sort-archived">已归档 · 自动排在末尾</div>)}
                          <div className={`managed-card-actions${dish.active ? "" : " archived"}`}><button type="button" className="edit" onClick={() => startEditingDish(dish)}>编辑菜谱</button>{dish.active ? <details className="managed-actions-menu"><summary>状态与归档</summary><div className="managed-actions"><button type="button" className={dish.featured ? "active" : ""} onClick={() => setDishFlag(dish, "featured", !dish.featured)}>{dish.featured ? "取消推荐" : "设为推荐"}</button><button type="button" onClick={() => setDishFlag(dish, "soldOut", !dish.soldOut)}>{dish.soldOut ? "恢复供应" : "设为售罄"}</button><button type="button" onClick={() => setDishFlag(dish, "available", dish.available === false)}>{dish.available === false ? "加入本期" : "暂停本期"}</button><button type="button" onClick={() => toggleDish(dish)}>归档菜品</button><button type="button" className="danger" onClick={() => deleteDish(dish)}>永久删除</button></div></details> : <><button type="button" className="restore" onClick={() => toggleDish(dish)}>恢复菜品</button><button type="button" className="danger" onClick={() => deleteDish(dish)}>永久删除</button></>}</div>
                        </article>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>
              <form ref={dishFormRef} className="dish-form panel" onSubmit={submitDish}>
                <div className="panel-title"><div><span>{editingDish ? "EDIT DISH" : "NEW DISH"}</span><h2>{editingDish ? `编辑：${editingDish.name}` : "添加一道新菜"}</h2></div>{editingDish ? <button type="button" className="cancel-edit" onClick={cancelEditingDish}>取消编辑</button> : <small>保存后立即上架</small>}</div>
                <div className="dish-form-body">
                  <div className="field-grid">
                    <label><span>菜名 *</span><input name="name" required maxLength={40} placeholder="例如：糖醋小排" /></label>
                    <label className="category-edit-field"><span>菜品类型 *</span><select value={dishCategorySelection} onChange={(event) => { setDishCategorySelection(event.target.value); if (event.target.value !== "__custom__") setCustomDishCategory(""); }} required><option value="">请从已有类型中选择</option>{managedCategories.map((category) => <option value={category.name} key={`dish-form-${category.id}`}>{category.emoji || categoryEmoji[category.name] || "•"} {category.name}</option>)}<option value="__custom__">＋ 自定义新类型</option></select>{dishCategorySelection === "__custom__" && <input value={customDishCategory} onChange={(event) => setCustomDishCategory(event.target.value)} required maxLength={30} placeholder="输入新类型，例如：烧烤" aria-label="自定义菜品类型" />}<input type="hidden" name="category" value={dishCategorySelection === "__custom__" ? customDishCategory : dishCategorySelection} /><small>{dishCategorySelection === "__custom__" ? "保存后，这个新类型会自动加入上方类型管理。" : "只有选择“自定义新类型”后，才可以输入新的类型。"}</small></label>
                    <label><span>口味标签</span><input name="flavor" maxLength={30} placeholder="例如：酸甜 · 不辣" /></label>
                    <label><span>预计烹饪时间</span><div className="input-suffix"><input name="minutes" type="number" min="5" max="360" defaultValue="30" required /><b>分钟</b></div></label>
                    <label><span>原始配方参考几人</span><div className="input-suffix"><input name="baseServings" type="number" min="1" max="20" defaultValue="4" required /><b>人</b></div><small>仅记录菜谱原始分量的参考人数，不会按订单人数调整用料。</small></label>
                    <label><span>菜谱来源</span><input name="source" maxLength={80} placeholder="例如：食遇日记 · 村驴" /></label>
                    <label><span>操作难度</span><select name="difficulty" defaultValue="适中"><option>简单</option><option>适中</option><option>进阶</option></select></label>
                  </div>
                  <input name="substitutions" type="hidden" />
                  <fieldset className="dish-status-fieldset"><legend>菜单状态</legend><div><label><input name="available" type="checkbox" defaultChecked /><span>本期可做</span></label><label><input name="featured" type="checkbox" /><span>主厨推荐</span></label><label><input name="soldOut" type="checkbox" /><span>暂时售罄</span></label></div><small>推荐和售罄会显示在朋友端；归档请在上方菜谱库的“状态与归档”中操作。</small></fieldset>
                  <div className="field-grid tag-field-grid"><label><span>适合季节</span><input name="seasons" maxLength={120} placeholder="春季、夏季、秋冬" /></label><label><span>适合场景</span><input name="occasions" maxLength={120} placeholder="二人晚餐、朋友聚会、生日" /></label><label><span>饮食与过敏提示</span><input name="dietary" maxLength={160} placeholder="含花生、含乳制品、可做素食" /></label></div>
                  <div className="ai-copy-field wide-field"><label><span>菜品介绍</span><textarea name="description" maxLength={180} placeholder="简单介绍这道菜的味道、口感和特色…" /></label><button type="button" onClick={() => regenerateDishCopy("description")} disabled={copyGenerating !== null}>{copyGenerating === "description" ? "千问生成中…" : "千问再生成"}</button></div>
                  <div className="ai-copy-field wide-field"><label><span>点菜端 slogan</span><input name="slogan" maxLength={60} placeholder="例如：大人小孩都很难拒绝" /><small>显示在朋友点菜页菜名下方，可以随时改成自己的语气。</small></label><button type="button" onClick={() => regenerateDishCopy("slogan")} disabled={copyGenerating !== null}>{copyGenerating === "slogan" ? "千问生成中…" : "千问再生成"}</button></div>
                  <label className="wide-field"><span>菜谱要点</span><textarea name="recipeSummary" maxLength={240} placeholder="例如：先煎香再焖，最后大火收汁到能挂在食材表面。" /></label>
                  <label className="wide-field"><span>烹饪步骤</span><textarea className="steps-textarea" name="steps" maxLength={12000} placeholder={'每行填写一个步骤，例如：\n1. 大虾剪去虾须，开背去虾线\n2. 白菜切块，小火煸炒至变软'} /></label>

                  <fieldset className="photo-fieldset">
                    <legend>菜品照片</legend>
                    <div className="photo-options">
                      <ImageDropField name="image" className="upload-box" onChange={previewLocalImage} onNotice={setNotice}>
                        <span className="upload-icon">＋</span><strong>点击选择或拖入封面照片</strong><small>JPG、PNG、WebP 或 GIF，最大 6MB</small>
                      </ImageDropField>
                      <div className="or-divider"><span>或</span></div>
                      <label className={`network-photo ${networkPreviewState}`}><span>粘贴网络图片地址</span><input name="imageUrl" type="url" value={networkImageUrl} placeholder="https://example.com/dish.jpg" onChange={(event) => { const value = event.target.value; setNetworkImageUrl(value); if (value.trim()) setNetworkPreviewState("loading"); else { setNetworkPreviewState(""); setImagePreview((current) => current.startsWith("/api/image-preview?") ? "" : current); setAutoCropPending(false); } }} /><small>{networkPreviewState === "loading" ? "正在读取图片并生成实时预览…" : networkPreviewState === "ready" ? "✓ 图片已读取，保存时会裁切并转存到 NAS" : networkPreviewState === "error" ? "未能读取这张图片，请检查地址或换一张" : "请使用你有权使用的图片地址，粘贴后会自动预览"}</small></label>
                    </div>
                    <input name="imagePosition" type="hidden" value={serializeImageCrop(imageCrop)} readOnly />
                    <div className="cover-editor">
                      <div className="cover-editor-heading"><div><strong>封面真实裁切</strong><small>{cropMode === "auto" ? "已自动找到画面主体；保存时会按框内画面生成新封面" : cropMode === "manual" ? "已手动调整；保存时会真实裁出框内画面" : cropMode === "saved" ? "正在使用上次保存的取景；重新调整后会生成新封面" : "上传或粘贴图片后自动取景，保存时真正裁切"}</small></div><div><button type="button" onClick={() => applySmartCrop()} disabled={!imagePreview}>自动取景</button><button type="button" className="quiet" onClick={() => updateImageCrop(defaultImageCrop)} disabled={!imagePreview}>居中重置</button></div></div>
                      <div className={`cover-crop-frame ${imagePreview ? "has-image" : ""}`} onPointerDown={startCoverDrag} onPointerMove={moveCoverDrag} onPointerUp={finishCoverDrag} onPointerCancel={finishCoverDrag}>
                        {imagePreview ? <><img className="cover-crop-backdrop" src={imagePreview} alt="" aria-hidden="true" draggable={false} /><img className="cover-crop-image" ref={coverImageRef} src={imagePreview} alt="菜品封面取景预览" draggable={false} style={dishImageStyle(serializeImageCrop(imageCrop))} onLoad={(event) => handleCoverImageLoad(event.currentTarget)} onError={() => void handleCoverImageError()} /></> : <div><span>📷</span><small>{networkPreviewState === "loading" ? "正在读取网络图片…" : networkPreviewState === "error" ? "图片没有加载出来，请换一个地址" : "上传照片后在这里拖动画面"}</small></div>}
                        {imagePreview && <span className="crop-guide" aria-hidden="true" />}
                      </div>
                      <div className="cover-sliders">
                        <label><span>左右焦点</span><input type="range" min="0" max="100" step="1" value={Math.round(imageCrop.x)} onChange={(event) => updateImageCrop({ x: Number(event.target.value) })} /></label>
                        <label><span>上下焦点</span><input type="range" min="0" max="100" step="1" value={Math.round(imageCrop.y)} onChange={(event) => updateImageCrop({ y: Number(event.target.value) })} /></label>
                        <label><span>画面缩放（60%–220%）</span><input type="range" min="0.6" max="2.2" step="0.01" value={imageCrop.zoom} onChange={(event) => updateImageCrop({ zoom: Number(event.target.value) })} /><b>{Math.round(imageCrop.zoom * 100)}%</b></label>
                      </div>
                    </div>
                    <div className="photo-detail-row"><ImageDropField name="galleryImages" className="gallery-upload" multiple maximumFiles={4} onNotice={setNotice}><span>制作过程图</span><strong>点击选择，或把过程照片拖到这里</strong><small>最多 4 张；编辑时重新上传会替换原过程图</small></ImageDropField></div>
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

              </div>
            </>
          ) : chefView === "serving" ? (
            <section className="serving-workspace" aria-labelledby="serving-title">
              <section className="serving-hero panel"><div><span>STEP 04 · READY TO SERVE</span><h2 id="serving-title">通知开饭，再由你确认归档</h2><p>开饭提醒发出后，饭局仍会留在这里；等今晚真正结束，再确认归档并让朋友下次重新点菜。</p></div><div><strong>{servingOrders.length}</strong><small>场待处理</small></div></section>
              <div className="serving-grid">
                <section className="panel"><div className="panel-title"><div><span>READY & ARCHIVE</span><h2>等待通知与确认归档</h2></div><small>{servingReadyOrders.length} 待通知 · {pendingArchiveOrders.length} 待归档</small></div>{servingOrders.length === 0 ? <div className="empty"><span>🔔</span><strong>暂时没有待处理的饭局</strong><p>制作页点击“开始制作”后，订单会出现在这里。</p></div> : <div className="order-list serving-list">{servingOrders.map((order) => renderOrderCard(order))}</div>}</section>
                <section className="panel"><div className="panel-title"><div><span>RECENTLY ARCHIVED</span><h2>最近归档</h2></div><small>{recentDoneOrders.length} 场</small></div>{recentDoneOrders.length === 0 ? <div className="empty compact"><span>🍽️</span><p>确认归档后的饭局会出现在这里。</p></div> : <div className="order-list archived-list">{recentDoneOrders.map((order) => renderOrderCard(order, true))}</div>}{archivedOrders.length > recentDoneOrders.length && <section className="order-archive"><button type="button" className="order-archive-toggle" onClick={() => setArchiveOpen((value) => !value)} aria-expanded={archiveOpen}><span><b>全部订单归档</b><small>包含已完成和已取消的历史饭局</small></span><strong>{archivedOrders.length} 份 {archiveOpen ? "收起 ↑" : "查看 ↓"}</strong></button>{archiveOpen && <div className="order-list archived-list">{archivedOrders.map((order) => renderOrderCard(order, true))}</div>}</section>}</section>
              </div>
            </section>
          ) : chefView === "dataTransfer" ? (
            <section className="data-transfer-workspace" aria-labelledby="data-transfer-title">
              <section className="data-transfer-hero panel">
                <div><span>BACKUP & MIGRATION</span><h2 id="data-transfer-title">把整间小厨房带走</h2><p>导出或导入菜谱、分类、饭局、邀请、库存、餐桌日记和全部照片。导入失败会自动回滚，当前云端会话密钥不会被覆盖。</p></div>
                <div className="data-transfer-mark" aria-hidden="true">↔</div>
              </section>
              <div className="data-transfer-grid">
                <article className="data-transfer-card panel"><span className="data-transfer-icon">↓</span><div><span>EXPORT ALL DATA</span><h3>导出全部数据</h3><p>生成一个 ZIP 压缩包，包含 SQLite 业务数据与 uploads 下的所有原图、缩略图和元数据。适合从 NAS 下载保存。</p></div><button type="button" className="primary-button" onClick={() => void exportAllData()}>导出 ZIP <span>→</span></button></article>
                <article className="data-transfer-card panel"><span className="data-transfer-icon">↑</span><div><span>IMPORT BACKUP</span><h3>导入备份</h3><p>选择之前导出的 ZIP，整体替换当前业务数据和照片。导入前会自动备份当前 SQLite，SESSION_SECRET 等运行时密钥始终保留。</p></div><label className={`primary-button data-import-picker${dataImporting ? " is-loading" : ""}`}><input type="file" accept=".zip,application/zip" disabled={dataImporting} onChange={importAllData} />{dataImporting ? "正在导入…" : "选择 ZIP 导入"}<span>→</span></label></article>
              </div>
              <section className="data-transfer-notes panel"><strong>迁移前请确认</strong><ul><li>导入会替换当前菜谱、订单、邀请、采购和照片；请只选择可信的阿德小厨房导出包。</li><li>导入期间不要关闭页面或重启容器；完成后建议重新打开主厨工作台确认数据。</li><li>导出的压缩包可直接保存到电脑或 NAS，不包含密码、会话密钥和 API Key。</li></ul></section>
            </section>
          ) : chefView === "invitations" ? (
            <section className="invitation-workspace">
              {createdInvite && <section className="invite-created-success panel" role="status">
                <div><span>INVITATION READY</span><strong>邀请已经生成，复制下面的链接发给朋友</strong><p>{createdInvite.mode === "shared" ? "同一条链接可以发给这一桌所有朋友，大家会实时看到彼此选了什么。" : "朋友打开这条链接后，就能进入这场饭局的专属菜单。"}</p></div>
                <div className="invite-link-row"><input value={createdInviteUrl} readOnly aria-label="专属邀请链接" onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void copyInviteLink(createdInvite)}>复制链接</button></div>
                <div className="invite-created-actions"><button type="button" onClick={() => void shareInvite(createdInvite)}>分享给朋友</button><a href={`/invite/${createdInvite.token}`} target="_blank" rel="noreferrer">打开预览</a><button type="button" className="quiet" onClick={() => setCreatedInvite(null)}>收起</button></div>
              </section>}
              <form className="invite-creator panel" onSubmit={createInvite}>
                <div className="panel-title"><div><span>PRIVATE DINNER LINK</span><h2>生成一场专属饭局</h2></div><small>选菜 · 写话 · 分享</small></div>
                <div className="invite-fields">
                  <label><span>饭局名字</span><input name="title" required maxLength={48} placeholder="例如：周六来我家吃饭" /></label>
                  <label><span>日期</span><input name="mealDate" type="date" min={today} defaultValue={today} required /></label>
                  <label><span>邀请风格</span><select name="theme" defaultValue="warm"><option value="warm">温馨家常</option><option value="romance">二人世界</option><option value="fine">Fine Dinner</option><option value="festival">节日团圆</option></select></label>
                  <label><span>点菜方式</span><select name="mode" value={inviteMode} onChange={(event) => setInviteMode(event.target.value as "single" | "shared")}><option value="shared">多人共享一张单</option><option value="single">每人单独提交</option></select></label>
                  <label className="wide"><span>写给朋友的话</span><textarea name="message" maxLength={180} placeholder="例如：菜我来做，你只管带着好胃口来。" /></label>
                </div>
                {inviteMode === "shared" && <fieldset className="invite-category-picker"><legend>按类型开放菜品</legend><p>默认全部开放；取消勾选某个类型后，这场共享饭局里就不会显示该类型的菜。</p><div>{inviteCategoryOptions.map((category) => <label key={category}><input type="checkbox" checked={inviteCategorySelected(category)} onChange={(event) => toggleInviteCategory(category, event.currentTarget.checked)} /><span>{managedCategoryEmoji[category] || "•"} {category}</span><small>{inviteSelectableDishes.filter((dish) => dish.category === category).length} 道</small></label>)}</div></fieldset>}
                <fieldset className="invite-dish-picker"><legend>这次开放哪些菜</legend><div className="invite-dish-picker-head"><div className="invite-dish-tools"><input value={inviteDishQuery} onChange={(event) => setInviteDishQuery(event.target.value)} placeholder="搜索菜名、类型或介绍" aria-label="搜索共享饭局菜品" /><select value={inviteDishCategory} onChange={(event) => setInviteDishCategory(event.target.value)} aria-label="按菜品类型筛选"><option value="全部分类">全部分类</option>{inviteCategoryOptions.map((category) => <option value={category} key={`invite-filter-${category}`}>{managedCategoryEmoji[category] || "•"} {category}</option>)}</select></div><p>{inviteMode === "shared" ? "多人共享饭局默认跟随后台当前上架、可点的完整菜单；需要指定范围时，可一键全选后再取消个别菜。" : "单人邀请按这里勾选的菜开放；需要指定范围时，可一键全选后再取消个别菜。"}</p><button type="button" className="invite-all-toggle" onClick={toggleAllInviteDishes}>{allInviteDishesSelected ? "取消全选" : "一键全选当前可点菜"}</button></div><div>{filteredInviteDishes.map((dish) => <article key={dish.id}><label><input type="checkbox" name="dishIds" value={dish.id} checked={inviteMode === "shared" && !inviteSelectionTouched ? true : inviteSelectedDishIdSet.has(dish.id)} onChange={(event) => toggleInviteDish(dish.id, event.currentTarget.checked)} /><span>{dish.imageUrl ? <img src={dishThumbnailUrl(dish.imageUrl)} loading="lazy" decoding="async" alt="" /> : "🍽️"}<b>{dish.name}</b><small>{dish.category}</small></span></label><label className="recommend-check"><input type="checkbox" name="recommendedDishIds" value={dish.id} checked={inviteRecommendedDishIdSet.has(dish.id)} disabled={!(inviteMode === "shared" && !inviteSelectionTouched ? true : inviteSelectedDishIdSet.has(dish.id))} onChange={(event) => setInviteRecommendedDishIds((current) => event.currentTarget.checked ? Array.from(new Set([...current, dish.id])) : current.filter((id) => id !== dish.id))} />推荐</label></article>)}</div></fieldset>
                <button className="primary-button" disabled={inviteCreating}>{inviteCreating ? "正在生成邀请…" : "生成专属邀请"}<span>→</span></button>
              </form>

              <div className="invite-list panel">
                <div className="panel-title"><div><span>PRIVATE INVITATIONS</span><h2>我的专属邀请</h2></div><small>{invites.length} 场</small></div>
                {invites.length === 0 ? <div className="empty"><span>💌</span><strong>还没有专属饭局</strong><p>从左边挑几道菜，生成第一张只属于朋友的邀请。</p></div> : <div className="invite-cards">{invites.map((invite) => <article className={`invite-card theme-${invite.theme}${invite.active ? "" : " inactive"}`} key={invite.id}>
                    <div className="invite-card-head"><span>{invite.mealDate}</span><em>{invite.mode === "shared" ? "多人共享" : "单人邀请"} · {invite.active ? "邀请中" : "已结束"}</em></div>
                    <h3>{invite.title}</h3><p>{invite.message || "菜我来做，你只管来。"}</p>
                    <div className="invite-menu-preview">{invite.dishIds.map((id) => dishCatalog.find((dish) => dish.id === id)?.name).filter(Boolean).join(" · ")}</div>
                    <div className="invite-actions"><button onClick={() => shareInvite(invite)}>分享邀请</button><a href={`/invite/${invite.token}`} target="_blank">预览</a><button className="quiet" onClick={() => toggleInvite(invite)}>{invite.active ? "结束邀请" : "重新开放"}</button><button className="danger" onClick={() => void deleteInvite(invite)}>删除</button></div>
                  </article>)}</div>}
              </div>
            </section>
          ) : (
            <section className="journal-workspace" aria-labelledby="journal-title">
              <section className="journal-hero panel"><div><span>TABLE NOTES · OPTIONAL</span><h2 id="journal-title">餐桌日记，想写的时候再写</h2><p>每场已经通知开饭的饭局都会留在这里。没有必填、没有催促；值得记住的味道和笑话，饭后慢慢补上就好。</p></div><div><strong>{journals.length}</strong><small>篇已经留下</small></div></section>
              {completedOrders.length === 0 ? <div className="empty panel"><span>📖</span><strong>还没有可以记录的饭局</strong><p>订单点击“通知开饭”后，会自动出现在这里。</p></div> : <div className="journal-order-grid">{completedOrders.map((order) => {
                const journal = journals.find((item) => item.orderId === order.id || (!item.orderId && Boolean(order.inviteId) && item.inviteId === order.inviteId));
                const dishNames = parseDishSnapshot(order).map((dish) => dish.name).filter(Boolean);
                return <article className="journal-order-card panel" key={order.id}>
                  <header><div><span>{order.mealDate}</span><h3>{order.customerName}的这一桌</h3><p>{order.guestCount} 人 · {dishNames.length ? dishNames.join(" · ") : `${parseItems(order).length} 道菜`}</p></div><em>{journal ? "已经留下一页" : "想写再写"}</em></header>
                  <form className="journal-form" key={`${order.id}-${journal?.id || "new"}`} onSubmit={(event) => saveJournal(event, order)}>
                    <label><span>这一页叫什么</span><input name="title" defaultValue={journal?.title || `${order.mealDate}的餐桌日记`} maxLength={60} /></label>
                    <label><span>今晚想记住什么</span><textarea name="note" defaultValue={journal?.note || ""} maxLength={800} placeholder="最好吃的一道菜、最好笑的一句话，或者什么都不写也没关系…" /></label>
                    <ImageDropField name="images" className="journal-photo-upload" multiple maximumFiles={6} onNotice={setNotice}><span>餐桌照片</span><strong>点击选择，或把饭局照片拖到这里</strong><small>最多 6 张；新上传会替换原照片</small></ImageDropField>
                    {journal?.imageUrls.length ? <div className="journal-thumbs">{journal.imageUrls.map((url) => <img src={url} alt="饭局记录" key={url} />)}</div> : null}
                    <div className="journal-form-actions"><button type="submit">{journal ? "保存修改" : "留下这一页"}</button>{journal && <button type="button" className="danger" onClick={() => deleteJournal(journal)}>删除日记</button>}</div>
                  </form>
                </article>;
              })}</div>}
            </section>
          )}
        </section>
      )}

      {imageLightboxDish?.imageUrl && (
        <div className="dish-lightbox" onMouseDown={(event) => event.target === event.currentTarget && setImageLightboxDish(null)}>
          <section className="dish-lightbox-card" role="dialog" aria-modal="true" aria-labelledby="dish-lightbox-title">
            <button type="button" className="dish-lightbox-close" autoFocus onClick={() => setImageLightboxDish(null)} aria-label="关闭菜品大图">×</button>
            <div className="dish-lightbox-image" style={{ aspectRatio: imageLightboxAspect, width: `min(calc((100dvh - 160px) * ${imageLightboxAspect}), calc(100vw - 48px), 1080px)` }}><img src={imageLightboxDish.imageUrl} style={dishImageStyle(imageLightboxDish.imagePosition)} alt={`${imageLightboxDish.name}大图`} /></div>
            <div className="dish-lightbox-copy"><span>{imageLightboxDish.category}</span><h2 id="dish-lightbox-title">{imageLightboxDish.name}</h2><p>{imageLightboxDish.slogan || imageLightboxDish.description}</p></div>
          </section>
        </div>
      )}

      {cartOpen && (
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setCartOpen(false)}>
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="已选菜单">
            <button className="close" onClick={() => setCartOpen(false)} aria-label="关闭">×</button>
            <span className="eyebrow">YOUR HAPPY LITTLE MENU</span><h2>这顿想吃这些</h2>
            <div className="cart-lines">{cartItems.map((item) => <div key={item.id}><span className="mini-emoji">{item.imageUrl ? <img src={dishThumbnailUrl(item.imageUrl)} loading="lazy" decoding="async" alt="" /> : item.emoji}</span><span><strong>{item.name}</strong></span><div><button type="button" onClick={() => updateQuantity(item.id, -1)} aria-label={`减少${item.name}`}><span className="control-mark minus" aria-hidden="true" /></button><b>{item.quantity}</b><button type="button" onClick={() => updateQuantity(item.id, 1)} aria-label={`增加${item.name}`}><span className="control-mark plus" aria-hidden="true" /></button></div></div>)}</div>
            {activeInvite?.mode === "shared" && sharedDinner && <div className="shared-cart-summary"><strong>大家合计</strong>{sharedAggregateItems.map((item) => <span key={item.dishId}>{item.dish.name} × {item.quantity}</span>)}</div>}
            <p className="cart-hint">{activeInvite?.mode === "shared" ? "每位朋友都能看到这张汇总单；选好后由任意一位通知主厨。" : "眼光不错呀。提交后我会和你确认时间，再认真去买菜。"}</p>
            <button className="primary-button" onClick={() => setCheckoutOpen(true)}>{activeInvite?.mode === "shared" ? "通知主厨，汇总这一桌" : "把这顿饭约起来"} <span>→</span></button>
          </aside>
        </div>
      )}

      {checkoutOpen && (
        <div className="overlay checkout-overlay">
          <form className="checkout-card" onSubmit={submitOrder}>
            <button type="button" className="close" onClick={() => setCheckoutOpen(false)} aria-label="关闭">×</button>
            <span className="eyebrow">ALMOST DINNER TIME</span><h2>{activeInvite?.mode === "shared" ? "把大家的选择送进厨房" : "最后，把饭局约起来"}</h2><p>{activeInvite?.mode === "shared" ? "这一桌会按大家当前选好的菜汇总，任意一位朋友都可以通知主厨。" : "告诉我谁来、哪天来。你负责期待，我负责好吃。"}</p>
            <label><span>你的称呼</span><input name="customerName" required maxLength={30} placeholder="例如：小林" /></label>
            <div className="form-row"><label><span>想哪天吃</span><input name="mealDate" type="date" min={today} defaultValue={activeInvite?.mealDate || today} readOnly={Boolean(activeInvite)} required /></label><label><span>几个人</span><input name="guestCount" type="number" min="1" max="20" defaultValue="2" required /></label></div>
            <label><span>口味或忌口</span><textarea name="note" maxLength={200} placeholder="例如：少辣、不吃香菜，或者任何想说的话…" /></label>
            <button className="primary-button" disabled={submitting}>{submitting ? "正在提交…" : `确认点菜 · ${activeInvite?.mode === "shared" ? sharedAggregateItems.length : cartItems.length} 道 / ${activeInvite?.mode === "shared" ? sharedAggregatePortionCount : cartCount} 份`}<span>→</span></button>
          </form>
        </div>
      )}

      {orderSuccessOpen && orderProgressUrl && (
        <div className="overlay checkout-overlay">
          <section className="checkout-card order-success-dialog" role="dialog" aria-modal="true" aria-label="点菜成功">
            <button type="button" className="close" onClick={() => setOrderSuccessOpen(false)} aria-label="关闭">×</button>
            <div className="order-success-visual">
              <Image src="/chef-serving-wide.jpg" width={2200} height={1236} alt="阿德主厨端上为朋友认真准备的菜" />
              <span>THANK YOU FOR COMING</span>
            </div>
            <div className="order-success-mark" aria-hidden="true">✓</div>
            <span className="eyebrow">ORDER RECEIVED · 谢谢你来吃饭</span>
            <h2>谢谢你把这一顿，交给阿德。</h2>
            <p>你的点单已经稳稳送进厨房。从确认、买菜到开火，每一步都会在进度卡里告诉你。带着好胃口来，剩下的交给我。</p>
            <a className="primary-button" href={orderProgressUrl}>查看实时厨房进度 <span>→</span></a>
            <button type="button" className="order-success-secondary" onClick={() => setOrderSuccessOpen(false)}>继续看看菜单</button>
          </section>
        </div>
      )}

      {orderPendingDelete && (
        <div className="overlay checkout-overlay" onMouseDown={(event) => event.target === event.currentTarget && !orderDeleting && setOrderPendingDelete(null)}>
          <section className="checkout-card delete-order-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-order-title">
            <button type="button" className="close" disabled={orderDeleting} onClick={() => setOrderPendingDelete(null)} aria-label="关闭删除确认">×</button>
            <div className="delete-order-mark" aria-hidden="true">!</div>
            <span className="eyebrow">DELETE DINNER</span>
            <h2 id="delete-order-title">确定永久删除这场饭局？</h2>
            <p>“{orderPendingDelete.customerName}” · {orderPendingDelete.mealDate} · {statusLabel[orderPendingDelete.status]}</p>
            <div className="delete-order-warning">删除后，朋友原来的进度链接也会失效，饭局记录无法恢复。</div>
            <div className="delete-order-confirm-actions">
              <button type="button" className="order-delete-cancel" disabled={orderDeleting} onClick={() => setOrderPendingDelete(null)}>先保留</button>
              <button type="button" className="order-delete-confirm" disabled={orderDeleting} onClick={() => void deleteArchivedOrder(orderPendingDelete)}>{orderDeleting ? "正在删除…" : "永久删除"}</button>
            </div>
          </section>
        </div>
      )}

      {statusUpdateDraft && statusUpdateOrder && (
        <div className="overlay checkout-overlay chef-status-overlay" onMouseDown={(event) => event.target === event.currentTarget && !statusUpdating && setStatusUpdateDraft(null)}>
          <form className="checkout-card chef-status-dialog" onSubmit={(event) => { event.preventDefault(); void submitOrderStatusUpdate(); }}>
            <button type="button" className="close" disabled={statusUpdating} onClick={() => setStatusUpdateDraft(null)} aria-label="关闭状态推送">×</button>
            <div className={`chef-status-mark chef-status-mark-${statusUpdateDraft.status}`} aria-hidden="true">{statusUpdateDraft.status === "done" ? "🔔" : statusUpdateDraft.status === "cancelled" ? "⏸" : "→"}</div>
            <span className="eyebrow">KITCHEN UPDATE · 推送给朋友</span>
            <h2>{statusUpdateActionLabel[statusUpdateDraft.status]}</h2>
            <p className="chef-status-recipient">{statusUpdateOrder.customerName} 的饭局 · {statusUpdateOrder.mealDate}</p>
            <div className="chef-status-transition"><span>{statusLabel[statusUpdateOrder.status]}</span><b aria-hidden="true">→</b><strong>{statusLabel[statusUpdateDraft.status]}</strong></div>
            {statusUpdateDraft.status === "done" && <div className="chef-status-warning"><b>这会向朋友端发送强提醒</b><span>对方当前打开的进度页会立即弹出“开饭啦”提醒；饭局仍会保留，稍后再由你确认归档。</span></div>}
            <label className="chef-status-message"><div className="chef-status-message-head"><span>朋友端显示的提醒内容</span><button type="button" disabled={statusUpdating} onClick={() => setStatusUpdateDraft((current) => current ? { ...current, note: statusUpdateNotes[current.status] || "" } : current)}>恢复预设</button></div><textarea value={statusUpdateDraft.note} maxLength={180} onChange={(event) => setStatusUpdateDraft((current) => current ? { ...current, note: event.target.value } : current)} placeholder="写一句让朋友安心的话" /></label>
            <div className="chef-status-actions"><button type="button" className="quiet" disabled={statusUpdating} onClick={() => setStatusUpdateDraft(null)}>先不推送</button><button type="submit" disabled={statusUpdating}>{statusUpdating ? "正在发送…" : `${statusUpdateActionLabel[statusUpdateDraft.status]}并推送`}</button></div>
          </form>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
      <footer><span>阿德小厨房 · 私房菜单</span><p>愿每顿饭都有热气，也有惦记。</p></footer>
    </main>
  );
}
