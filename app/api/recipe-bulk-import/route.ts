import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chefApiGuard } from "../../chef-auth";
import { ensureMenuLibrary, getSqlite } from "../../../db";
import { getDataDir } from "../../../storage/paths";

const maxFileBytes = 2 * 1024 * 1024;
const maxRecipes = 500;
const ingredientTypes = new Set(["生鲜", "蔬菜", "调料", "其他"]);
const difficulties = new Set(["简单", "适中", "进阶"]);

type IngredientInput = { name?: unknown; amount?: unknown; unit?: unknown; type?: unknown };
type RecipeInput = Record<string, unknown>;
type NormalizedRecipe = {
  name: string;
  category: string;
  description: string;
  slogan: string;
  flavor: string;
  minutes: number;
  baseServings: number;
  ingredients: Array<{ name: string; amount: number; unit: string; type: string }>;
  steps: string[];
  source: string;
  difficulty: string;
  recipeSummary: string;
};

class ImportInputError extends Error {}

function cleanText(value: unknown, max: number, fallback = "") {
  return (typeof value === "string" ? value.trim() : fallback).slice(0, max);
}

function normalizeRecipe(value: unknown, index: number): NormalizedRecipe {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ImportInputError(`第 ${index + 1} 道菜格式无效`);
  const input = value as RecipeInput;
  const name = cleanText(input.name, 40);
  const category = cleanText(input.category, 30);
  if (!name || !category) throw new ImportInputError(`第 ${index + 1} 道菜缺少菜名或分类`);

  const rawIngredients = Array.isArray(input.ingredients) ? input.ingredients as IngredientInput[] : [];
  const ingredients = rawIngredients.map((item) => ({
    name: cleanText(item?.name, 40),
    amount: Number(item?.amount),
    unit: cleanText(item?.unit, 12),
    type: typeof item?.type === "string" && ingredientTypes.has(item.type) ? item.type : "其他",
  })).filter((item) => item.name && Number.isFinite(item.amount) && item.amount > 0 && item.unit);
  const steps = Array.isArray(input.steps)
    ? input.steps.filter((step): step is string => typeof step === "string").map((step) => step.trim().slice(0, 500)).filter(Boolean).slice(0, 30)
    : [];
  if (!ingredients.length) throw new ImportInputError(`“${name}”没有可导入的食材`);
  if (!steps.length) throw new ImportInputError(`“${name}”没有可导入的步骤`);

  return {
    name,
    category,
    description: cleanText(input.description, 180),
    slogan: cleanText(input.slogan, 60),
    flavor: cleanText(input.flavor, 30, "家常风味") || "家常风味",
    minutes: Math.min(360, Math.max(5, Math.round(Number(input.minutes) || 30))),
    baseServings: Math.min(20, Math.max(1, Math.round(Number(input.baseServings) || 4))),
    ingredients,
    steps,
    source: cleanText(input.source, 80, "批量导入") || "批量导入",
    difficulty: typeof input.difficulty === "string" && difficulties.has(input.difficulty) ? input.difficulty : "适中",
    recipeSummary: cleanText(input.recipeSummary, 240),
  };
}

async function readImportFile(file: File) {
  if (!file.size) throw new ImportInputError("请选择包含菜谱的 JSON 文件");
  if (file.size > maxFileBytes) throw new ImportInputError("批量导入文件不能超过 2MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new ImportInputError("文件不是有效的 UTF-8 文本，请重新导出 JSON"); }

  let payload: unknown;
  try { payload = JSON.parse(text); }
  catch { throw new ImportInputError("JSON 文件格式不正确，请检查后重新选择"); }
  const recipes = payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray((payload as { recipes?: unknown }).recipes)
    ? (payload as { recipes: unknown[] }).recipes
    : [];
  if (!recipes.length) throw new ImportInputError("文件中没有找到 recipes 菜谱列表");
  if (recipes.length > maxRecipes) throw new ImportInputError(`一次最多导入 ${maxRecipes} 道菜`);
  const normalized = recipes.map(normalizeRecipe);
  const duplicateNames = normalized.map((recipe) => recipe.name).filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length) throw new ImportInputError(`文件中有重名菜品：${Array.from(new Set(duplicateNames)).join("、")}`);
  return { recipes: normalized, fingerprint: createHash("sha256").update(bytes).digest("hex") };
}

function importPlan(recipes: NormalizedRecipe[]) {
  const existingNames = new Set((getSqlite().prepare("SELECT name FROM custom_dishes").all() as Array<{ name: string }>).map((row) => row.name));
  return {
    total: recipes.length,
    toInsert: recipes.filter((recipe) => !existingNames.has(recipe.name)).length,
    toUpdate: recipes.filter((recipe) => existingNames.has(recipe.name)).length,
    categories: Array.from(new Set(recipes.map((recipe) => recipe.category))),
    sampleNames: recipes.slice(0, 12).map((recipe) => recipe.name),
  };
}

