import { createHash, randomUUID } from "node:crypto";
import { chefApiGuard } from "../../chef-auth";
import { ensureMenuLibrary, getDb } from "../../../db";
import { customDishes, menuCategories } from "../../../db/schema";
import { eq, sql } from "drizzle-orm";

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

async function importPlan(recipes: NormalizedRecipe[]) {
  const existingRows = await getDb().select({ name: customDishes.name }).from(customDishes);
  const existingNames = new Set(existingRows.map((row) => row.name));
  return {
    total: recipes.length,
    toInsert: recipes.filter((recipe) => !existingNames.has(recipe.name)).length,
    toUpdate: recipes.filter((recipe) => existingNames.has(recipe.name)).length,
    categories: Array.from(new Set(recipes.map((recipe) => recipe.category))),
    sampleNames: recipes.slice(0, 12).map((recipe) => recipe.name),
  };
}

async function importRecipes(recipes: NormalizedRecipe[]) {
  const db = getDb();
  const existingDishes = await db.select().from(customDishes);
  const dishesByName = new Map(existingDishes.map((dish) => [dish.name, dish]));
  const categories = await db.select().from(menuCategories);
  const existingCategories = new Set(categories.map((category) => category.name));
  const nextSortOrderByCategory = new Map<string, number>();
  for (const category of categories) nextSortOrderByCategory.set(category.name, category.sortOrder);
  const maxDishOrders = await db.select({ category: customDishes.category, sortOrder: customDishes.sortOrder }).from(customDishes);
  for (const row of maxDishOrders) nextSortOrderByCategory.set(row.category, Math.max(nextSortOrderByCategory.get(row.category) ?? -1, row.sortOrder));
  let nextCategoryOrder = Math.max(-1, ...categories.map((category) => category.sortOrder)) + 1;
  let inserted = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const recipe of recipes) {
      const existing = dishesByName.get(recipe.name);
      const currentOrder = nextSortOrderByCategory.get(recipe.category) ?? -1;
      const sortOrder = existing && existing.category === recipe.category ? existing.sortOrder : currentOrder + 1;
      nextSortOrderByCategory.set(recipe.category, Math.max(currentOrder, sortOrder));
      const values = {
        name: recipe.name, category: recipe.category, description: recipe.description, slogan: recipe.slogan, flavor: recipe.flavor,
        minutes: recipe.minutes, baseServings: recipe.baseServings, ingredients: JSON.stringify(recipe.ingredients), steps: JSON.stringify(recipe.steps),
        source: recipe.source, difficulty: recipe.difficulty, recipeSummary: recipe.recipeSummary, sortOrder,
      };
      if (existing) {
        await tx.update(customDishes).set(values).where(eq(customDishes.id, existing.id));
        updated += 1;
      } else {
        await tx.insert(customDishes).values({ id: randomUUID(), ...values, imageUrl: "", imagePosition: "center", gallery: "[]", active: 1, featured: 0, available: 1, soldOut: 0, seasons: "[]", occasions: "[]", dietary: "[]", substitutions: "[]" });
        dishesByName.set(recipe.name, { ...values, id: "", imageUrl: "", imagePosition: "center", gallery: "[]", active: 1, featured: 0, available: 1, soldOut: 0, seasons: "[]", occasions: "[]", dietary: "[]", substitutions: "[]" } as typeof customDishes.$inferSelect);
        inserted += 1;
      }
      if (!existingCategories.has(recipe.category)) {
        await tx.insert(menuCategories).values({ id: randomUUID(), name: recipe.category, sortOrder: nextCategoryOrder });
        existingCategories.add(recipe.category);
        nextCategoryOrder += 1;
      }
    }
  });

  const [{ value: totalDishes }] = await db.select({ value: sql<number>`count(*)` }).from(customDishes);
  return { inserted, updated, totalDishes: Number(totalDishes), backupFile: null, database: "mysql" };
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
    const plan = await importPlan(parsed.recipes);
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
