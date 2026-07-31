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
  publishedMenu: string;
  publishedMenuUpdatedAt: string;
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
type DinnerInvite = { id: string; token: string; title: string; message: string; mealDate: string; theme: "warm" | "romance" | "fine" | "festival"; dishIds: string[]; recommendedDishIds: string[]; active: boolean; createdAt: string };
type DinnerJournal = { id: string; inviteId: string; orderId: string; title: string; note: string; imageUrls: string[]; updatedAt?: string; createdAt: string };
type RecipeScreenshot = { id: string; file: File; preview: string; rotation: 0 | 90 | 180 | 270 };
type ImageCrop = { x: number; y: number; zoom: number };
type BanquetCourse = "starter" | "main" | "staple" | "soup";
type BanquetItem = { dishId: string; course: BanquetCourse };
type BanquetTemplate = "home" | "romance" | "fine" | "spring" | "midautumn" | "birthday" | "housewarming" | "summer" | "christmas" | "brunch";
type ChefView = "accepting" | "shopping" | "cooking" | "serving" | "menuManager" | "invitations" | "journals";

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
  { id: "spring", name: "新春团圆", occasion: "春节 · 除夕", subtitle: "岁岁常欢愉，