async function importRecipes(recipes: NormalizedRecipe[]) {
  const sqlite = getSqlite();
  const backupDir = path.join(getDataDir(), "import-backups");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = `ade-kitchen-before-bulk-import-${stamp}.sqlite`;
  await sqlite.backup(path.join(backupDir, backupFile));

  const findDish = sqlite.prepare("SELECT id, category, sort_order AS sortOrder FROM custom_dishes WHERE name = ? ORDER BY created_at LIMIT 1");
  const updateDish = sqlite.prepare(`UPDATE custom_dishes SET
    category = @category, description = @description, slogan = @slogan, flavor = @flavor,
    minutes = @minutes, base_servings = @baseServings, ingredients = @ingredients,
    steps = @steps, source = @source, difficulty = @difficulty, recipe_summary = @recipeSummary,
    sort_order = @sortOrder
    WHERE id = @id`);
  const insertDish = sqlite.prepare(`INSERT INTO custom_dishes (
    id, name, category, description, slogan, flavor, minutes, base_servings,
    image_url, image_position, gallery, ingredients, steps, source,
    active, featured, available, sold_out, seasons, occasions, dietary,
    difficulty, recipe_summary, substitutions, sort_order
  ) VALUES (
    @id, @name, @category, @description, @slogan, @flavor, @minutes, @baseServings,
    '', 'center', '[]', @ingredients, @steps, @source,
    1, 0, 1, 0, '[]', '[]', '[]', @difficulty, @recipeSummary, '[]', @sortOrder
  )`);
  const insertCategory = sqlite.prepare("INSERT OR IGNORE INTO menu_categories (id, name, sort_order) VALUES (?, ?, ?)");
  const existingCategories = new Set((sqlite.prepare("SELECT name FROM menu_categories").all() as Array<{ name: string }>).map((row) => row.name));
  const nextSortOrderByCategory = new Map<string, number>();
  const nextDishOrder = (category: string) => {
    const existing = nextSortOrderByCategory.get(category);
    if (existing !== undefined) { nextSortOrderByCategory.set(category, existing + 1); return existing; }
    const next = Number((sqlite.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM custom_dishes WHERE category = ?").get(category) as { value: number }).value);
    nextSortOrderByCategory.set(category, next + 1);
    return next;
  };
  let nextCategoryOrder = Number((sqlite.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM menu_categories").get() as { value: number }).value) + 1;
  let inserted = 0;
  let updated = 0;

  const transaction = sqlite.transaction(() => {
    for (const recipe of recipes) {
      const row = { ...recipe, ingredients: JSON.stringify(recipe.ingredients), steps: JSON.stringify(recipe.steps) };
      const existing = findDish.get(recipe.name) as { id: string; category: string; sortOrder: number } | undefined;
      if (existing) {
        updateDish.run({ ...row, id: existing.id, sortOrder: existing.category === recipe.category ? existing.sortOrder : nextDishOrder(recipe.category) });
        updated += 1;
      } else {
        insertDish.run({ ...row, id: randomUUID(), sortOrder: nextDishOrder(recipe.category) });
        inserted += 1;
      }
      if (!existingCategories.has(recipe.category)) {
        insertCategory.run(randomUUID(), recipe.category, nextCategoryOrder);
        existingCategories.add(recipe.category);
        nextCategoryOrder += 1;
      }
    }
  });
  transaction();
  const totalDishes = Number((sqlite.prepare("SELECT COUNT(*) AS value FROM custom_dishes").get() as { value: number }).value);
  return { inserted, updated, totalDishes, backupFile };
}

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ImportInputError("请选择包含菜谱的 JSON 文件");
    const action = String(form.get("action") || "preview");
    if (action !== "preview" && action !== "import") throw new ImportInputError("无效的批量导入操作");
    await ensureMenuLibrary();
    const parsed = await readImportFile(file);
    const plan = importPlan(parsed.recipes);
    if (action === "preview") return Response.json({ preview: { ...plan, fingerprint: parsed.fingerprint, fileName: file.name } });

    const fingerprint = String(form.get("fingerprint") || "");
    if (!fingerprint || fingerprint !== parsed.fingerprint) throw new ImportInputError("文件与预览时不一致，请重新预览后再导入");
    const result = await importRecipes(parsed.recipes);
    return Response.json({ ok: true, result: { ...result, total: plan.total } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "批量导入失败，请稍后重试";
    return Response.json({ error: message }, { status: error instanceof ImportInputError ? 400 : 500 });
  }
}
